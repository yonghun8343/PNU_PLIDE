import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import { IPC } from '@shared/ipc-channels';
import type {
  AppVersionInfo,
  ExitInfo,
  InterpreterId,
  InterpreterMeta,
  ResolveBinaryResponse,
  SessionId,
  StartSessionResult,
  StderrChunk,
  StdoutChunk,
  SysMetrics,
  UpdateApplyResult,
  UpdateCheckResult,
  UpdateProgress,
} from '@shared/types';

type Unsubscribe = () => void;

function subscribe<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

/**
 * renderer 쪽에서 window.api 로 접근 가능한 안전 표면.
 * contextIsolation=true 환경에서 node API 직접 노출을 금지하고,
 * 필요한 동작만 proxy 함수로 내어준다.
 */
const api = {
  getVersion: (): Promise<AppVersionInfo> => ipcRenderer.invoke(IPC.APP_GET_VERSION),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.APP_OPEN_EXTERNAL, url),

  fs: {
    openDialog: (): Promise<string | null> => ipcRenderer.invoke(IPC.FS_OPEN_DIALOG),
    saveDialog: (defaultPath?: string, defaultExt?: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC.FS_SAVE_DIALOG, defaultPath, defaultExt),
    readFile: (filePath: string): Promise<{ filePath: string; content: string }> =>
      ipcRenderer.invoke(IPC.FS_READ_FILE, filePath),
    writeFile: (filePath: string, content: string): Promise<{ filePath: string }> =>
      ipcRenderer.invoke(IPC.FS_WRITE_FILE, filePath, content),
    /**
     * 드래그앤드롭된 `File` 객체에서 실제 OS 절대경로를 얻는다.
     * Electron 32+ 에서 `File.path` 가 제거되어 `webUtils.getPathForFile()` 로 교체됨.
     */
    getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  },

  interp: {
    list: (): Promise<readonly InterpreterMeta[]> => ipcRenderer.invoke(IPC.INTERP_LIST),
    resolveBinary: (id: InterpreterId): Promise<ResolveBinaryResponse> =>
      ipcRenderer.invoke(IPC.INTERP_RESOLVE_BINARY, id),
    runFile: (id: InterpreterId, filePath: string): Promise<StartSessionResult> =>
      ipcRenderer.invoke(IPC.INTERP_RUN_FILE, id, filePath),
    startRepl: (id: InterpreterId): Promise<StartSessionResult> =>
      ipcRenderer.invoke(IPC.INTERP_START_REPL, id),
    writeStdin: (sessionId: SessionId, data: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.INTERP_STDIN_WRITE, sessionId, data),
    kill: (sessionId: SessionId): Promise<boolean> =>
      ipcRenderer.invoke(IPC.INTERP_KILL, sessionId),
    revealConfig: (): Promise<{ path: string; paths: { configJson: string; defaultBinRoot: string } }> =>
      ipcRenderer.invoke(IPC.INTERP_REVEAL_CONFIG),

    onStdout: (cb: (p: StdoutChunk) => void): Unsubscribe => subscribe(IPC.INTERP_STDOUT, cb),
    onStderr: (cb: (p: StderrChunk) => void): Unsubscribe => subscribe(IPC.INTERP_STDERR, cb),
    onExit: (cb: (p: ExitInfo) => void): Unsubscribe => subscribe(IPC.INTERP_EXIT, cb),
  },

  updater: {
    check: (): Promise<UpdateCheckResult> => ipcRenderer.invoke(IPC.UPDATER_CHECK),
    apply: (id: InterpreterId): Promise<UpdateApplyResult> =>
      ipcRenderer.invoke(IPC.UPDATER_APPLY, id),
    onProgress: (cb: (p: UpdateProgress) => void): Unsubscribe =>
      subscribe(IPC.UPDATER_PROGRESS, cb),
  },

  /**
   * 애플리케이션 메뉴(File/Run 등) 단축키 → renderer 로 push 되는 이벤트 구독.
   *   - onMenuNewFile   : Cmd/Ctrl + N
   *   - onMenuRun       : F5
   *   - onMenuOpenFile  : Cmd/Ctrl + O
   *   - onMenuSaveFile  : Cmd/Ctrl + S
   */
  menu: {
    onNewFile: (cb: () => void): Unsubscribe => subscribe<void>(IPC.MENU_NEW_FILE, cb),
    onRun: (cb: () => void): Unsubscribe => subscribe<void>(IPC.MENU_RUN, cb),
    onOpenFile: (cb: () => void): Unsubscribe => subscribe<void>('menu:open-file', cb),
    onSaveFile: (cb: () => void): Unsubscribe => subscribe<void>('menu:save-file', cb),
  },

  /**
   * 상태바 실시간 시스템 메트릭 구독 (1Hz).
   */
  sys: {
    onMetrics: (cb: (m: SysMetrics) => void): Unsubscribe => subscribe(IPC.SYS_METRICS, cb),
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (err) {
    console.error('contextBridge expose 실패:', err);
  }
} else {
  // sandbox=false + contextIsolation=false 인 경우에만 도달 (디버그용)
  // @ts-expect-error renderer global augmentation
  window.electron = electronAPI;
  // @ts-expect-error renderer global augmentation
  window.api = api;
}

export type PreloadApi = typeof api;
