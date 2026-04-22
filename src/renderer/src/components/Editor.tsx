import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import '../monaco-env';
import { PNU_THEME_ID, registerPnuLanguages } from '../monaco-languages';

// 모듈 로드 시 1회 — 이후 HMR 재호출에도 idempotent.
registerPnuLanguages();

export interface EditorProps {
  value: string;
  language: string;
  onChange: (next: string) => void;
  path?: string;
  readOnly?: boolean;
  fontFamily?: string;
  /** 에디터 폰트 크기(px). 미지정 시 13. */
  fontSize?: number;
}

/**
 * Monaco Editor React 래퍼.
 *
 * 외부 상태(`value`) 변경은 model.setValue 로 반영하되, 사용자가 타이핑 중인
 * 로컬 변경과 충돌하지 않도록 편집기 내부 값과 다를 때만 적용한다.
 * 에디터 인스턴스는 언마운트 시 dispose.
 */
export function Editor({
  value,
  language,
  onChange,
  path,
  readOnly,
  fontFamily,
  fontSize,
}: EditorProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 마운트 시 편집기 1회 생성
  useEffect(() => {
    if (!containerRef.current) return;

    const editor = monaco.editor.create(containerRef.current, {
      value,
      language,
      theme: PNU_THEME_ID,
      automaticLayout: true,
      fontFamily:
        fontFamily ??
        "'D2Coding', 'Noto Sans Mono CJK KR', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
      fontSize: fontSize ?? 13,
      lineHeight: Math.round((fontSize ?? 13) * 1.5),
      minimap: { enabled: false },
      renderWhitespace: 'selection',
      tabSize: 2,
      insertSpaces: true,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      wordWrap: 'off',
      readOnly,
    });

    editorRef.current = editor;

    const disposable = editor.onDidChangeModelContent(() => {
      onChangeRef.current(editor.getValue());
    });

    return () => {
      disposable.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 외부 value/language 변경 동기화
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    if (model.getValue() !== value) {
      model.setValue(value);
    }
    if (model.getLanguageId() !== language) {
      monaco.editor.setModelLanguage(model, language);
    }
  }, [value, language]);

  // readOnly 토글
  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly: Boolean(readOnly) });
  }, [readOnly]);

  // fontFamily 동적 변경 (Monaco 는 updateOptions 로 즉시 반영)
  useEffect(() => {
    if (!fontFamily) return;
    editorRef.current?.updateOptions({ fontFamily });
  }, [fontFamily]);

  // fontSize 동적 변경
  useEffect(() => {
    if (!fontSize) return;
    editorRef.current?.updateOptions({
      fontSize,
      lineHeight: Math.round(fontSize * 1.5),
    });
  }, [fontSize]);

  // path 는 추후 멀티 모델 전환용 예약
  void path;

  return <div ref={containerRef} className="monaco-host" />;
}
