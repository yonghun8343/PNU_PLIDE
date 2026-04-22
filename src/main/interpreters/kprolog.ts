/**
 * KPrologAdapter
 *
 * Phase 0 조사: `K-Prolog/main.py` 는 실행 즉시 stdio 를 UTF-8 로 reconfigure 하고
 * CONSOLE.repl.read_multi_line_input() 을 호출한다. 입력은 `.` 로 끝나야 한다.
 *
 * 제약 사항 (사용자 수용):
 *   - needsPty=true 이지만 node-pty 없이 pipe 모드로만 동작.
 *   - 이 경우 `?- ` 프롬프트가 즉시 flush 되지 않을 수 있다.
 *     PYTHONUNBUFFERED=1 으로 완화하지만, 필요 시 사용자는 Enter 한 번을 더 눌러야 할 수 있음.
 *
 * 파일 실행 모드:
 *   - main.py 가 파일 인자를 직접 받는지 불확실 → 기본적으로 REPL 에 consult/load 를 feeding 하는 방식이 안전.
 *   - 다만 현재 Phase 3 에서는 파일 실행도 "스크립트처럼" 파일 내용을 stdin 으로 넘기는 대신,
 *     위치 인자로 전달하는 관례적 호출을 먼저 시도한다. 만약 원 인터프리터가 위치 인자를 무시하면
 *     config.json 으로 `args: ["--file"]` 등을 지정하거나, 향후 Adapter 가 loader 를 보강한다.
 */
import type { ResolvedBinary } from '@shared/types';
import type { InterpreterAdapter, SpawnConfig } from './types';

function baseEnv(resolved: ResolvedBinary): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    ...(resolved.env ?? {}),
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    PYTHONUNBUFFERED: '1',
  };
}

export const KPrologAdapter: InterpreterAdapter = {
  id: 'kprolog',

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
