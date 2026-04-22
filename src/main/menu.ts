/**
 * Application Menu 템플릿.
 *
 * - macOS 첫 메뉴의 기본 라벨("Electron") 을 앱 이름으로 교체하기 위해서는
 *   (a) `app.setName()` 가 `app.whenReady()` 전에 호출되고,
 *   (b) 메뉴 첫 submenu 의 label 을 명시적으로 `app.name` 으로 지정해야 한다.
 *
 * - 단축키:
 *     Cmd/Ctrl + N  → 새 파일 (renderer 에 MENU_NEW_FILE 푸시)
 *     Cmd/Ctrl + Shift + N → 새 창
 *     F5            → 실행 (renderer 에 MENU_RUN 푸시)
 *     Cmd/Ctrl + S  → 저장 — (renderer 가 직접 처리하지만, 메뉴를 통한 접근성 확보)
 *
 * renderer 측은 `window.api.onMenu*` 구독으로 대응.
 */
import { Menu, BrowserWindow, app, shell } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { IPC } from '@shared/ipc-channels';

function send(channel: string): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel);
}

export function buildAppMenu(createNewWindow: () => void): void {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    // macOS 앱 메뉴 (첫 번째 submenu)
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: '파일',
      submenu: [
        {
          label: '새 파일',
          accelerator: 'CmdOrCtrl+N',
          click: () => send(IPC.MENU_NEW_FILE),
        },
        {
          label: '새 창',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => createNewWindow(),
        },
        { type: 'separator' },
        {
          label: '열기…',
          accelerator: 'CmdOrCtrl+O',
          click: () => send('menu:open-file'), // renderer 가 onOpen 에 연결해도 되고, 현재는 툴바 버튼 사용
        },
        {
          label: '저장',
          accelerator: 'CmdOrCtrl+S',
          click: () => send('menu:save-file'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: '편집',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '실행',
      submenu: [
        {
          label: '실행',
          accelerator: 'F5',
          click: () => send(IPC.MENU_RUN),
        },
      ],
    },
    {
      label: '보기',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '창',
      submenu: isMac
        ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
        : [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
    {
      label: '도움말',
      role: 'help',
      submenu: [
        {
          label: 'PNU PL Lab',
          click: () => void shell.openExternal('https://plrg.cs.pusan.ac.kr/'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
