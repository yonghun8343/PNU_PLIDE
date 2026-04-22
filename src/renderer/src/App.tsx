import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
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

function App(): JSX.Element {
  // Phase 8: persistence — 기동 시 1회 로드
  const initialPrefs = useMemo(() => loadPrefs(), []);

  const [version, setVersion] = useState<AppVersionInfo | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState<string>(INITIAL_SAMPLE);
  const [savedContent, setSavedContent] = useState<string>(INITIAL_SAMPLE);
  const [activeInterpreter, setActiveInterpreterState] = useState<InterpreterId | null>(
    initialPrefs.activeInterpreter ?? null,
  );
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
   * setActiveInterpreter 래퍼 — state 변경 + preferences 저장.
   * Toolbar / Sidebar 의 "선택" 이벤트를 모두 이 함수로 받아 persistence 를 중앙화.
   */
  const setActiveInterpreter = useCallback((id: InterpreterId | null) => {
    setActiveInterpreterState(id);
    if (id) updatePrefs({ activeInterpreter: id });
  }, []);

  const termRef = useRef<TerminalHandle>(null);
  /** 현재 active session 식별자. stdin / kill 라우팅용. */
  const sessionIdRef = useRef<SessionId | null>(null);
  /** line-buffered input 누적 버퍼 (세션이 running 인 동안만 사용) */
  const inputBufferRef = useRef<string>('');

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
    t.writeln('\x1b[36m[PNU PL IDE]\x1b[0m Terminal ready.');
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
      setIsRunning(false);
    });
    return () => {
      offOut();
      offErr();
      offExit();
    };
  }, []);

  const onNew = useCallback(() => {
    setFilePath(null);
    setContent('');
    setSavedContent('');
    updatePrefs({ lastFilePath: undefined });
  }, []);

  const onOpen = useCallback(async () => {
    const picked = await window.api.fs.openDialog();
    if (!picked) return;
    const { filePath: p, content: c } = await window.api.fs.readFile(picked);
    setFilePath(p);
    setContent(c);
    setSavedContent(c);
    const detected = detectInterpreter(p);
    if (detected) setActiveInterpreter(detected);
    updatePrefs({ lastFilePath: p });
    termRef.current?.writeln(`\x1b[90m[file]\x1b[0m loaded ${p}`);
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

  useEffect(() => {
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
    const offNew = window.api.menu.onNewFile(() => menuActionsRef.current.onNew());
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
      const file = e.dataTransfer.files[0];
      const picked = window.api.fs.getPathForFile(file);
      if (!picked) return;
      try {
        const { filePath: p, content: c } = await window.api.fs.readFile(picked);
        setFilePath(p);
        setContent(c);
        setSavedContent(c);
        const detected = detectInterpreter(p);
        if (detected) setActiveInterpreter(detected);
        updatePrefs({ lastFilePath: p });
        termRef.current?.writeln(`\x1b[90m[file]\x1b[0m dropped ${p}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        termRef.current?.writeln(`\x1b[31m[drop failed]\x1b[0m ${msg}`);
      }
    },
    [setActiveInterpreter],
  );

  /**
   * Xterm 입력 라인 버퍼링:
   *   - pipe 모드 (no PTY) 이므로 child 가 echo 를 주지 않는다 → 로컬 에코 필요.
   *   - 인터프리터가 line-buffered readline 을 쓰는 경우가 많아, Enter 까지 대기했다가 한 줄씩 stdin 에 write.
   *   - Ctrl+C → kill, Backspace → 버퍼/화면 동기화, IME 포함 멀티바이트 문자열은 그대로 pass.
   */
  const onTerminalInput = useCallback((data: string) => {
    const t = termRef.current;
    if (!t) return;

    const sid = sessionIdRef.current;
    if (!sid) {
      // 세션 없음 — 기존 로컬 에코 fallback
      t.write(data);
      return;
    }

    // Ctrl+C
    if (data === '\x03') {
      t.writeln('^C');
      inputBufferRef.current = '';
      void window.api.interp.kill(sid);
      return;
    }
    // Ctrl+D — 현 단계에서는 세션 종료 신호로 사용
    if (data === '\x04') {
      t.writeln('^D');
      inputBufferRef.current = '';
      void window.api.interp.kill(sid);
      return;
    }
    // Backspace (DEL 0x7f 또는 BS 0x08)
    if (data === '\x7f' || data === '\b') {
      if (inputBufferRef.current.length > 0) {
        inputBufferRef.current = inputBufferRef.current.slice(0, -1);
        t.write('\b \b');
      }
      return;
    }
    // Enter
    if (data === '\r' || data === '\n' || data === '\r\n') {
      const line = inputBufferRef.current + '\n';
      inputBufferRef.current = '';
      t.write('\r\n');
      void window.api.interp.writeStdin(sid, line);
      return;
    }
    // 그 외: printable / multibyte (IME 포함). 제어 문자는 무시.
    if (data.length > 0 && data.charCodeAt(0) >= 0x20) {
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
        onSave={() => void onSave()}
        onRun={() => void onRun()}
        onStop={() => void onStop()}
        onOpenSettings={() => setSettingsOpen(true)}
        onCheckUpdates={onCheckUpdates}
        updateBadge={updateAvailableCount}
        onSelectInterpreter={setActiveInterpreter}
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
