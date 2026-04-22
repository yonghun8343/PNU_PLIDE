/**
 * BrowserWindow 의 bounds(위치/크기) persistence.
 *
 * 저장 위치: ~/.pnu-pl-ide/window-state.json
 *
 * 동작:
 *   1) `loadWindowState()` — 저장본을 읽고, 복구된 bounds 가 현재 display 범위 내에 있는지 screen API 로 검증.
 *      다른 모니터가 분리되었거나 해상도가 변한 경우, 화면 밖 좌표를 복원하는 사고 방지.
 *   2) `bindWindowState(win)` — move/resize 이벤트에 debounce 로 저장. maximized/fullscreen 상태도 함께 기록.
 *
 * 외부 의존 없이 node:fs + electron.screen 만으로 구현 (electron-store 등을 굳이 쓰지 않음).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { BrowserWindow, screen } from 'electron';
import { appDir } from './interpreters/paths';
import { join } from 'node:path';

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized?: boolean;
}

const DEFAULT_STATE: WindowState = {
  width: 1280,
  height: 800,
};

function stateFilePath(): string {
  return join(appDir(), 'window-state.json');
}

function ensureVisible(s: WindowState): WindowState {
  // x/y 가 없으면 center 배치(DEFAULT 유지)
  if (s.x === undefined || s.y === undefined) return s;
  const displays = screen.getAllDisplays();
  const inBounds = displays.some(
    (d) =>
      s.x! >= d.bounds.x - 10 &&
      s.y! >= d.bounds.y - 10 &&
      s.x! + Math.min(s.width, d.bounds.width) <= d.bounds.x + d.bounds.width + 10 &&
      s.y! + Math.min(s.height, d.bounds.height) <= d.bounds.y + d.bounds.height + 10,
  );
  if (!inBounds) {
    // 화면 밖 → 좌표 버리고 크기만 유지
    return { width: s.width, height: s.height, isMaximized: s.isMaximized };
  }
  return s;
}

export function loadWindowState(): WindowState {
  try {
    const raw = readFileSync(stateFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<WindowState>;
    const merged: WindowState = {
      width: typeof parsed.width === 'number' ? parsed.width : DEFAULT_STATE.width,
      height: typeof parsed.height === 'number' ? parsed.height : DEFAULT_STATE.height,
      x: typeof parsed.x === 'number' ? parsed.x : undefined,
      y: typeof parsed.y === 'number' ? parsed.y : undefined,
      isMaximized: Boolean(parsed.isMaximized),
    };
    return ensureVisible(merged);
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveWindowState(state: WindowState): void {
  try {
    mkdirSync(appDir(), { recursive: true });
    writeFileSync(stateFilePath(), JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    /* disk full / EACCES 등은 조용히 무시 */
  }
}

/**
 * 창 상태 자동 저장 바인딩. `maximize` 도 포함하여, 재기동 시 동일한 창 경험을 재현.
 */
export function bindWindowState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null;

  const persist = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const isMaximized = win.isMaximized();
      // getNormalBounds: 최대화 상태가 아닐 때의 원래 bounds. Electron >= 19
      const bounds = isMaximized && win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
      saveWindowState({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized,
      });
    }, 400);
  };

  win.on('move', persist);
  win.on('resize', persist);
  win.on('maximize', persist);
  win.on('unmaximize', persist);
  win.on('close', () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const isMaximized = win.isMaximized();
    const bounds = isMaximized && win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
    saveWindowState({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized,
    });
  });
}
