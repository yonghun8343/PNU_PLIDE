import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Terminal as XtermTerminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

export interface TerminalHandle {
  write(data: string): void;
  writeln(data: string): void;
  clear(): void;
  fit(): void;
  focus(): void;
}

export interface TerminalProps {
  /** 사용자가 키를 입력할 때 호출. Phase 3에서 child process stdin 으로 파이프. */
  onInput?: (data: string) => void;
  fontFamily?: string;
  /** 터미널 폰트 크기(px). 미지정 시 12. */
  fontSize?: number;
  /** 현재 유효 테마 (system 은 부모에서 미리 해소). 미지정 시 dark. */
  themeEffective?: 'light' | 'dark';
}

/**
 * Xterm 팔레트 — 다크/라이트 두 세트.
 * - 다크는 기존 VS Code Dark+ 톤 유지.
 * - 라이트는 VS Code Light+ 톤. ANSI 색은 배경이 밝아도 대비가 확보되도록 조정.
 */
const XTERM_THEME_DARK: ITheme = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#4fc1ff',
  selectionBackground: '#264f78',
};
const XTERM_THEME_LIGHT: ITheme = {
  background: '#ffffff',
  foreground: '#1f1f1f',
  cursor: '#0b6fc2',
  selectionBackground: '#cbe4f9',
  black: '#000000',
  red: '#a31515',
  green: '#007a3d',
  yellow: '#a37100',
  blue: '#0451a5',
  magenta: '#af00db',
  cyan: '#007a9a',
  white: '#5a5a5a',
  brightBlack: '#707070',
  brightRed: '#c4312c',
  brightGreen: '#098658',
  brightYellow: '#b58900',
  brightBlue: '#0070c1',
  brightMagenta: '#b4009e',
  brightCyan: '#16858d',
  brightWhite: '#1f1f1f',
};

function xtermThemeFor(effective: 'light' | 'dark'): ITheme {
  return effective === 'light' ? XTERM_THEME_LIGHT : XTERM_THEME_DARK;
}

/**
 * Xterm.js 래퍼.
 *
 * - FitAddon 으로 컨테이너 크기에 자동 맞춤 (ResizeObserver 연동)
 * - WebLinksAddon 으로 URL 클릭 가능
 * - 부모는 ref 로 write / writeln / clear / fit / focus API 사용
 * - Phase 2 시점에서는 onInput 을 에코용으로만 사용하고, Phase 3 에서
 *   main process 로 IPC 전달하도록 교체.
 */
export const Terminal = forwardRef<TerminalHandle, TerminalProps>(function Terminal(
  { onInput, fontFamily, fontSize, themeEffective },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XtermTerminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const term = new XtermTerminal({
      fontFamily:
        fontFamily ??
        "'D2Coding', 'Noto Sans Mono CJK KR', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
      fontSize: fontSize ?? 12,
      lineHeight: 1.3,
      cursorBlink: true,
      convertEol: true,
      scrollback: 5000,
      theme: xtermThemeFor(themeEffective ?? 'dark'),
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());

    term.open(hostRef.current);
    fit.fit();

    /**
     * IME (한글 2벌식 / 일본어 / 중국어 병음 등) 대응.
     *
     * Xterm 5.5 는 대부분의 플랫폼에서 `compositionend` 의 최종 문자열을
     * `onData` 로 자체 emit 한다. 그러나 Electron macOS 한글 입력기나 빠른
     * 타이핑 상황에서 간헐적으로 emit 이 누락되는 사례가 보고된다.
     *
     * 전략:
     *   1) `compositionstart` ~ `compositionend` 동안은 `onData` 를 무시 (조합 중
     *      자모/불완전 키 차단).
     *   2) `compositionend.data` 를 수동으로 flush 하면서 타임스탬프와 함께 기록.
     *   3) Xterm 이 같은 문자열을 곧바로 `onData` 에 재 emit 하면 dedupe 창(150ms)
     *      내에서 1회 drop — 중복 방지.
     *
     * textarea 는 Xterm 이 `.xterm-helper-textarea` 로 DOM 에 심어둔다.
     */
    const helperTextarea = hostRef.current?.querySelector<HTMLTextAreaElement>(
      'textarea.xterm-helper-textarea',
    );
    let composing = false;
    let lastComposed = '';
    let lastComposedAt = 0;

    const onCompositionStart = (): void => {
      composing = true;
    };
    const onCompositionEnd = (e: Event): void => {
      composing = false;
      const composed = (e as CompositionEvent).data;
      if (!composed) return;
      lastComposed = composed;
      lastComposedAt = performance.now();
      onInput?.(composed);
    };
    helperTextarea?.addEventListener('compositionstart', onCompositionStart);
    helperTextarea?.addEventListener('compositionend', onCompositionEnd);

    const onDataDisposable = term.onData((data) => {
      if (composing) return;
      // Xterm 자체의 composed 재 emit 을 dedupe (150ms 창, 1회).
      if (data === lastComposed && performance.now() - lastComposedAt < 150) {
        lastComposed = '';
        return;
      }
      onInput?.(data);
    });

    // 컨테이너 리사이즈 대응
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // 컨테이너가 0 크기로 일시적으로 줄어들 때 예외 무시
      }
    });
    ro.observe(hostRef.current);

    termRef.current = term;
    fitRef.current = fit;

    return () => {
      ro.disconnect();
      onDataDisposable.dispose();
      helperTextarea?.removeEventListener('compositionstart', onCompositionStart);
      helperTextarea?.removeEventListener('compositionend', onCompositionEnd);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // onInput 은 ref로 관리하지 않고 클로저 캡처. 변경 가능성이 낮아 의존성 비움.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fontFamily 변경 — Xterm 은 options 직접 할당 후 fit 재계산 필요
  useEffect(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fontFamily) return;
    term.options.fontFamily = fontFamily;
    try {
      fit?.fit();
    } catch {
      /* ignore */
    }
  }, [fontFamily]);

  // fontSize 변경 — fit 재계산이 반드시 필요 (그리드가 셀 크기 기준).
  useEffect(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fontSize) return;
    term.options.fontSize = fontSize;
    try {
      fit?.fit();
    } catch {
      /* ignore */
    }
  }, [fontSize]);

  // themeEffective 변경 — xterm.options.theme 에 직접 할당하면 리렌더가 자동 발생.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = xtermThemeFor(themeEffective ?? 'dark');
  }, [themeEffective]);

  useImperativeHandle(
    ref,
    () => ({
      write: (data) => termRef.current?.write(data),
      writeln: (data) => termRef.current?.writeln(data),
      clear: () => termRef.current?.clear(),
      fit: () => fitRef.current?.fit(),
      focus: () => termRef.current?.focus(),
    }),
    [],
  );

  return <div ref={hostRef} className="xterm-host" />;
});
