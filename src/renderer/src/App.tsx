import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type JSX } from 'react';
import { Editor } from './components/Editor';
import { Terminal, type TerminalHandle } from './components/Terminal';
import { Layout } from './components/Layout';
import { Toolbar } from './components/Toolbar';
import { UpdateDialog } from './components/UpdateDialog';
import { StatusBar } from './components/StatusBar';
import { SettingsDialog } from './components/SettingsDialog';
import type {
  AppVersionInfo,
  ExitInfo,
  InterpreterId,
  SessionId,
  SysMetrics,
  UpdateCheckResult,
} from '@shared/types';
import { INTERPRETERS } from '@shared/types';
import { detectInterpreter, monacoLanguageFor } from '@shared/lang';
import { DEFAULT_CODE_FONT, familyOf, type CodeFontId } from './fonts';
import {
  FONT_SIZE_DEFAULT,
  clampFontSize,
  loadPrefs,
  updatePrefs,
  type ThemeMode,
} from './preferences';

const INITIAL_SAMPLE = '';

/**
 * 터미널 셀 폭 판별 — CJK / Hangul / 전각 기호 등은 2셀, 그 외 1셀.
 * 백스페이스로 지울 셀 수를 결정하기 위해 사용. Unicode 11 EastAsianWidth
 * (Wide=W / Fullwidth=F) 의 주요 블록만 커버 (보조 평면 surrogate pair 포함).
 */
function isWideChar(ch: string): boolean {
  if (!ch) return false;
  const cp = ch.codePointAt(0);
  if (cp === undefined) return false;
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK Radicals / Kangxi / 일부 기호
    (cp >= 0x3041 && cp <= 0x33ff) || // Hiragana / Katakana / Bopomofo / Hangul Compat Jamo
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Unified Ideographs Ext A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified Ideographs
    (cp >= 0xa000 && cp <= 0xa4cf) || // Yi
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul Syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility Ideographs
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK Compatibility Forms
    (cp >= 0xff00 && cp <= 0xff60) || // Fullwidth Forms
    (cp >= 0xffe0 && cp <= 0xffe6) || // Fullwidth Signs
    (cp >= 0x20000 && cp <= 0x2fffd) || // CJK Ext B–F (보조 평면)
    (cp >= 0x30000 && cp <= 0x3fffd) // CJK Ext G+
  );
}

function App(): JSX.Element {
  // Phase 8: persistence — 기동 시 1회 로드
  const initialPrefs = useMemo(() => loadPrefs(), []);

  const [version, setVersion] = useState<AppVersionInfo | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState<string>(INITIAL_SAMPLE);
  const [savedContent, setSavedContent] = useState<string>(INITIAL_SAMPLE);
  // 기동 시 항상 미선택. 파일을 열면 detectInterpreter 로 확장자 기반 자동 선택됨.
  const [activeInterpreter, setActiveInterpreterState] = useState<InterpreterId | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [codeFont, setCodeFont] = useState<CodeFontId>(() => {
    const f = initialPrefs.codeFont;
    return f === 'hack' || f === 'd2coding' ? f : DEFAULT_CODE_FONT;
  });
  // UX-5: 폰트 크기 / 테마 모드
  const [fontSize, setFontSize] = useState<number>(() =>
    clampFontSize(initialPrefs.fontSize ?? FONT_SIZE_DEFAULT),
  );
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => initialPrefs.themeMode ?? 'system');
  // system 모드를 해소한 실제 효과 테마. Monaco / Xterm 에 직접 전달.
  const [themeEffective, setThemeEffective] = useState<'light' | 'dark'>(() => {
    if (initialPrefs.themeMode === 'light') return 'light';
    if (initialPrefs.themeMode === 'dark') return 'dark';
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  });

  // Phase 4: 업데이터 상태
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // UX-6: 상태바에 표시할 시스템 메트릭 (1Hz main push)
  const [sysMetrics, setSysMetrics] = useState<SysMetrics | null>(null);

  /**
   * setActiveInterpreter — state 만 갱신. persistence 는 의도적으로 하지 않아
   * 기동 시 항상 미선택 상태에서 시작한다. 파일 오픈/드롭 시 확장자 기반 자동 감지.
   */
  const setActiveInterpreter = useCallback((id: InterpreterId | null) => {
    setActiveInterpreterState(id);
  }, []);

  const termRef = useRef<TerminalHandle>(null);
  /** 현재 active session 식별자. stdin / kill 라우팅용. */
  const sessionIdRef = useRef<SessionId | null>(null);
  /** line-buffered input 누적 버퍼 (세션이 running 인 동안만 사용) */
  const inputBufferRef = useRef<string>('');
  /** 입력 히스토리 (Enter 로 전송된 라인). 세션 간 유지. */
  const historyRef = useRef<string[]>([]);
  /** 현재 탐색 중인 히스토리 인덱스. -1 = 탐색 안 함 */
  const historyIndexRef = useRef<number>(-1);
  /** 히스토리 탐색 전 타이핑 중이던 미완성 입력 임시 저장 */
  const historyDraftRef = useRef<string>('');

  const isDirty = content !== savedContent;
  const language = useMemo(() => monacoLanguageFor(activeInterpreter), [activeInterpreter]);
  const fontFamily = useMemo(() => familyOf(codeFont), [codeFont]);

  const selectCodeFont = useCallback((id: CodeFontId) => {
    setCodeFont(id);
    updatePrefs({ codeFont: id });
  }, []);

  const selectFontSize = useCallback((n: number) => {
    const v = clampFontSize(n);
    setFontSize(v);
    updatePrefs({ fontSize: v });
  }, []);

  const selectThemeMode = useCallback((m: ThemeMode) => {
    setThemeMode(m);
    updatePrefs({ themeMode: m });
  }, []);

  /**
   * UX-5: 테마 모드 → `<html data-theme="...">` 적용.
   *   - 'system' 인 경우 prefers-color-scheme 을 실시간 감시.
   *   - CSS 는 `[data-theme="light"]` / `[data-theme="dark"]` 규칙에서 변수를 override.
   */
  useEffect(() => {
    const root = document.documentElement;
    const apply = (effective: 'light' | 'dark'): void => {
      root.setAttribute('data-theme', effective);
      setThemeEffective(effective);
      // main 프로세스로 테마 통지 — nativeTheme.themeSource 및 BrowserWindow.setBackgroundColor 갱신.
      // macOS 의 신호등 영역(native titlebar) 까지 테마를 일치시키기 위함.
      try {
        window.api.theme?.set({ mode: themeMode, effective });
      } catch {
        /* 구버전 preload 호환 — theme 브리지 미제공 시 무시 */
      }
    };

    if (themeMode !== 'system') {
      apply(themeMode);
      return;
    }
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    apply(mql.matches ? 'light' : 'dark');
    const onChange = (e: MediaQueryListEvent): void => apply(e.matches ? 'light' : 'dark');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [themeMode]);

  // 앱 버전 조회
  useEffect(() => {
    void window.api.getVersion().then(setVersion);
  }, []);

  // UX-6: 시스템 메트릭 1Hz 구독
  useEffect(() => {
    const off = window.api.sys.onMetrics((m) => setSysMetrics(m));
    return () => off();
  }, []);

  // 초기 터미널 안내
  useEffect(() => {
    const t = termRef.current;
    if (!t) return;
    t.writeln('\x1b[36m[PNU PLIDE]\x1b[0m Terminal ready.');
    t.writeln('');
  }, []);

  /**
   * Phase 8: 기동 시 마지막 파일 자동 복원.
   *   - INITIAL_SAMPLE 은 그대로 보이다가, 비동기 로드가 성공하면 치환.
   *   - 파일 접근 실패(삭제/이동/권한) 시 조용히 skip.
   */
  useEffect(() => {
    const last = initialPrefs.lastFilePath;
    if (!last) return;
    let cancelled = false;
    void (async () => {
      try {
        const { filePath: p, content: c } = await window.api.fs.readFile(last);
        if (cancelled) return;
        setFilePath(p);
        setContent(c);
        setSavedContent(c);
        const detected = detectInterpreter(p);
        if (detected) setActiveInterpreterState(detected);
        termRef.current?.writeln(`\x1b[90m[file]\x1b[0m restored ${p}`);
      } catch {
        // 파일이 사라졌거나 권한이 없으면 복원 포기 — 기본 샘플 유지
        updatePrefs({ lastFilePath: undefined });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialPrefs.lastFilePath]);

  // main → renderer 이벤트 구독 (stdout / stderr / exit)
  useEffect(() => {
    const offOut = window.api.interp.onStdout(({ sessionId, data }) => {
      if (sessionId !== sessionIdRef.current) return;
      termRef.current?.write(data);
    });
    const offErr = window.api.interp.onStderr(({ sessionId, data }) => {
      if (sessionId !== sessionIdRef.current) return;
      // stderr 는 붉은색으로 구분
      termRef.current?.write(`\x1b[31m${data}\x1b[0m`);
    });
    const offExit = window.api.interp.onExit((info: ExitInfo) => {
      if (info.sessionId !== sessionIdRef.current) return;
      const t = termRef.current;
      if (info.errorMessage) {
        t?.writeln('');
        t?.writeln(`\x1b[31m[error]\x1b[0m ${info.errorMessage}`);
      }
      const tag = info.signal ? `signal=${info.signal}` : `exit=${info.code ?? '?'}`;
      t?.writeln(`\x1b[90m[session] 종료 (${tag})\x1b[0m`);
      sessionIdRef.current = null;
      inputBufferRef.current = '';
      historyIndexRef.current = -1;
      historyDraftRef.current = '';
      setIsRunning(false);
    });
    return () => {
      offOut();
      offErr();
      offExit();
    };
  }, []);

  const resetToEmpty = useCallback(() => {
    const sid = sessionIdRef.current;
    if (sid) void window.api.interp.kill(sid);
    sessionIdRef.current = null;
    inputBufferRef.current = '';
    historyRef.current = [];
    historyIndexRef.current = -1;
    historyDraftRef.current = '';
    setIsRunning(false);
    setFilePath(null);
    setContent('');
    setSavedContent('');
    setActiveInterpreter(null);
    termRef.current?.clear();
    updatePrefs({ lastFilePath: undefined });
  }, [setActiveInterpreter]);

  const onSave = useCallback(async (): Promise<string | null> => {
    let target = filePath;
    if (!target) {
      const defaultExt = activeInterpreter
        ? INTERPRETERS.find((i) => i.id === activeInterpreter)?.fileExtensions[0]
        : undefined;
      target = await window.api.fs.saveDialog(undefined, defaultExt ?? undefined);
      if (!target) return null;
    }
    await window.api.fs.writeFile(target, content);
    setFilePath(target);
    setSavedContent(content);
    updatePrefs({ lastFilePath: target });
    termRef.current?.writeln(`\x1b[90m[file]\x1b[0m saved ${target}`);
    return target;
  }, [filePath, content, activeInterpreter]);

  const onNew = useCallback(async () => {
    if (isDirty) {
      const response = await window.api.dialog.confirmClose();
      if (response === 2) return;
      if (response === 0) {
        const saved = await onSave();
        if (!saved) return;
      }
    }
    resetToEmpty();
  }, [isDirty, onSave, resetToEmpty]);

  const onOpen = useCallback(async () => {
    if (isDirty) {
      const response = await window.api.dialog.confirmClose();
      if (response === 2) return;
      if (response === 0) {
        const saved = await onSave();
        if (!saved) return;
      }
    }
    const picked = await window.api.fs.openDialog(activeInterpreter);
    if (!picked) return;
    // 실행 중인 세션 종료
    const sid = sessionIdRef.current;
    if (sid) void window.api.interp.kill(sid);
    sessionIdRef.current = null;
    inputBufferRef.current = '';
    setIsRunning(false);
    const { filePath: p, content: c } = await window.api.fs.readFile(picked);
    setFilePath(p);
    setContent(c);
    setSavedContent(c);
    setActiveInterpreter(detectInterpreter(p));
    updatePrefs({ lastFilePath: p });
    termRef.current?.writeln(`\x1b[90m[file]\x1b[0m loaded ${p}`);
  }, [isDirty, onSave, setActiveInterpreter, activeInterpreter]);

  const onClose = useCallback(async () => {
    if (isDirty) {
      const response = await window.api.dialog.confirmClose();
      if (response === 2) return; // 취소
      if (response === 0) {
        const saved = await onSave();
        if (!saved) return; // 저장 다이얼로그 취소
      }
      // response === 1 → 저장 안 함, 바로 닫기
    }
    resetToEmpty();
  }, [isDirty, onSave, resetToEmpty]);

  /**
   * Toolbar 드롭다운 전용 핸들러.
   *
   * 같은 언어 재선택은 no-op. dirty 라면 confirmClose 로 사용자 의사 확인.
   * 통과 시 실행 세션 종료 / 파일 컨텍스트 / 에디터 내용을 모두 비우고,
   * 새 언어가 KoBasic 이면 `10 ` 템플릿을 채워 즉시 입력 가능한 상태로 만든다.
   *
   * 파일 열기/드롭은 `setActiveInterpreter(detectInterpreter(p))` 를 그대로 사용 —
   * 파일 내용이 우선이므로 clear/템플릿 로직을 우회한다.
   */
  const selectInterpreterFromMenu = useCallback(
    async (id: InterpreterId) => {
      if (id === activeInterpreter) return;

      if (isDirty) {
        const response = await window.api.dialog.confirmClose();
        if (response === 2) return; // 취소 — 언어 변경도 abort
        if (response === 0) {
          const saved = await onSave();
          if (!saved) return; // 저장 다이얼로그 취소
        }
        // response === 1 → 저장 안 함, 진행
      }

      const sid = sessionIdRef.current;
      if (sid) void window.api.interp.kill(sid);
      sessionIdRef.current = null;
      inputBufferRef.current = '';
      setIsRunning(false);

      setFilePath(null);
      updatePrefs({ lastFilePath: undefined });

      const template = id === 'kobasic' ? '10 ' : '';
      setContent(template);
      setSavedContent(template);
      setActiveInterpreter(id);
    },
    [activeInterpreter, isDirty, onSave, setActiveInterpreter],
  );

  const onRun = useCallback(async () => {
    if (!activeInterpreter) return;
    if (isRunning) return;

    const t = termRef.current;

    // dirty 상태라면 먼저 저장
    let target = filePath;
    if (!target || isDirty) {
      target = await onSave();
      if (!target) return; // 저장 취소
    }

    try {
      t?.writeln('');
      t?.writeln(`\x1b[36m[run]\x1b[0m ${activeInterpreter} ${target}`);
      const result = await window.api.interp.runFile(activeInterpreter, target);
      sessionIdRef.current = result.sessionId;
      inputBufferRef.current = '';
      setIsRunning(true);
      const cmd = [result.resolved.command, ...result.resolved.args].join(' ');
      t?.writeln(`\x1b[90m[spawn:${result.resolved.origin}]\x1b[0m ${cmd} ${target}`);
      // UX: 실행 직후 터미널에 포커스 — 사용자가 별도 클릭 없이 stdin 을 즉시 입력 가능.
      t?.focus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      t?.writeln('');
      t?.writeln(`\x1b[31m[spawn failed]\x1b[0m ${msg}`);
      sessionIdRef.current = null;
      setIsRunning(false);
    }
  }, [activeInterpreter, isRunning, filePath, isDirty, onSave]);

  const onStop = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) {
      setIsRunning(false);
      return;
    }
    termRef.current?.writeln('\x1b[33m[kill]\x1b[0m SIGTERM 요청');
    await window.api.interp.kill(sid);
  }, []);

  // ------------------------------------------------------------------
  // Phase 4: 기동 시 자동 check (silent) + 툴바 버튼
  // ------------------------------------------------------------------

  const refreshUpdateCheck = useCallback(async (): Promise<UpdateCheckResult> => {
    const res = await window.api.updater.check();
    setUpdateCheck(res);
    return res;
  }, []);

  // dev 모드의 React.StrictMode 는 useEffect 를 두 번 실행해 silent check 의 async
  // 호출이 두 번 발사되고, 두 응답이 동일 터미널에 같은 안내를 중복 출력한다.
  // module-level ref 로 첫 호출만 통과시키되, 후속 mount(HMR/재진입) 에도 idempotent.
  const startupUpdateChecked = useRef(false);
  useEffect(() => {
    if (startupUpdateChecked.current) return;
    startupUpdateChecked.current = true;
    // 기동 시 silent check. s3BaseUrl 미설정이어도 DEFAULT_S3_BASE_URL 로 fallback.
    void (async () => {
      const res = await window.api.updater.check();
      setUpdateCheck(res);
      const count = res.entries.filter((e) => e.available).length;
      if (count > 0) {
        termRef.current?.writeln(
          `\x1b[36m[updater]\x1b[0m ${count} 개 인터프리터 업데이트 사용 가능`,
        );
      }
    })().catch(() => {
      /* 네트워크 오류 등은 조용히 skip — 사용자가 수동 체크 시 다시 시도 */
    });
  }, []);

  const onCheckUpdates = useCallback(() => {
    setUpdateDialogOpen(true);
    void refreshUpdateCheck();
  }, [refreshUpdateCheck]);

  const onApplyUpdate = useCallback(async (id: InterpreterId) => {
    const result = await window.api.updater.apply(id);
    termRef.current?.writeln(
      `\x1b[32m[updater]\x1b[0m ${id} → ${result.version} 설치 (${result.entrypointPath})`,
    );
  }, []);

  const updateAvailableCount = useMemo(
    () => (updateCheck?.entries ?? []).filter((e) => e.available).length,
    [updateCheck],
  );

  /**
   * UX: 애플리케이션 메뉴 & 단축키 → renderer 액션 브리지.
   *   - 최신 handler 를 ref 에 스냅샷해 stale closure 를 회피.
   *   - 메뉴 이벤트는 앱 수명 동안 단 1회만 구독.
   */
  const menuActionsRef = useRef({ onNew, onOpen, onSave, onRun });
  useEffect(() => {
    menuActionsRef.current = { onNew, onOpen, onSave, onRun };
  }, [onNew, onOpen, onSave, onRun]);
  useEffect(() => {
    const offNew = window.api.menu.onNewFile(() => void menuActionsRef.current.onNew());
    const offOpen = window.api.menu.onOpenFile(() => void menuActionsRef.current.onOpen());
    const offSave = window.api.menu.onSaveFile(() => void menuActionsRef.current.onSave());
    const offRun = window.api.menu.onRun(() => void menuActionsRef.current.onRun());
    return () => {
      offNew();
      offOpen();
      offSave();
      offRun();
    };
  }, []);

  /**
   * UX: 파일 드래그앤드롭 오픈.
   *   - Electron 32+ 에서 `File.path` 가 제거되어 preload 의 `fs.getPathForFile()` 사용.
   *   - 에디터/터미널 영역 어디에 드롭해도 동작하도록 root 에 리스너 부착.
   *   - `dragover` 기본 동작(금지 커서) 을 prevent 해야 drop 이 발화.
   */
  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);
  const onDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
      e.preventDefault();
      if (isDirty) {
        const response = await window.api.dialog.confirmClose();
        if (response === 2) return;
        if (response === 0) {
          const saved = await onSave();
          if (!saved) return;
        }
      }
      const file = e.dataTransfer.files[0];
      const picked = window.api.fs.getPathForFile(file);
      if (!picked) return;
      // 실행 중인 세션 종료
      const sid = sessionIdRef.current;
      if (sid) void window.api.interp.kill(sid);
      sessionIdRef.current = null;
      inputBufferRef.current = '';
      setIsRunning(false);
      try {
        const { filePath: p, content: c } = await window.api.fs.readFile(picked);
        setFilePath(p);
        setContent(c);
        setSavedContent(c);
        setActiveInterpreter(detectInterpreter(p));
        updatePrefs({ lastFilePath: p });
        termRef.current?.writeln(`\x1b[90m[file]\x1b[0m dropped ${p}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        termRef.current?.writeln(`\x1b[31m[drop failed]\x1b[0m ${msg}`);
      }
    },
    [isDirty, onSave, setActiveInterpreter],
  );

  const onTerminalInput = useCallback((data: string) => {
    const t = termRef.current;
    if (!t) return;

    const sid = sessionIdRef.current;
    if (!sid) {
      t.write(data);
      return;
    }

    // Ctrl+C
    if (data === '\x03') {
      t.writeln('^C');
      inputBufferRef.current = '';
      historyIndexRef.current = -1;
      historyDraftRef.current = '';
      void window.api.interp.kill(sid);
      return;
    }
    // Ctrl+D
    if (data === '\x04') {
      t.writeln('^D');
      inputBufferRef.current = '';
      historyIndexRef.current = -1;
      historyDraftRef.current = '';
      void window.api.interp.kill(sid);
      return;
    }
    // Backspace (DEL 0x7f 또는 BS 0x08)
    // 한글 등 CJK 전각 문자는 터미널에서 2셀을 차지하므로 '\b \b' (1셀) 만 보내면
    // 시각적으로 절반만 지워진다. Array.from 으로 코드포인트 단위 분리 후 마지막
    // 문자의 폭에 맞춰 '\b\b  \b\b' (2셀) 또는 '\b \b' (1셀) 를 송신.
    if (data === '\x7f' || data === '\b') {
      const chars = Array.from(inputBufferRef.current);
      const last = chars.pop();
      if (last !== undefined) {
        inputBufferRef.current = chars.join('');
        t.write(isWideChar(last) ? '\b\b  \b\b' : '\b \b');
      }
      return;
    }
    // 위 화살표 — 이전 명령어
    if (data === '\x1b[A') {
      const history = historyRef.current;
      if (history.length === 0) return;
      if (historyIndexRef.current === -1) {
        historyDraftRef.current = inputBufferRef.current;
        historyIndexRef.current = history.length - 1;
      } else if (historyIndexRef.current > 0) {
        historyIndexRef.current -= 1;
      }
      const entry = history[historyIndexRef.current];
      t.write('\r\x1b[K' + entry);
      inputBufferRef.current = entry;
      return;
    }
    // 아래 화살표 — 다음 명령어 또는 draft 복원
    if (data === '\x1b[B') {
      if (historyIndexRef.current === -1) return;
      const history = historyRef.current;
      if (historyIndexRef.current < history.length - 1) {
        historyIndexRef.current += 1;
        const entry = history[historyIndexRef.current];
        t.write('\r\x1b[K' + entry);
        inputBufferRef.current = entry;
      } else {
        const draft = historyDraftRef.current;
        historyIndexRef.current = -1;
        historyDraftRef.current = '';
        t.write('\r\x1b[K' + draft);
        inputBufferRef.current = draft;
      }
      return;
    }
    // Enter
    if (data === '\r' || data === '\n' || data === '\r\n') {
      const line = inputBufferRef.current;
      if (line.trim()) {
        historyRef.current.push(line);
      }
      historyIndexRef.current = -1;
      historyDraftRef.current = '';
      inputBufferRef.current = '';
      t.write('\r\n');
      void window.api.interp.writeStdin(sid, line + '\n');
      return;
    }
    // 그 외 printable / multibyte (IME 포함). 제어 문자는 무시.
    if (data.length > 0 && data.charCodeAt(0) >= 0x20) {
      // 히스토리 탐색 중 새 문자 입력 시 탐색 해제
      if (historyIndexRef.current !== -1) {
        historyIndexRef.current = -1;
        historyDraftRef.current = '';
      }
      inputBufferRef.current += data;
      t.write(data);
    }
  }, []);

  return (
    <div className="app-root" onDragOver={onDragOver} onDrop={(e) => void onDrop(e)}>
      <Toolbar
        currentFilePath={filePath}
        isDirty={isDirty}
        isRunning={isRunning}
        activeInterpreter={activeInterpreter}
        onNew={onNew}
        onOpen={onOpen}
        onClose={() => void onClose()}
        onSave={() => void onSave()}
        onRun={() => void onRun()}
        onStop={() => void onStop()}
        onOpenSettings={() => setSettingsOpen(true)}
        onCheckUpdates={onCheckUpdates}
        updateBadge={updateAvailableCount}
        onSelectInterpreter={(id) => void selectInterpreterFromMenu(id)}
      />

      <UpdateDialog
        open={updateDialogOpen}
        onClose={() => setUpdateDialogOpen(false)}
        check={updateCheck}
        onRefresh={async () => {
          await refreshUpdateCheck();
        }}
        onApply={onApplyUpdate}
      />

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        codeFont={codeFont}
        fontSize={fontSize}
        themeMode={themeMode}
        onCodeFontChange={selectCodeFont}
        onFontSizeChange={selectFontSize}
        onThemeModeChange={selectThemeMode}
      />

      <div className="app-main">
        <Layout
          editor={
            <Editor
              value={content}
              language={language}
              onChange={setContent}
              path={filePath ?? undefined}
              fontFamily={fontFamily}
              fontSize={fontSize}
              themeEffective={themeEffective}
            />
          }
          terminal={
            <Terminal
              ref={termRef}
              onInput={onTerminalInput}
              fontFamily={fontFamily}
              fontSize={Math.max(10, fontSize - 1)}
              themeEffective={themeEffective}
            />
          }
        />
      </div>

      <footer className="app-footer">
        <StatusBar version={version} metrics={sysMetrics} />
      </footer>
    </div>
  );
}

export default App;
