import { INTERPRETERS, type InterpreterId } from './types';

/**
 * 파일 확장자 ↔ 인터프리터 매핑 유틸.
 * Monaco 언어 ID 는 Phase 5 에서 등록한 3종 (`mowkow`, `kobasic`, `kprolog`).
 */

export function extensionOf(filePath: string): string {
  const m = /\.[^./\\]+$/.exec(filePath);
  return m ? m[0].toLowerCase() : '';
}

export function detectInterpreter(filePath: string): InterpreterId | null {
  const ext = extensionOf(filePath);
  const hit = INTERPRETERS.find((i) => i.fileExtensions.includes(ext));
  return hit?.id ?? null;
}

/**
 * InterpreterId → Monaco language ID.
 * 미등록 상태(예: 선택 없음) 에서는 `plaintext` 로 fallback.
 * 실제 등록은 renderer 의 `registerPnuLanguages()` 에서 수행.
 */
export function monacoLanguageFor(interpreter: InterpreterId | null): string {
  switch (interpreter) {
    case 'mowkow':
      return 'mowkow';
    case 'kobasic':
      return 'kobasic';
    case 'kprolog':
      return 'kprolog';
    default:
      return 'plaintext';
  }
}
