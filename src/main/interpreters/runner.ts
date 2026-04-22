/**
 * Interpreter Runner — child_process.spawn 기반 세션 관리자.
 *
 * 책임:
 *   1) Adapter + Resolver 로부터 SpawnConfig 계산
 *   2) child_process.spawn (pipe stdio) 로 프로세스 생성
 *   3) stdout/stderr 를 chunk 단위로 renderer 로 푸시 (INTERP_STDOUT/INTERP_STDERR)
 *   4) 종료 시 ExitInfo 푸시 (INTERP_EXIT)
 *   5) stdin 쓰기 / kill 요청 처리
 *
 * 동시 세션은 복수로 가능하지만, Phase 3 단계 UI 는 단일 세션만 사용한다.
 *
 * 주의:
 *   - pipe 모드이므로 인터프리터가 `stdout` 을 block-buffering 하면 프롬프트가 즉시 안 보일 수 있음.
 *     Python 기반(Mowkow/K-Prolog)은 PYTHONUNBUFFERED 로 완화, C++(Kobasic)는 소스 측 flush 에 의존.
 *   - Windows 에서 spawn 은 shell=false 기본. 명령에 공백이 있어도 argv 분리가 안전.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { WebContents } from 'electron';
import { IPC } from '@shared/ipc-channels';
import type {
  ExitInfo,
  InterpreterId,
  ResolvedBinary,
  SessionId,
  StartSessionResult,
  StderrChunk,
  StdoutChunk,
} from '@shared/types';
import { resolveBinary } from './resolver';
import { getAdapter } from './registry';

interface Session {
  id: SessionId;
  interpreterId: InterpreterId;
  child: ChildProcess;
  /** 종료 이벤트를 중복 emit 하지 않기 위한 플래그 */
  exited: boolean;
  /** renderer 로 송신할 WebContents. destroyed 상태면 drop. */
  target: WebContents;
}

const sessions = new Map<SessionId, Session>();

function safeSend<T>(wc: WebContents, channel: string, payload: T): void {
  if (wc.isDestroyed()) return;
  wc.send(channel, payload);
}

function attachIO(session: Session): void {
  const { id, child, target } = session;

  child.stdout?.setEncoding('utf-8');
  child.stderr?.setEncoding('utf-8');

  child.stdout?.on('data', (chunk: string) => {
    const payload: StdoutChunk = { sessionId: id, data: chunk };
    safeSend(target, IPC.INTERP_STDOUT, payload);
  });
  child.stderr?.on('data', (chunk: string) => {
    const payload: StderrChunk = { sessionId: id, data: chunk };
    safeSend(target, IPC.INTERP_STDERR, payload);
  });

  const finalize = (info: Omit<ExitInfo, 'sessionId'>): void => {
    if (session.exited) return;
    session.exited = true;
    sessions.delete(id);
    const payload: ExitInfo = { sessionId: id, ...info };
    safeSend(target, IPC.INTERP_EXIT, payload);
  };

  child.on('error', (err) => {
    // ENOENT 같은 spawn 실패. 이 경우 'exit' 이 발생하지 않을 수도 있어 여기서 finalize.
    finalize({
      code: null,
      signal: null,
      errorMessage: (err as NodeJS.ErrnoException).message ?? String(err),
    });
  });

  child.on('exit', (code, signal) => {
    finalize({ code, signal });
  });
}

// ---------------------------------------------------------------------------
// Public API — main/index.ts 의 IPC 핸들러에서 호출
// ---------------------------------------------------------------------------

async function buildAndSpawn(
  interpreterId: InterpreterId,
  target: WebContents,
  build: (resolved: ResolvedBinary) => { command: string; args: string[]; cwd?: string; env: Record<string, string> },
): Promise<StartSessionResult> {
  const resolveRes = await resolveBinary(interpreterId);
  if (!resolveRes.ok) {
    // 에러를 throw 하면 ipcMain.handle 이 renderer 의 Promise 에서 reject 로 전달.
    const hints = resolveRes.hints?.length ? `\n힌트:\n  - ${resolveRes.hints.join('\n  - ')}` : '';
    throw new Error(`[${resolveRes.code}] ${resolveRes.message}${hints}`);
  }
  const resolved = resolveRes.resolved;
  const spawnCfg = build(resolved);

  const child = spawn(spawnCfg.command, spawnCfg.args, {
    cwd: spawnCfg.cwd,
    env: spawnCfg.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  });

  const id = randomUUID();
  const session: Session = {
    id,
    interpreterId,
    child,
    exited: false,
    target,
  };
  sessions.set(id, session);
  attachIO(session);

  return {
    sessionId: id,
    resolved,
    mode: 'file',
    interpreterId,
  };
}

export async function runFile(
  interpreterId: InterpreterId,
  filePath: string,
  target: WebContents,
): Promise<StartSessionResult> {
  const adapter = getAdapter(interpreterId);
  const r = await buildAndSpawn(interpreterId, target, (resolved) =>
    adapter.buildRunFileSpawn(resolved, filePath),
  );
  return { ...r, mode: 'file' };
}

export async function startRepl(
  interpreterId: InterpreterId,
  target: WebContents,
): Promise<StartSessionResult> {
  const adapter = getAdapter(interpreterId);
  const r = await buildAndSpawn(interpreterId, target, (resolved) =>
    adapter.buildStartReplSpawn(resolved),
  );
  return { ...r, mode: 'repl' };
}

export function writeStdin(sessionId: SessionId, data: string): boolean {
  const s = sessions.get(sessionId);
  if (!s || s.exited) return false;
  const stdin = s.child.stdin;
  if (!stdin || stdin.destroyed) return false;
  return stdin.write(data);
}

export function killSession(sessionId: SessionId, signal: NodeJS.Signals = 'SIGTERM'): boolean {
  const s = sessions.get(sessionId);
  if (!s || s.exited) return false;
  // Windows 는 SIGTERM 미지원 — kill(true) 로 대체
  if (process.platform === 'win32') {
    s.child.kill();
  } else {
    s.child.kill(signal);
  }
  return true;
}

/** 주어진 인터프리터의 활성 세션 유무. 업데이터가 설치 충돌을 피하기 위해 조회. */
export function hasActiveSession(interpreterId: InterpreterId): boolean {
  for (const s of sessions.values()) {
    if (s.interpreterId === interpreterId && !s.exited) return true;
  }
  return false;
}

/** 앱 종료 시 모든 세션을 강제 종료. */
export function killAll(): void {
  for (const s of sessions.values()) {
    try {
      if (!s.exited) s.child.kill();
    } catch {
      /* ignore */
    }
  }
  sessions.clear();
}
