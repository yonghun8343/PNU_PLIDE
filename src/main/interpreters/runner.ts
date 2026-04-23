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
 *   - 인코딩: stdout/stderr 를 Buffer 로 받아 createDecoder() 로 디코딩.
 *     Windows 에서는 PyInstaller 빌드의 sys.stderr 가 PYTHONIOENCODING 을 무시하고
 *     locale 인코딩(CP949)으로 출력하는 사례가 있어, UTF-8 우선 → CP949 fallback chain 사용.
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

/**
 * 자식 프로세스 stdio 를 위한 stream-aware 디코더.
 *
 *   - 모든 OS: UTF-8 을 stream 모드로 디코딩 (chunk boundary 안전).
 *   - Windows: UTF-8 디코딩 시 invalid byte sequence 발견 시 windows-949(CP949)
 *     로 fallback. PyInstaller 빌드의 sys.stderr 가 PYTHONIOENCODING 을
 *     무시하고 locale encoding 을 쓰는 케이스를 흡수.
 *
 * pending buffer 로 multi-byte 문자가 chunk 경계에 걸친 경우를 보존.
 */
function createDecoder(): (chunk: Buffer) => string {
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const utf8Lossy = new TextDecoder('utf-8', { fatal: false });
  const cp949 =
    process.platform === 'win32'
      ? new TextDecoder('windows-949', { fatal: false })
      : null;

  let pending: Buffer = Buffer.alloc(0);

  return (chunk: Buffer): string => {
    const combined = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk;

    // 1차 시도: 엄격 UTF-8 (chunk boundary 의 partial 문자 감지)
    try {
      const text = utf8.decode(combined, { stream: true });
      pending = Buffer.alloc(0);
      return text;
    } catch {
      // 2차 시도: Windows 에서 CP949 fallback
      if (cp949) {
        // CP949 는 단일 stream 으로 보지 않음 — 자식이 latin1/cp949 만 출력하는
        // 단순 케이스를 가정. 진짜 UTF-8/CP949 가 섞여 들어올 가능성은 낮음.
        const text = cp949.decode(combined);
        pending = Buffer.alloc(0);
        return text;
      }
      // 3차 시도: lossy UTF-8 (replacement character)
      const text = utf8Lossy.decode(combined);
      pending = Buffer.alloc(0);
      return text;
    }
  };
}

function attachIO(session: Session): void {
  const { id, child, target } = session;

  // setEncoding 호출하지 않음 — Buffer 로 받아 직접 디코딩 (인코딩 fallback 처리)
  const decodeStdout = createDecoder();
  const decodeStderr = createDecoder();

  child.stdout?.on('data', (chunk: Buffer) => {
    const data = decodeStdout(chunk);
    if (data.length === 0) return;
    const payload: StdoutChunk = { sessionId: id, data };
    safeSend(target, IPC.INTERP_STDOUT, payload);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    const data = decodeStderr(chunk);
    if (data.length === 0) return;
    const payload: StderrChunk = { sessionId: id, data };
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
