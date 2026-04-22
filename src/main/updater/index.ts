/**
 * Updater 오케스트레이터 (Phase 4-R, S3 per-interpreter manifest).
 *
 * 전체 흐름:
 *   1) 사용자 config 의 `updater.s3BaseUrl` (없으면 `DEFAULT_S3_BASE_URL`) 을 베이스로,
 *      활성 인터프리터마다 `<base>/<slug>/manifest.json` 을 병렬 fetch.
 *   2) 각 manifest 의 `latest_version` 과 로컬 version.txt 비교 (semver) + 현 플랫폼용
 *      artifact 존재 여부로 `available` 계산.
 *   3) UPDATE_APPLY 호출 시:
 *        · 해당 인터프리터의 manifest 재조회
 *        · `platforms['<platform>-<arch>']` 엔트리 선택 (+ x64 fallback)
 *        · `~/.pnu-pl-ide/cache/<id>-<ver>.zip` 로 스트리밍 다운로드 + SHA-256
 *        · checksum 불일치 → 파일 삭제 후 에러
 *        · `~/.pnu-pl-ide/cache/<id>-<ver>-staging-<ts>/` 에 zip 해제 (zip-slip 방지)
 *        · 해제된 트리 안에서 entrypoint(`mk` / `K-Prolog` / `*.exe`) 탐색
 *        · `~/.pnu-pl-ide/bin/<id>/` 를 atomic swap
 *            · 먼저 `<bin-dir>.old-<ts>` 로 rename
 *            · staging 을 `<bin-dir>` 로 rename
 *            · 실패 시 rollback (old → 원위치)
 *            · 성공 시 old 비동기 삭제
 *        · version.txt 기록
 *   4) 진행률은 `UpdateProgress` 콜백으로 main→renderer 푸시.
 *
 * 동시 실행 방지:
 *   - 같은 interpreter 에 대해 활성 세션이 있으면 거부 (Windows 에서 덮어쓰기 실패 방지)
 *   - in-flight apply 는 Map 으로 동시 호출 차단
 */
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type {
  InterpreterId,
  InterpreterManifest,
  InterpreterManifestPlatform,
  PlatformKey,
  UpdateApplyResult,
  UpdateCheckEntry,
  UpdateCheckResult,
  UpdateProgress,
  UpdaterArch,
  UpdaterPlatform,
} from '@shared/types';
import { INTERPRETERS } from '@shared/types';
import {
  DEFAULT_S3_BASE_URL,
  ENTRYPOINT_NAME,
  buildManifestUrl,
  loadIdeConfig,
} from '../config';
import { defaultBinDirFor, defaultBinRootDir } from '../interpreters/paths';
import { hasActiveSession } from '../interpreters/runner';
import { downloadFile, fetchJson } from './http';
import { extractArchive } from './extract';
import { cacheDir } from './paths';
import { isUpdateAvailable } from './semver';
import { readInstalledVersion, writeInstalledVersion } from './version-file';

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

function currentPlatform(): UpdaterPlatform {
  if (process.platform === 'win32') return 'win32';
  if (process.platform === 'darwin') return 'darwin';
  return 'linux';
}

function currentArch(): UpdaterArch {
  if (process.arch === 'arm64') return 'arm64';
  if (process.arch === 'ia32') return 'ia32';
  return 'x64';
}

function currentPlatformKey(): PlatformKey {
  return `${currentPlatform()}-${currentArch()}`;
}

function pickPlatformEntry(
  platforms: InterpreterManifest['platforms'],
): { key: PlatformKey; entry: InterpreterManifestPlatform } | null {
  const plat = currentPlatform();
  const arch = currentArch();
  const primaryKey = `${plat}-${arch}` as PlatformKey;
  const primary = platforms[primaryKey];
  if (primary) return { key: primaryKey, entry: primary };
  // x64 fallback (Apple Silicon → Rosetta Intel 실행 등 대응)
  if (arch !== 'x64') {
    const fbKey = `${plat}-x64` as PlatformKey;
    const fb = platforms[fbKey];
    if (fb) return { key: fbKey, entry: fb };
  }
  return null;
}

function expectedEntrypointName(id: InterpreterId): string {
  const table = ENTRYPOINT_NAME[id];
  return process.platform === 'win32' ? table.win32 : table.posix;
}

// ---------------------------------------------------------------------------
// Runtime config
// ---------------------------------------------------------------------------

export interface UpdaterRuntimeConfig {
  s3BaseUrl: string;
  insecureTLS: boolean;
  autoCheck: boolean;
  /** config.json 으로부터 명시적으로 지정됐는지 여부 (진단용) */
  explicit: boolean;
}

export async function loadUpdaterConfig(): Promise<UpdaterRuntimeConfig> {
  const cfg = await loadIdeConfig();
  const u = cfg.ok ? cfg.data?.updater ?? {} : {};
  const explicit = !!u.s3BaseUrl;
  return {
    s3BaseUrl: (u.s3BaseUrl ?? DEFAULT_S3_BASE_URL).trim(),
    insecureTLS: !!u.insecureTLS,
    autoCheck: u.autoCheck !== false,
    explicit,
  };
}

// ---------------------------------------------------------------------------
// Manifest fetch per interpreter
// ---------------------------------------------------------------------------

interface FetchedManifest {
  id: InterpreterId;
  url: string;
  ok: true;
  manifest: InterpreterManifest;
}
interface FailedManifest {
  id: InterpreterId;
  url: string;
  ok: false;
  message: string;
}
type ManifestFetchResult = FetchedManifest | FailedManifest;

async function fetchOneManifest(
  id: InterpreterId,
  runtime: UpdaterRuntimeConfig,
): Promise<ManifestFetchResult> {
  const url = buildManifestUrl(runtime.s3BaseUrl, id);
  try {
    const manifest = await fetchJson<InterpreterManifest>(url, {
      insecureTLS: runtime.insecureTLS,
    });
    // 최소한의 스키마 검증
    if (typeof manifest.latest_version !== 'string' || typeof manifest.platforms !== 'object') {
      return { id, url, ok: false, message: 'manifest schema 불일치 (latest_version/platforms 누락)' };
    }
    return { id, url, ok: true, manifest };
  } catch (err) {
    return { id, url, ok: false, message: (err as Error).message ?? String(err) };
  }
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const now = new Date().toISOString();
  const runtime = await loadUpdaterConfig();

  // 각 인터프리터 manifest 를 병렬 fetch. 일부 실패해도 나머지는 계속.
  const results = await Promise.all(
    INTERPRETERS.map((m) => fetchOneManifest(m.id, runtime)),
  );

  const entries: UpdateCheckEntry[] = [];
  for (const r of results) {
    const installed = await readInstalledVersion(r.id);
    if (!r.ok) {
      entries.push({
        interpreterId: r.id,
        latestVersion: null,
        installedVersion: installed,
        available: false,
        artifactAvailable: false,
        reason: `manifest fetch 실패: ${r.message}`,
      });
      continue;
    }
    const picked = pickPlatformEntry(r.manifest.platforms);
    const latest = r.manifest.latest_version;
    const available = isUpdateAvailable(installed, latest) && !!picked;
    entries.push({
      interpreterId: r.id,
      latestVersion: latest,
      installedVersion: installed,
      available,
      artifactAvailable: !!picked,
      reason: !picked
        ? `현재 플랫폼(${currentPlatformKey()}) 용 artifact 없음`
        : undefined,
    });
  }

  return {
    fetchedAt: now,
    s3BaseUrl: runtime.s3BaseUrl,
    entries,
  };
}

// ---------------------------------------------------------------------------
// Apply (download → verify → extract → swap)
// ---------------------------------------------------------------------------

export type ProgressReporter = (p: UpdateProgress) => void;

const inFlight = new Map<InterpreterId, Promise<UpdateApplyResult>>();

export async function applyUpdate(
  id: InterpreterId,
  report: ProgressReporter = () => {},
): Promise<UpdateApplyResult> {
  const existing = inFlight.get(id);
  if (existing) return existing;
  const p = applyUpdateInternal(id, report).finally(() => {
    inFlight.delete(id);
  });
  inFlight.set(id, p);
  return p;
}

async function applyUpdateInternal(
  id: InterpreterId,
  report: ProgressReporter,
): Promise<UpdateApplyResult> {
  const pushErr = (message: string): never => {
    report({ interpreterId: id, phase: 'error', message });
    throw new Error(message);
  };

  if (hasActiveSession(id)) {
    pushErr(`${id} 인터프리터가 실행 중입니다. 먼저 세션을 종료해주세요.`);
  }

  report({ interpreterId: id, phase: 'fetching-manifest' });
  const runtime = await loadUpdaterConfig();
  const fetched = await fetchOneManifest(id, runtime);
  if (!fetched.ok) pushErr(`manifest fetch 실패: ${fetched.message}`);
  const manifest = (fetched as FetchedManifest).manifest;

  const picked = pickPlatformEntry(manifest.platforms);
  if (!picked) pushErr(`현재 플랫폼(${currentPlatformKey()}) 용 artifact 없음.`);
  const { entry } = picked!;

  const version = manifest.latest_version;
  const binDir = defaultBinDirFor(id);
  const binRoot = defaultBinRootDir();
  const cache = cacheDir();
  await mkdir(cache, { recursive: true });
  await mkdir(binRoot, { recursive: true });

  // S3 artifact 는 현 단계에서 항상 zip (PyInstaller --onefile + actions/upload-artifact)
  const downloadPath = join(cache, `${id}-${version}.zip`);
  const stagingDir = join(cache, `${id}-${version}-staging-${Date.now()}`);

  // --- 1) 다운로드 ---
  report({ interpreterId: id, phase: 'downloading', bytes: 0 });
  let shaActual: string;
  try {
    const res = await downloadFile(entry.url, downloadPath, {
      insecureTLS: runtime.insecureTLS,
      onProgress: (bytes, total) => {
        report({ interpreterId: id, phase: 'downloading', bytes, total });
      },
    });
    shaActual = res.sha256;
  } catch (err) {
    await safeRm(downloadPath);
    pushErr(`download 실패: ${(err as Error).message}`);
  }

  // --- 2) 검증 ---
  report({ interpreterId: id, phase: 'verifying' });
  const expected = (entry.checksum ?? '').toLowerCase();
  if (!expected || shaActual!.toLowerCase() !== expected) {
    await safeRm(downloadPath);
    pushErr(`SHA-256 불일치. 기대: ${expected || '(없음)'}, 실제: ${shaActual!}`);
  }

  // --- 3) 해제 ---
  report({ interpreterId: id, phase: 'extracting' });
  await mkdir(stagingDir, { recursive: true });
  try {
    await extractArchive('zip', downloadPath, stagingDir, {
      entrypoint: expectedEntrypointName(id),
    });
  } catch (err) {
    await safeRm(stagingDir);
    await safeRm(downloadPath);
    pushErr(`archive 해제 실패: ${(err as Error).message}`);
  }

  // PyInstaller --onefile 의 zip 구조는 root 에 단일 바이너리가 위치.
  // 실제 위치를 탐색하고, 존재하지 않으면 에러.
  const expectedName = expectedEntrypointName(id);
  const stagedEntrypoint = await locateEntrypoint(stagingDir, expectedName);
  if (!stagedEntrypoint) {
    await safeRm(stagingDir);
    await safeRm(downloadPath);
    pushErr(`entrypoint 누락: ${expectedName} (zip 구조를 확인해주세요)`);
  }

  // --- 4) 설치 swap ---
  report({ interpreterId: id, phase: 'installing' });
  const tsTag = Date.now().toString(36);
  const backup = `${binDir}.old-${tsTag}`;
  let backedUp = false;

  try {
    await mkdir(dirname(binDir), { recursive: true });
    if (await pathExists(binDir)) {
      await rename(binDir, backup);
      backedUp = true;
    }
    await rename(stagingDir, binDir);
  } catch (err) {
    // rollback
    try {
      if (backedUp && (await pathExists(backup)) && !(await pathExists(binDir))) {
        await rename(backup, binDir);
      }
    } catch {
      /* ignore */
    }
    await safeRm(stagingDir);
    await safeRm(downloadPath);
    pushErr(`설치 경로 교체 실패: ${(err as Error).message}`);
  }

  // version.txt 기록
  try {
    await writeInstalledVersion(id, version);
  } catch (err) {
    // 설치 자체는 됐지만 version 기록 실패 → 경고로 처리.
    report({
      interpreterId: id,
      phase: 'installing',
      message: `version.txt 기록 실패: ${(err as Error).message}`,
    });
  }

  // 후처리: 백업/캐시 정리 (실패해도 에러 아님).
  await safeRm(downloadPath);
  if (backedUp) await safeRm(backup);

  report({ interpreterId: id, phase: 'done', message: version });
  return {
    interpreterId: id,
    version,
    entrypointPath: join(binDir, expectedName),
  };
}

/**
 * PyInstaller --onefile 아카이브는 일반적으로 단일 파일을 root 에 둔다.
 * GitHub Actions `actions/upload-artifact@v4` 는 `path: dist/*` 기준으로 zip 화하므로
 * 1) `<staging>/<expectedName>` 이 그대로 있거나
 * 2) 단일 서브디렉토리(예: `<staging>/mk/<expectedName>`) 안에 있을 수 있음.
 * 두 경우를 모두 커버.
 */
async function locateEntrypoint(stagingDir: string, expectedName: string): Promise<string | null> {
  const direct = join(stagingDir, expectedName);
  if (await isFile(direct)) return direct;

  // 1 단계 하위 디렉토리 탐색
  let entries: string[] = [];
  try {
    entries = await readdir(stagingDir);
  } catch {
    return null;
  }
  for (const name of entries) {
    const inner = join(stagingDir, name, expectedName);
    if (await isFile(inner)) return inner;
  }
  return null;
}

async function isFile(p: string): Promise<boolean> {
  try {
    const st = await stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Cache cleanup (startup maintenance)
// ---------------------------------------------------------------------------

/** `~/.pnu-pl-ide/cache/*.old-*` / 고아 staging 디렉토리를 제거. */
export async function cleanupStaleArtifacts(): Promise<void> {
  const roots = [cacheDir(), defaultBinRootDir()];
  for (const root of roots) {
    let entries: string[] = [];
    try {
      entries = await readdir(root);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (/-staging-\d+$/.test(name) || /\.old-[0-9a-z]+$/.test(name)) {
        await safeRm(join(root, name));
      }
    }
  }
  // 기타 tmpdir 에 남은 우리 흔적은 tmpdir() 정책에 맡기고 신경쓰지 않는다.
  void tmpdir;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function safeRm(p: string): Promise<void> {
  try {
    await rm(p, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
