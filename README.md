# PNU PLIDE

부산대 PL 연구실 교육용 언어 3종(Mowkow / Kobasic / K-Prolog) 통합 IDE.

## Stack

| Layer | Tech |
|---|---|
| Shell | Electron 33 + electron-vite |
| Renderer | React 19 + TypeScript |
| Editor | Monaco Editor (Phase 2에서 통합) |
| Terminal | Xterm.js (Phase 2에서 통합) |
| Packager | electron-builder |
| Package Manager | pnpm |

## 디렉토리 구조

```
app/
├─ electron.vite.config.ts     # main/preload/renderer 3-타겟 Vite 설정
├─ electron-builder.yml        # 배포 패키징 설정
├─ tsconfig.{json,node,web}.json
├─ package.json
└─ src/
   ├─ shared/                  # main·preload·renderer 공용 타입/상수
   │  ├─ types.ts              # InterpreterMeta, Diagnostic 등
   │  └─ ipc-channels.ts       # IPC 채널 상수 (Phase 3/4 예약 포함)
   ├─ main/
   │  └─ index.ts              # BrowserWindow 생성, IPC handler 등록
   ├─ preload/
   │  ├─ index.ts              # contextBridge 로 window.api 노출
   │  └─ index.d.ts            # renderer 쪽 타입 확장
   └─ renderer/
      ├─ index.html
      └─ src/
         ├─ main.tsx
         ├─ App.tsx            # Phase 1 기동 검증용 placeholder UI
         └─ App.css
```

## 개발 기동

```bash
cd app
pnpm install          # electron-builder install-app-deps 포함 실행됨
pnpm dev              # Vite dev server + Electron main watch
```

정상 기동 시 1280×800 창이 뜨고 다음이 확인되어야 한다:

- 상단 헤더에 "PNU PLIDE · Phase 1 · Electron Shell"
- 좌상단 Editor placeholder (Mowkow 코드 예시)
- 좌하단 Terminal placeholder
- 우측 사이드바에 3개 인터프리터 메타데이터(파일 확장자·PTY 필요 여부·REPL 종료 방법)
- 하단 푸터에 `v0.0.1 · Electron 33.x · Node 20.x · <platform>/<arch>`

푸터가 렌더링된다는 것은 renderer → preload(contextBridge) → main(ipcMain.handle) → app.getVersion() 왕복이 성공했다는 뜻. **Phase 1 검증 핵심 포인트**.

## 타입체크 / 빌드

```bash
pnpm typecheck        # main/preload(node) + renderer(web) 양쪽 tsc --noEmit
pnpm build            # out/ 로 번들
pnpm build:unpack     # 패키징 없이 dist/ 에 풀린 상태로 산출 (디버그용)
pnpm build:mac        # macOS dmg
pnpm build:win        # Windows nsis
pnpm build:linux      # Linux AppImage
```

## 다음 단계 (Phase 2 이후)

- **Phase 2**: Monaco Editor + Xterm.js 임베딩, react-resizable-panels 로 레이아웃 전환
- **Phase 3**: `InterpreterAdapter` 구현체 3종 (`src/main/interpreters/{mowkow,kobasic,kprolog}.ts`), `child_process.spawn` 래퍼, stdio → xterm 파이핑
- **Phase 4**: S3 manifest 기반 자동 다운로드 (`~/.pnu-pl-ide/bin/` 관리)

## 인터프리터 참조

`../interpreter/` 에 세 원본 repo가 위치. Phase 0 조사 결과:

| ID | 확장자 | 실행 엔트리 | prebuilt dist | 라이선스 | PTY 필요 |
|---|---|---|---|---|---|
| mowkow | `.mk` | `mk` / `python main.py` | Mac/Linux/Win 있음 | 미명시 | No |
| kobasic | `.kob` | `./kobasic` | 없음 (make 필요) | 미명시 | No |
| kprolog | `.kpl` | `python main.py` | 없음 | MIT (2025) | Yes (다중라인 `?-` 프롬프트) |

Phase 0 Critical 이슈:

1. Kobasic `interpreter.cpp:16` 의 `#include <windows.h>` 제거 필요 (사용자 수정 계획 반영됨)
2. K-Prolog 는 단순 pipe stdin 기반으로 우선 연동 (UX 저하 허용, 사용자 결정 반영됨)
3. Mowkow · Kobasic 라이선스 명시 요청 필요 (배포 블로커)
