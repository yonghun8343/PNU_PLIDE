/**
 * Monaco Editor 환경 부트스트랩.
 *
 * 직접 import(`monaco-editor`) 방식을 사용하므로, editor.worker 를 Vite 의
 * `?worker` 로 번들하여 MonacoEnvironment.getWorker 에 연결한다.
 *
 * Mowkow / Kobasic / K-Prolog 는 모두 Monaco 내장 언어가 아니므로
 * json/ts/css/html worker 는 포함하지 않는다 (번들 크기 약 -10MB).
 * Phase 5 에서 Monarch tokenizer 로 각 언어 문법을 추가할 예정이며,
 * Monarch 는 별도 worker 없이 메인 스레드에서 동작한다.
 */
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

self.MonacoEnvironment = {
  getWorker(): Worker {
    return new EditorWorker();
  },
};

// side-effect import 전용 모듈
export {};
