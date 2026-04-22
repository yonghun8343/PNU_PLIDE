/**
 * 아카이브 해제 유틸.
 *
 * 두 가지 포맷을 지원:
 *   - `tar.gz` : 스트리밍 해제 (tar 패키지)
 *   - `zip`    : yauzl-promise (메모리 효율적 random access)
 *
 * 보안 주의:
 *   - zip/tar 는 "..", 절대경로, symlink 를 통해 destDir 밖으로 탈출할 수 있음 (Zip Slip, Tar Slip).
 *     → 모든 entry path 를 정규화 후 destDir 하위에 있는지 확인.
 *   - symlink 는 아예 무시 (linkpath 검증 부담 회피).
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve as pathResolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';
import { open as openZip } from 'yauzl-promise';

/**
 * 내부 전용 아카이브 포맷 구분자.
 * 현 단계(S3 + PyInstaller --onefile)에서는 'zip' 만 사용되지만,
 * 향후 tar.gz 배포로 전환할 여지를 두기 위해 함수 시그니처는 유지.
 */
export type ArchiveFormat = 'tar.gz' | 'zip';

export interface ExtractOptions {
  /** entrypoint 의 아카이브 내 상대경로. 해제 후 chmod +x 수행 용도. */
  entrypoint?: string;
}

export interface ExtractResult {
  /** 실제로 생성된 파일 수 */
  entries: number;
  /** destDir 기준 entrypoint 절대 경로 (있었을 경우만) */
  entrypointAbs?: string;
}

function sanitizeEntryPath(entryPath: string): string | null {
  // Windows 스타일 separator 를 POSIX 로 정규화 (tar 는 POSIX 경로를 쓰므로 대체로 무관).
  const norm = entryPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!norm || norm === '.' || norm.endsWith('/')) return null;
  if (isAbsolute(norm)) return null;
  // `..` 포함 여부는 최종 resolve 단계에서 destDir 경계로 재검증.
  return norm;
}

function ensureInsideDest(destDir: string, absTarget: string): boolean {
  const d = pathResolve(destDir) + sep;
  const t = pathResolve(absTarget);
  return t === pathResolve(destDir) || t.startsWith(d);
}

async function extractTarGz(srcPath: string, destDir: string): Promise<number> {
  let count = 0;
  await mkdir(destDir, { recursive: true });
  await pipeline(
    createReadStream(srcPath),
    tar.x({
      cwd: destDir,
      strict: false,
      // symlink/hardlink 는 보안상 건너뛴다.
      filter: (path, entry) => {
        const type = (entry as unknown as { type?: string }).type;
        if (type === 'SymbolicLink' || type === 'Link') return false;
        const safe = sanitizeEntryPath(path);
        if (!safe) return false;
        return ensureInsideDest(destDir, join(destDir, safe));
      },
      onentry: () => {
        count += 1;
      },
    }),
  );
  return count;
}

async function extractZip(srcPath: string, destDir: string): Promise<number> {
  await mkdir(destDir, { recursive: true });
  let count = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zip: any = await openZip(srcPath);
  try {
    // yauzl-promise v4: for-await over entries
    for await (const entry of zip) {
      const raw: string = entry.filename;
      const isDir: boolean = raw.endsWith('/');
      const safe = sanitizeEntryPath(raw);
      if (!safe) continue;
      const abs = join(destDir, safe);
      if (!ensureInsideDest(destDir, abs)) continue;
      if (isDir) {
        await mkdir(abs, { recursive: true });
        continue;
      }
      await mkdir(dirname(abs), { recursive: true });
      const readStream = await entry.openReadStream();
      await pipeline(readStream, createWriteStream(abs));
      count += 1;
    }
  } finally {
    await zip.close();
  }
  return count;
}

/**
 * 아카이브를 destDir 에 해제한다.
 * destDir 은 호출자가 사전에 "비어있는 임시 디렉토리" 로 준비하는 것을 권장.
 */
export async function extractArchive(
  format: ArchiveFormat,
  srcPath: string,
  destDir: string,
  opts: ExtractOptions = {},
): Promise<ExtractResult> {
  const entries =
    format === 'tar.gz' ? await extractTarGz(srcPath, destDir) : await extractZip(srcPath, destDir);

  let entrypointAbs: string | undefined;
  if (opts.entrypoint) {
    const safe = sanitizeEntryPath(opts.entrypoint);
    if (safe) {
      const abs = join(destDir, safe);
      if (ensureInsideDest(destDir, abs)) {
        entrypointAbs = abs;
        // POSIX 환경에서 entrypoint 실행 권한 보장 (tar 는 보통 유지하지만, zip 은 모드 없음).
        if (process.platform !== 'win32') {
          try {
            await chmod(abs, 0o755);
          } catch {
            /* ignore — 후속 검증 단계에서 재확인 */
          }
        }
      }
    }
  }

  return { entries, entrypointAbs };
}
