/**
 * KobasicAdapter
 *
 * Phase 0 조사: `kobasic` 은 C++ 로 빌드된 단일 실행 파일로, 위치 인자로 .kob 파일을 받는다.
 * REPL 모드는 인자 없이 실행 (종료 명령은 "끝").
 *
 * 주의:
 *   - 원 소스의 `#include <windows.h>` 는 향후 사용자가 수정 예정. 현재 macOS/Linux 빌드는 실패할 수 있으므로
 *     config.json 으로 플랫폼별 바이너리를 따로 지정하는 것을 권장.
 *   - 바이너리 구동 시 stdout 은 line-buffered 가 아닐 수 있으므로 C++ 측에서 `std::cout << std::flush` 가 없다면
 *     출력이 지연될 수 있음. Phase 3 에서는 이 문제를 UI/환경 레벨에서 해결하지 않음.
 */
import type { InterpreterAdapter, SpawnConfig } from './types';

function baseEnv(override?: Readonly<Record<string, string>>): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    ...(override ?? {}),
  };
}

export const KobasicAdapter: InterpreterAdapter = {
  id: 'kobasic',

  buildRunFileSpawn(resolved, filePath): SpawnConfig {
    return {
      command: resolved.command,
      args: [...resolved.args, filePath],
      cwd: resolved.cwd,
      env: baseEnv(resolved.env),
    };
  },

  buildStartReplSpawn(resolved): SpawnConfig {
    return {
      command: resolved.command,
      args: [...resolved.args],
      cwd: resolved.cwd,
      env: baseEnv(resolved.env),
    };
  },
};
