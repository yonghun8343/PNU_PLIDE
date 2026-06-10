/**
 * 개발 모드 전용 — renderer 의 console.* 출력을 파일로 미러링.
 *
 * 위치: ~/.pnu-pl-ide/logs/dev-YYYYMMDD-HHmmss.log
 * 매 createWindow 호출마다 새 파일을 만들지 않고, 첫 호출 시 한 번 연 뒤 append.
 *
 * 사용 사례: IME(한글 조합) / 터미널 입력 같이 DevTools 콘솔을 띄워두기
 * 번거로운 진단을 파일로 캡쳐. prod 빌드에서는 attachRendererLogger 가
 * no-op 으로 호출되도록 `is.dev` 가드는 호출 측에서 처리.
 */
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { appDir } from './interpreters/paths';

let stream: WriteStream | null = null;
let logFilePath: string | null = null;

function timestamp(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function ensureStream(): WriteStream {
  if (stream) return stream;
  const dir = join(appDir(), 'logs');
  mkdirSync(dir, { recursive: true });
  logFilePath = join(dir, `dev-${timestamp()}.log`);
  stream = createWriteStream(logFilePath, { flags: 'a' });
  stream.write(`# PLIDE dev log — opened ${new Date().toISOString()}\n`);
  // 콘솔에 경로를 한 번 알려 두면 디버깅 시 찾기 편함
  // eslint-disable-next-line no-console
  console.log(`[dev-logger] renderer console mirrored to ${logFilePath}`);
  return stream;
}

/** 현재 로그 파일 절대경로 (없으면 null). */
export function devLogFilePath(): string | null {
  return logFilePath;
}

/**
 * renderer 의 console-message 이벤트를 파일로 미러링.
 * 같은 window 에 두 번 호출되면 두 번째는 무시 (idempotent).
 */
const attached = new WeakSet<BrowserWindow>();
export function attachRendererLogger(win: BrowserWindow): void {
  if (attached.has(win)) return;
  attached.add(win);
  const s = ensureStream();

  // Electron 의 'console-message' 시그니처는 버전에 따라 다르다:
  //   - 구버전: (event, level, message, line, sourceId)
  //   - 신버전(28+): (event: { level, message, lineNumber, sourceId, frame })
  // 두 형태를 모두 처리.
  win.webContents.on(
    'console-message',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (...args: any[]) => {
      let level = 'log';
      let message = '';
      let line: number | undefined;
      let source: string | undefined;
      if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
        const ev = args[0];
        level = String(ev.level ?? 'log');
        message = String(ev.message ?? '');
        line = typeof ev.lineNumber === 'number' ? ev.lineNumber : undefined;
        source = typeof ev.sourceId === 'string' ? ev.sourceId : undefined;
      } else {
        level = String(args[1] ?? 'log');
        message = String(args[2] ?? '');
        line = typeof args[3] === 'number' ? args[3] : undefined;
        source = typeof args[4] === 'string' ? args[4] : undefined;
      }
      const loc = source ? ` (${source}${line !== undefined ? `:${line}` : ''})` : '';
      s.write(`[${new Date().toISOString()}] [${level}] ${message}${loc}\n`);
    },
  );

  win.on('closed', () => {
    // 마지막 창이 닫히면 stream flush. 다음 창에서 다시 ensureStream() 시 새 파일 생성.
    if (stream) {
      stream.end();
      stream = null;
      logFilePath = null;
    }
  });
}
