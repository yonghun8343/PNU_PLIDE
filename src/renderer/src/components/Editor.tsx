import { useEffect, useRef, type JSX } from 'react';
import * as monaco from 'monaco-editor';
import '../monaco-env';
import { registerPnuLanguages, themeIdFor } from '../monaco-languages';
import { attachKobasicAutoNumbering } from '../monaco-languages/kobasic-features';

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
  /** 현재 유효 테마 (system 은 부모에서 미리 해소). 미지정 시 dark. */
  themeEffective?: 'light' | 'dark';
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
  themeEffective,
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
      theme: themeIdFor(themeEffective ?? 'dark'),
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
      // KoBasic 은 코드 내부에 직접 10/20/30 번호를 작성하는 BASIC 문법이라
      // Monaco 의 거터(gutter) 번호와 중복되어 혼란을 준다 — 해당 언어에서만 숨김.
      lineNumbers: language === 'kobasic' ? 'off' : 'on',
    });

    editorRef.current = editor;

    // D2Coding 등 번들 폰트가 swap 타이밍에 로드되면 Monaco의 문자 폭 캐시가 stale해짐.
    // fonts.ready 후 remeasureFonts()로 CJK 전각 폭을 재계산한다.
    void document.fonts.ready.then(() => monaco.editor.remeasureFonts());

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
    // 거터 라인 넘버: KoBasic 만 off (인라인 BASIC 라인 번호와 중복 방지).
    editor.updateOptions({ lineNumbers: language === 'kobasic' ? 'off' : 'on' });
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

  // 테마 동적 변경 — monaco.editor.setTheme 은 전역이지만, 단일 에디터만 있는
  // 현재 구조에서는 안전. 다중 에디터 도입 시 editor.updateOptions 쪽으로 옮긴다.
  useEffect(() => {
    if (!editorRef.current) return;
    monaco.editor.setTheme(themeIdFor(themeEffective ?? 'dark'));
  }, [themeEffective]);

  // KoBasic 전용: Enter 자동 라인 번호 + 재번호 단축키.
  // language 가 'kobasic' 인 동안만 attach 되고, 다른 언어로 전환 시 dispose.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || language !== 'kobasic') return;
    return attachKobasicAutoNumbering(editor);
  }, [language]);

  // KoBasic 초기 템플릿 (`10 `) 진입 시 커서를 라인 1 / 컬럼 4 (공백 뒤) 로 자동 배치.
  // 사용자 타이핑 중에는 value !== '10 ' 가 되므로 short-circuit — 부작용 없음.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (language !== 'kobasic' || value !== '10 ') return;
    editor.setPosition({ lineNumber: 1, column: 4 });
    editor.focus();
  }, [value, language]);

  // path 는 추후 멀티 모델 전환용 예약
  void path;

  return <div ref={containerRef} className="monaco-host" />;
}
