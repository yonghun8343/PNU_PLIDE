/**
 * KoBasic 전용 에디터 보조 기능.
 *
 *   1) Enter → 다음 라인 번호 자동 삽입
 *      - 직전 라인이 `\d+` 로 시작하면 +10 을 prefix 로
 *      - 직전·다음 라인이 둘 다 번호를 가지고 있으면 midpoint
 *      - 간격이 부족(연속 정수) 하면 auto-number 포기 → 기본 Enter 동작
 *
 *   2) Cmd/Ctrl + Alt + R → 전체 라인 재번호 (10단위로 재정렬)
 *
 * 라인 번호 검출 정책: 라인 첫 토큰이 정수 + (공백 또는 EOL) 이어야 한다.
 *   "10 PRINT" ✓     "100"  ✓ (단독 라인)
 *   "100abc"  ✗     "PRINT 10"  ✗
 *
 * 이 모듈은 language === 'kobasic' 일 때만 attach 되며, 반환된 dispose 로 정리.
 */
import * as monaco from 'monaco-editor';

const LINE_NUMBER_RE = /^(\d+)(?=\s|$)/;
const STEP = 10;

/**
 * 주어진 에디터에 KoBasic 자동 번호 매기기 기능을 attach.
 * @returns dispose 함수 — 언어 전환 시 호출하여 모든 리스너/액션 해제.
 */
export function attachKobasicAutoNumbering(
  editor: monaco.editor.IStandaloneCodeEditor,
): () => void {
  const disposables: monaco.IDisposable[] = [];

  // ─── Enter 자동 번호 ──────────────────────────────────────────────
  disposables.push(
    editor.onKeyDown((e) => {
      if (e.keyCode !== monaco.KeyCode.Enter) return;
      // 수정자 키가 같이 눌렸으면 (예: Shift+Enter, Alt+Enter) 기본 동작 유지
      if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;

      const model = editor.getModel();
      if (!model) return;
      const pos = editor.getPosition();
      if (!pos) return;

      // 선택 영역이 있는 Enter (선택 치환) 는 BASIC 라인 구조를 깨므로 기본 동작
      const sel = editor.getSelection();
      if (!sel || !sel.isEmpty()) return;

      const currentLine = model.getLineContent(pos.lineNumber);
      const match = LINE_NUMBER_RE.exec(currentLine);
      if (!match) return;
      const currentNum = parseInt(match[1], 10);

      // 커서가 라인 번호 영역(숫자 + 직후) 안이면 사용자가 번호 자체를 편집 중 → 기본 동작
      if (pos.column <= match[1].length + 1) return;

      let newNum: number;
      const lineCount = model.getLineCount();
      if (pos.lineNumber < lineCount) {
        const nextLine = model.getLineContent(pos.lineNumber + 1);
        const nextMatch = LINE_NUMBER_RE.exec(nextLine);
        if (nextMatch) {
          const nextNum = parseInt(nextMatch[1], 10);
          const mid = Math.floor((currentNum + nextNum) / 2);
          // 간격 부족 (e.g. 10/11) — 사용자가 재번호를 직접 실행하도록 기본 Enter 양보
          if (mid <= currentNum) return;
          newNum = mid;
        } else {
          newNum = currentNum + STEP;
        }
      } else {
        newNum = currentNum + STEP;
      }

      e.preventDefault();
      e.stopPropagation();

      editor.executeEdits('kobasic-auto-number', [
        {
          range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
          text: `\n${newNum} `,
          forceMoveMarkers: true,
        },
      ]);
    }),
  );

  // ─── 전체 재번호 (Cmd/Ctrl + Alt + R) ──────────────────────────────
  disposables.push(
    editor.addAction({
      id: 'kobasic.renumber',
      label: 'KoBasic: 전체 라인 재번호 (10단위)',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyR],
      precondition: 'editorLangId == kobasic',
      contextMenuGroupId: 'modification',
      contextMenuOrder: 1.5,
      run: (ed) => {
        const model = ed.getModel();
        if (!model) return;
        const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
        let counter = STEP;
        const totalLines = model.getLineCount();
        for (let i = 1; i <= totalLines; i++) {
          const content = model.getLineContent(i);
          const m = LINE_NUMBER_RE.exec(content);
          if (!m) continue;
          edits.push({
            range: new monaco.Range(i, 1, i, m[1].length + 1),
            text: String(counter),
          });
          counter += STEP;
        }
        if (edits.length > 0) {
          ed.executeEdits('kobasic-renumber', edits);
        }
      },
    }),
  );

  return () => {
    for (const d of disposables) d.dispose();
  };
}
