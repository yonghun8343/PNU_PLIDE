/**
 * IPC 채널 상수.
 *
 * renderer → main 은 `invoke` (요청/응답) 또는 `send` (단방향),
 * main → renderer 는 `webContents.send` 으로 이벤트 푸시.
 *
 * 채널 이름 규칙: `<도메인>:<동작>`
 *   - app: 앱 전역 (버전, 창 제어 등)
 *   - interp: 인터프리터 런너 (Phase 3에서 확장)
 *   - updater: 자동 업데이트 (Phase 4에서 확장)
 */
export const IPC = {
  APP_GET_VERSION: 'app:get-version',
  APP_OPEN_EXTERNAL: 'app:open-external',

  // 파일 IO (Phase 2)
  FS_OPEN_DIALOG: 'fs:open-dialog',
  FS_SAVE_DIALOG: 'fs:save-dialog',
  FS_READ_FILE: 'fs:read-file',
  FS_WRITE_FILE: 'fs:write-file',

  // Phase 3 — Interpreter Runner
  // renderer → main (invoke)
  INTERP_LIST: 'interp:list',
  INTERP_RESOLVE_BINARY: 'interp:resolve-binary',
  INTERP_RUN_FILE: 'interp:run-file',
  INTERP_START_REPL: 'interp:start-repl',
  INTERP_STDIN_WRITE: 'interp:stdin-write',
  INTERP_KILL: 'interp:kill',
  INTERP_REVEAL_CONFIG: 'interp:reveal-config',

  // main → renderer (webContents.send)
  INTERP_STDOUT: 'interp:stdout',
  INTERP_STDERR: 'interp:stderr',
  INTERP_EXIT: 'interp:exit',

  // Phase 4 — Interpreter Auto-Updater
  UPDATER_CHECK: 'updater:check', // invoke → UpdateCheckResult
  UPDATER_APPLY: 'updater:apply', // invoke(id) → UpdateApplyResult
  UPDATER_PROGRESS: 'updater:progress', // main → renderer push (UpdateProgress)

  // UX — application menu 액션 (main → renderer push)
  MENU_NEW_FILE: 'menu:new-file',
  MENU_NEW_WINDOW: 'menu:new-window',
  MENU_RUN: 'menu:run',

  // System metrics (main → renderer push, 1Hz)
  SYS_METRICS: 'sys:metrics',

  // UX-5 — 테마 모드 동기화 (renderer → main, send).
  //   - renderer 가 결정한 effective 테마(light|dark) 를 main 으로 통지.
  //   - main 은 `nativeTheme.themeSource` 과 `BrowserWindow.setBackgroundColor` 를
  //     이에 맞춰 갱신하여 macOS 신호등/Windows caption 영역의 색 누락을 막는다.
  THEME_SET: 'theme:set',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
