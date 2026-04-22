/**
 * MowkowAdapter
 *
 * Phase 0 조사: `mowkow/main.py` 는 `KoreanArgumentParser` 기반으로,
 * 실행 대상 파일을 위치 인자로 받고 옵션 없이 호출하면 REPL 로 진입한다 (빈 줄 입력 시 종료).
 *
 * Resolver 가 반환하는 command/args 는 "python3 main.py" (config) 또는 "mk" (default-bin) 형태를
 * 포괄하므로, Adapter 는 다음만 추가한다:
 *   - 파일 경로를 마지막 위치 인자로 append
 *   - library_kor.scm 탐색 실패 방지를 위해 cwd 를 resolver.cwd 로 존중
 *   - UTF-8 강제 (PYTHONIOENCODING/PYTHONUTF8)
 */
import type { ResolvedBinary } from '@shared/types';
import type { InterpreterAdapter, SpawnConfig } from './types';

function baseEnv(resolved: ResolvedBinary): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    ...(resolved.env ?? {}),
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
  };
}

export const MowkowAdapter: InterpreterAdapter = {
  id: 'mowkow',

  buildRunFileSpawn(resolved, filePath): SpawnConfig {
    return {
      command: resolved.command,
      args: [...resolved.args, filePath],
      cwd: resolved.cwd,
      env: baseEnv(resolved),
    };
  },

  buildStartReplSpawn(resolved): SpawnConfig {
    return {
      command: resolved.command,
      args: [...resolved.args],
      cwd: resolved.cwd,
      env: baseEnv(resolved),
    };
  },
};
