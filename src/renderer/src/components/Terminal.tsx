import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Terminal as XtermTerminal } from '@xterm/xterm';
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
  { onInput, fontFamily, fontSize },
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
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#4fc1ff',
        selectionBackground: '#264f78',
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());

    term.open(hostRef.current);
    fit.fit();

    const onDataDisposable = term.onData((data) => {
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
