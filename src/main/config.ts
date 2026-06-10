/**
 * ~/.pnu-pl-ide/config.json 스키마 및 공통 loader.
 *
 * 여러 main-process 서브시스템(Resolver, Updater 등)에서 공유.
 *
 * Phase 4-R:
 *   - 자체 HTTPS 로 centralize 되어 있던 manifestUrl 스킴을 S3 per-interpreter 로 교체.
 *   - `updater.s3BaseUrl` 한 값으로부터 `<base>/<slug>/manifest.json` 을 조립.
 *   - 하위 호환을 위해 legacy `manifestUrl` 필드가 있으면 읽어서 경고는 내되, 새 스킴을 강제.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { InterpreterId } from '@shared/types';
import { configJsonPath } from './interpreters/paths';

export interface ConfigBinaryEntry {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface ConfigUpdaterSection {
  /**
   * S3 bucket 루트 URL. 비어 있거나 누락되면 내장 DEFAULT_S3_BASE_URL 사용.
   * 예: https://hun-798287138671-ap-northeast-2-an.s3.ap-northeast-2.amazonaws.com/
   */
  s3BaseUrl?: string;
  /** 앱 기동 시 자동으로 check 수행 여부 (기본 true) */
  autoCheck?: boolean;
  /** 자기서명 인증서 허용 여부 — S3 공개 버킷에서는 사실상 불필요하나 사내 프록시 대응용으로 유지 */
  insecureTLS?: boolean;
  /**
   * Deprecated. 과거 centralized manifest URL. 새 스킴에서는 사용되지 않는다.
   * 파싱만 하고 무시.
   */
  manifestUrl?: string;
}

export interface IdeConfigFile {
  binaries?: Partial<Record<InterpreterId, ConfigBinaryEntry>>;
  updater?: ConfigUpdaterSection;
  /** 마지막으로 열기 다이얼로그에서 선택한 디렉토리. IDE 런타임이 기록, 사용자가 수동 편집 가능. */
  lastOpenDir?: string;
}

export type LoadConfigResult =
  | { ok: true; data: IdeConfigFile | null }
  | { ok: false; message: string };

/**
 * 연구실 기본 S3 버킷. 사용자가config.json 을 전혀 건드리지 않더라도
 * IDE 는 이 URL 로부터 updater 를 구동한다 (zero-config 원칙).
 */
export const DEFAULT_S3_BASE_URL =
  'https://hun-798287138671-ap-northeast-2-an.s3.ap-northeast-2.amazonaws.com/';

/**
 * InterpreterId → S3 폴더명(slug). 대소문자/하이픈 보존.
 * K-Prolog 는 레포/빌드명 모두 PascalCase 이므로 S3 에서도 동일하게 사용한다.
 */
export const S3_SLUG: Readonly<Record<InterpreterId, string>> = {
  mowkow: 'mowkow',
  kobasic: 'kobasic',
  kprolog: 'K-Prolog',
};

/**
 * 빌드 산출 바이너리 이름. GHA workflow 의 산출물 이름과 정확히 일치해야 한다.
 *
 *   mowkow  → PyInstaller `--name mk`
 *   kprolog → PyInstaller `--name K-Prolog`
 *   kobasic → g++ `-o kobasic` (C++ source build)
 */
export const ENTRYPOINT_NAME: Readonly<
  Record<InterpreterId, { readonly posix: string; readonly win32: string }>
> = {
  mowkow: { posix: 'mk', win32: 'mk.exe' },
  kobasic: { posix: 'kobasic', win32: 'kobasic.exe' },
  kprolog: { posix: 'K-Prolog', win32: 'K-Prolog.exe' },
};

export async function loadIdeConfig(): Promise<LoadConfigResult> {
  const p = configJsonPath();
  try {
    const raw = await readFile(p, 'utf-8');
    const parsed = JSON.parse(raw) as IdeConfigFile;
    return { ok: true, data: parsed };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return { ok: true, data: null };
    return { ok: false, message: `config.json 파싱 실패 (${p}): ${e.message ?? String(e)}` };
  }
}

/**
 * config.json 의 일부 필드를 덮어쓴다 (나머지 필드는 보존).
 * 파일이 없으면 새로 생성하고, 있으면 읽어서 patch 를 merge 한 뒤 저장.
 */
export async function updateIdeConfig(patch: Partial<IdeConfigFile>): Promise<void> {
  const p = configJsonPath();
  let existing: IdeConfigFile = {};
  try {
    existing = JSON.parse(await readFile(p, 'utf-8')) as IdeConfigFile;
  } catch {
    /* 파일 없음 — 신규 생성 */
  }
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify({ ...existing, ...patch }, null, 2), 'utf-8');
}

/**
 * 주어진 인터프리터의 manifest URL 을 조립.
 * s3BaseUrl 이 `/` 로 끝나는지 여부와 관계없이 정규화한다.
 */
export function buildManifestUrl(baseUrl: string, interpreterId: InterpreterId): string {
  const slug = S3_SLUG[interpreterId];
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}${slug}/manifest.json`;
}
