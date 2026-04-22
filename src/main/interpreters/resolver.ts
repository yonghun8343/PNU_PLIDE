/**
 * Hybrid Binary Resolver
 * ---------------------------------------------------------------
 * 해석 우선순위:
 *   1) ~/.pnu-pl-ide/config.json 의 `binaries.<id>` 에 설정된 command/args/cwd/env
 *   2) 기본 폴더 ~/.pnu-pl-ide/bin/<id>/ 아래의 표준 실행 파일명 (플랫폼별)
 *
 * 둘 다 실패하면 ResolveBinaryError 를 반환하여 renderer 가 사용자에게
 * "설정 파일을 열거나 인터프리터를 다운로드하세요" 안내를 띄울 수 있게 한다.
 *
 * 주의:
 *   - Phase 3 시점에서는 인터프리터 자동 다운로드(Phase 4) 가 없으므로,
 *     BINARY_NOT_FOUND 가 자주 발생할 수 있다. 반드시 "hints" 에 기본 경로를 포함.
 *   - `command` 가 절대경로면 존재 여부를 확인하고, 상대 명령(예: "python3") 이면
 *     PATH 탐색은 OS 에 맡기고 존재 검증은 생략한다.
 */
import { access, stat } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type {
  InterpreterId,
  ResolveBinaryError,
  ResolveBinaryResponse,
  ResolvedBinary,
} from '@shared/types';
import { configJsonPath, defaultBinDirFor, defaultBinRootDir } from './paths';
import { loadIdeConfig, ENTRYPOINT_NAME, type ConfigBinaryEntry } from '../config';

// ---------------------------------------------------------------------------
// Default binary name table
// ---------------------------------------------------------------------------
//
// Updater 와의 단일 진실 공급원 유지를 위해 `ENTRYPOINT_NAME` 을 재사용한다.
// GHA `--name` 플래그와 정확히 일치:
//   mowkow  → mk  / mk.exe
//   kprolog → K-Prolog / K-Prolog.exe   (주의: PascalCase + hyphen)
//   kobasic → kobasic / kobasic.exe     (dormant)

function defaultBinaryFullPath(id: InterpreterId): string {
  const names = ENTRYPOINT_NAME[id];
  const name = process.platform === 'win32' ? names.win32 : names.posix;
  return join(defaultBinDirFor(id), name);
}

// ---------------------------------------------------------------------------
// Existence / executable checks
// ---------------------------------------------------------------------------

async function isExistingFile(p: string): Promise<boolean> {
  try {
    const st = await stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

async function isExecutable(p: string): Promise<boolean> {
  try {
    await access(p, FS.X_OK);
    return true;
  } catch {
    // Windows 에서는 X_OK 가 파일 확장자 기준이라 신뢰할 수 없음 → 존재하면 OK
    if (process.platform === 'win32') return isExistingFile(p);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Config entry validation
// ---------------------------------------------------------------------------

async function fromConfigEntry(
  entry: ConfigBinaryEntry,
): Promise<ResolvedBinary | ResolveBinaryError> {
  if (!entry.command || typeof entry.command !== 'string') {
    return {
      ok: false,
      code: 'CONFIG_PARSE_ERROR',
      message: 'config.json 의 command 필드가 비어있습니다.',
    };
  }

  // 절대경로 → 실존/실행 권한 확인, 상대경로/명령 → PATH 에 위임
  if (isAbsolute(entry.command)) {
    if (!(await isExistingFile(entry.command))) {
      return {
        ok: false,
        code: 'BINARY_NOT_FOUND',
        message: `config.json 에 지정된 실행 파일을 찾을 수 없습니다: ${entry.command}`,
        hints: [configJsonPath()],
      };
    }
    if (!(await isExecutable(entry.command))) {
      return {
        ok: false,
        code: 'BINARY_NOT_EXECUTABLE',
        message: `실행 권한이 없습니다: ${entry.command}`,
        hints: [`chmod +x "${entry.command}" 을 실행하세요.`],
      };
    }
  }

  return {
    command: entry.command,
    args: Array.isArray(entry.args) ? [...entry.args] : [],
    cwd: entry.cwd,
    env: entry.env ? { ...entry.env } : undefined,
    origin: 'config',
  };
}

// ---------------------------------------------------------------------------
// 기본 bin 폴더 해석
// ---------------------------------------------------------------------------

async function fromDefaultBin(id: InterpreterId): Promise<ResolvedBinary | ResolveBinaryError> {
  const full = defaultBinaryFullPath(id);
  if (!(await isExistingFile(full))) {
    return {
      ok: false,
      code: 'BINARY_NOT_FOUND',
      message: `${id} 인터프리터를 찾을 수 없습니다.`,
      hints: [
        `기본 경로: ${full}`,
        `또는 config.json (${configJsonPath()}) 에 직접 경로를 지정하세요.`,
      ],
    };
  }
  if (!(await isExecutable(full))) {
    return {
      ok: false,
      code: 'BINARY_NOT_EXECUTABLE',
      message: `실행 권한이 없습니다: ${full}`,
      hints: process.platform === 'win32' ? [] : [`chmod +x "${full}" 을 실행하세요.`],
    };
  }
  return {
    command: full,
    args: [],
    origin: 'default-bin',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 지정된 인터프리터의 실행 바이너리를 해석한다.
 * Adapter 가 반환한 `extraArgs` 는 이 함수의 결과에 이어붙여 실제 spawn 인자를 구성한다.
 */
export async function resolveBinary(id: InterpreterId): Promise<ResolveBinaryResponse> {
  const cfg = await loadIdeConfig();
  if (!cfg.ok) {
    return { ok: false, code: 'CONFIG_PARSE_ERROR', message: cfg.message };
  }

  const entry = cfg.data?.binaries?.[id];
  if (entry && entry.command) {
    const viaConfig = await fromConfigEntry(entry);
    if ('origin' in viaConfig) {
      return { ok: true, resolved: viaConfig };
    }
    // 명시적으로 config 가 있으나 실패 → fallback 하지 않고 에러 노출 (의도 보존)
    return viaConfig;
  }

  const viaDefault = await fromDefaultBin(id);
  if ('origin' in viaDefault) {
    return { ok: true, resolved: viaDefault };
  }
  return viaDefault;
}

/** UI/진단용 경로 정보. */
export function resolverPaths(): { configJson: string; defaultBinRoot: string } {
  return {
    configJson: configJsonPath(),
    defaultBinRoot: defaultBinRootDir(),
  };
}
