/**
 * 세 교육용 언어의 Monaco 등록 엔트리.
 *
 * `registerPnuLanguages()` 는 앱 마운트 시 1회 호출되어야 한다.
 * 이미 등록된 언어는 skip 하므로 HMR 재실행에도 안전.
 *
 * 테마:
 *   - `vs-dark` 기본 토큰 스타일을 그대로 쓰되, `support.function` / `variable` /
 *     `number.line` / `constant` 토큰에 대한 커스텀 색상을 `pnu-dark` 테마로 정의.
 */
import * as monaco from 'monaco-editor';
import {
  KOBASIC_LANGUAGE_ID,
  kobasicLangConfig,
  kobasicTokens,
} from './kobasic';
import {
  KPROLOG_LANGUAGE_ID,
  kprologLangConfig,
  kprologTokens,
} from './kprolog';
import { MOWKOW_LANGUAGE_ID, mowkowLangConfig, mowkowTokens } from './mowkow';

let registered = false;

function registerLanguage(
  id: string,
  exts: string[],
  tokens: monaco.languages.IMonarchLanguage,
  config: monaco.languages.LanguageConfiguration,
): void {
  const existing = monaco.languages.getLanguages().find((l) => l.id === id);
  if (!existing) {
    monaco.languages.register({ id, extensions: exts, aliases: [id] });
  }
  monaco.languages.setMonarchTokensProvider(id, tokens);
  monaco.languages.setLanguageConfiguration(id, config);
}

export const PNU_THEME_ID = 'pnu-dark';

function defineTheme(): void {
  monaco.editor.defineTheme(PNU_THEME_ID, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c586c0', fontStyle: 'bold' },
      { token: 'keyword.operator', foreground: 'c586c0' },
      { token: 'support.function', foreground: 'dcdcaa' },
      { token: 'identifier', foreground: '9cdcfe' },
      { token: 'variable', foreground: '4fc1ff', fontStyle: 'italic' },
      { token: 'constant', foreground: '569cd6' },
      { token: 'number', foreground: 'b5cea8' },
      { token: 'number.hex', foreground: 'b5cea8' },
      { token: 'number.line', foreground: '808080' },
      { token: 'string', foreground: 'ce9178' },
      { token: 'string.escape', foreground: 'd7ba7d' },
      { token: 'operator', foreground: 'd4d4d4' },
      { token: 'delimiter.terminator', foreground: 'c586c0', fontStyle: 'bold' },
    ],
    colors: {},
  });
}

export function registerPnuLanguages(): void {
  if (registered) return;
  registered = true;

  registerLanguage(MOWKOW_LANGUAGE_ID, ['.mk'], mowkowTokens, mowkowLangConfig);
  registerLanguage(KOBASIC_LANGUAGE_ID, ['.kob'], kobasicTokens, kobasicLangConfig);
  registerLanguage(KPROLOG_LANGUAGE_ID, ['.kpl'], kprologTokens, kprologLangConfig);

  defineTheme();
}

export {
  MOWKOW_LANGUAGE_ID,
  KOBASIC_LANGUAGE_ID,
  KPROLOG_LANGUAGE_ID,
};
