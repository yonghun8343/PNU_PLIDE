import { app, shell, BrowserWindow, ipcMain, dialog, nativeTheme } from 'electron';
import { join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { IPC } from '@shared/ipc-channels';
import type { AppVersionInfo, InterpreterId, SessionId, SysMetrics } from '@shared/types';
import { INTERPRETERS } from '@shared/types';
import { resolveBinary, resolverPaths } from './interpreters/resolver';
import { runFile, startRepl, writeStdin, killSession, killAll } from './interpreters/runner';
import { appDir, configJsonPath } from './interpreters/paths';
import { bindWindowState, loadWindowState } from './window-state';
import { applyUpdate, checkForUpdates, cleanupStaleArtifacts } from './updater';
import type { UpdateProgress } from '@shared/types';
import { buildAppMenu } from './menu';
import { startSysMetricsSampler, stopSysMetricsSampler } from './sys-metrics';

/**
 * 초기 BrowserWindow backgroundColor 결정.
 *
 * macOS 의 경우 이 값이 native titlebar (신호등 영역) 배경으로 노출되므로
 * "현재 시스템" 이 라이트라면 흰색으로, 다크라면 어두운 색으로 시작해야
 * 렌더러가 실제 테마를 통지하기 전까지의 짧은 시간 동안 색 튐을 방지할 수 있다.
 *
 * 사용자가 이전 세션에서 명시적으로 다크/라이트를 선택했는지는 renderer
 * preferences 가 localStorage 에 저장하므로 main 에서는 확인할 수 없다.
 * 따라서 시스템 기본값을 따르고, 렌더러 첫 tick 직후 `theme:set` IPC 로
 * 정확한 값으로 수렴시킨다.
 */
function initialBackgroundColor(): string {
  return nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff';
}

function createWindow(): BrowserWindow {
  const restored = loadWindowState();
  const win = new BrowserWindow({
    x: restored.x,
    y: restored.y,
    width: restored.width,
    height: restored.height,
    minWidth: 960,
    minHeight: 600,
    show: false,
    // 메뉴바(파일/편집/실행/...)를 항상 노출 — 단축키 F5, CmdOrCtrl+N 가시성 확보.
    autoHideMenuBar: false,
    title: 'PLIDE',
    backgroundColor: initialBackgroundColor(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 이전 세션에서 maximized 상태로 종료된 경우 복구
  if (restored.isMaximized) win.maximize();
  bindWindowState(win);

  win.on('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // electron-vite: dev 모드에서는 Vite dev server, prod 에서는 번들된 HTML
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.APP_GET_VERSION, (): AppVersionInfo => {
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome,
      platform: process.platform,
      arch: process.arch,
    };
  });

  ipcMain.handle(IPC.APP_OPEN_EXTERNAL, async (_e, url: string) => {
    await shell.openExternal(url);
  });

  /**
   * UX-5: 테마 동기화.
   *
   * 페이로드:
   *   - `mode`: 사용자가 선택한 모드('light'|'dark'|'system'). `nativeTheme.themeSource` 에 그대로 전달.
   *   - `effective`: 'system' 을 해소한 실제 테마('light'|'dark'). 창 배경색에 사용.
   *
   * macOS 에서 `nativeTheme.themeSource` 를 갱신하면 native 타이틀바(신호등 영역)
   * 까지 해당 appearance 를 따른다. `setBackgroundColor` 는 타이틀바 및 리사이즈
   * 순간의 빈 영역 색을 결정하므로 두 가지를 함께 업데이트해야 색 튐이 사라진다.
   */
  ipcMain.on(
    IPC.THEME_SET,
    (
      e,
      payload: { mode: 'light' | 'dark' | 'system'; effective: 'light' | 'dark' },
    ) => {
      try {
        nativeTheme.themeSource = payload.mode;
      } catch {
        /* 비정상 payload 는 무시 */
      }
      const bg = payload.effective === 'light' ? '#ffffff' : '#1e1e1e';
      const owner = BrowserWindow.fromWebContents(e.sender);
      if (owner && !owner.isDestroyed()) {
        owner.setBackgroundColor(bg);
      }
    },
  );

  // 파일 열기 dialog
  ipcMain.handle(IPC.FS_OPEN_DIALOG, async (e) => {
    const owner = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const result = await dialog.showOpenDialog(owner!, {
      title: '파일 열기',
      properties: ['openFile'],
      filters: [
        { name: 'Mowkow', extensions: ['mk'] },
        { name: 'Kobasic', extensions: ['kob'] },
        { name: 'K-Prolog', extensions: ['kpl'] },
        { name: '모든 파일', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // 파일 저장 dialog
  ipcMain.handle(
    IPC.FS_SAVE_DIALOG,
    async (e, defaultPath: string | undefined, defaultExt: string | undefined) => {
      const owner = BrowserWindow.fromWebContents(e.sender) ?? undefined;
      const result = await dialog.showSaveDialog(owner!, {
        title: '파일 저장',
        defaultPath,
        filters: defaultExt
          ? [{ name: `${defaultExt} 파일`, extensions: [defaultExt.replace(/^\./, '')] }]
          : [{ name: '모든 파일', extensions: ['*'] }],
      });
      if (result.canceled || !result.filePath) return null;
      return result.filePath;
    },
  );

  // 파일 읽기 (UTF-8 고정 — 세 인터프리터 모두 UTF-8 강제)
  ipcMain.handle(IPC.FS_READ_FILE, async (_e, filePath: string) => {
    const content = await readFile(filePath, 'utf-8');
    return { filePath, content };
  });

  // 파일 쓰기 (UTF-8 고정)
  ipcMain.handle(IPC.FS_WRITE_FILE, async (_e, filePath: string, content: string) => {
    await writeFile(filePath, content, 'utf-8');
    return { filePath };
  });

  // ========== Phase 3: Interpreter Runner ==========

  ipcMain.handle(IPC.INTERP_LIST, () => INTERPRETERS);

  ipcMain.handle(IPC.INTERP_RESOLVE_BINARY, async (_e, id: InterpreterId) => {
    return resolveBinary(id);
  });

  ipcMain.handle(IPC.INTERP_RUN_FILE, async (e, id: InterpreterId, filePath: string) => {
    return runFile(id, filePath, e.sender);
  });

  ipcMain.handle(IPC.INTERP_START_REPL, async (e, id: InterpreterId) => {
    return startRepl(id, e.sender);
  });

  ipcMain.handle(IPC.INTERP_STDIN_WRITE, (_e, sessionId: SessionId, data: string) => {
    return writeStdin(sessionId, data);
  });

  ipcMain.handle(IPC.INTERP_KILL, (_e, sessionId: SessionId) => {
    return killSession(sessionId);
  });

  /**
   * config.json 을 OS 탐색기에서 열어준다.
   * 파일이 없으면 빈 skeleton 을 생성한 뒤 연다.
   */
  ipcMain.handle(IPC.INTERP_REVEAL_CONFIG, async () => {
    const p = configJsonPath();
    try {
      await readFile(p, 'utf-8');
    } catch {
      await mkdir(appDir(), { recursive: true });
      await writeFile(
        p,
        JSON.stringify(
          {
            $schema: 'https://pnu-pl-ide/schema/config.json',
            binaries: {
              mowkow: { command: '', args: [], cwd: '' },
              kprolog: { command: '', args: [], cwd: '' },
            },
            updater: {
              // 비우면 내장 DEFAULT_S3_BASE_URL 사용. 연구실 내부 mirror 가 필요할 때만 override.
              s3BaseUrl: '',
              autoCheck: true,
              insecureTLS: false,
            },
          },
          null,
          2,
        ),
        'utf-8',
      );
    }
    await shell.showItemInFolder(p);
    return { path: p, paths: resolverPaths() };
  });

  // ========== Phase 4: Interpreter Auto-Updater ==========

  ipcMain.handle(IPC.UPDATER_CHECK, async () => {
    return checkForUpdates();
  });

  ipcMain.handle(IPC.UPDATER_APPLY, async (e, id: InterpreterId) => {
    const sender = e.sender;
    const push = (payload: UpdateProgress): void => {
      if (!sender.isDestroyed()) sender.send(IPC.UPDATER_PROGRESS, payload);
    };
    return applyUpdate(id, push);
  });
}

// macOS 앱 메뉴 첫 submenu 라벨을 "PLIDE" 로 표시하기 위해 whenReady 전에 호출.
// productName (package.json) 이 이미 "PLIDE" 이지만, 개발 모드에서는 electron 기본값이 섞일 수 있어 명시적으로 설정한다.
app.setName('PLIDE');

app.whenReady().then(() => {
  electronApp.setAppUserModelId('edu.pusan.pl.ide');

  app.on('browser-window-created', (_, win) => {
    optimizer.watchWindowShortcuts(win);
  });

  registerIpcHandlers();
  // 애플리케이션 메뉴 설정 — `새 창` 에서 createWindow() 를 호출하기 위해 콜백 주입.
  buildAppMenu(() => {
    createWindow();
  });
  createWindow();

  // 상태바 실시간 메트릭 샘플러 (1Hz)
  startSysMetricsSampler((payload: SysMetrics) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IPC.SYS_METRICS, payload);
    }
  });

  // 기동 시 stale cache/backup 정리 (fire-and-forget)
  void cleanupStaleArtifacts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 모든 child process 종료 보장
app.on('before-quit', () => {
  stopSysMetricsSampler();
  killAll();
});
app.on('will-quit', () => {
  killAll();
});
