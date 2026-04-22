/**
 * main 프로세스 내부용 Adapter 인터페이스.
 *
 * 각 인터프리터마다 "파일 실행" / "REPL 시작" 시에 어떤 인자/환경이 필요한지가 다르므로,
 * Resolver 가 해석한 command/args 에 Adapter 가 추가 인자와 env 를 덧붙여 최종 SpawnConfig 를 만든다.
 */
import type { InterpreterId, ResolvedBinary } from '@shared/types';

export interface SpawnConfig {
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string>;
}

export interface InterpreterAdapter {
  readonly id: InterpreterId;

  /**
   * 파일 실행 커맨드 구성.
   * Resolver 결과(command/baseArgs)는 반드시 그대로 선두에 사용하고, 인자만 이어붙인다.
   */
  buildRunFileSpawn(resolved: ResolvedBinary, filePath: string): SpawnConfig;

  /**
   * REPL 모드 커맨드. 인자 없이 실행할 때 REPL 로 진입하는 인터프리터가 있고,
   * 플래그가 필요한 인터프리터가 있어 Adapter 가 결정한다.
   *
   * needsPty=true 인 K-Prolog 는 pipe 모드에서도 동작하지만, prompt 가 flush 되지 않을 수 있음.
   * 운영상 주의사항은 Phase 0 조사표 참조.
   */
  buildStartReplSpawn(resolved: ResolvedBinary): SpawnConfig;
}
