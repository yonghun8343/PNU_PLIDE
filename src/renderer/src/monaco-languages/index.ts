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

export const PNU_THEME_ID_DARK = 'pnu-dark';
export const PNU_THEME_ID_LIGHT = 'pnu-light';

/**
 * @deprecated 하위 호환용 alias. 새 코드는 `PNU_THEME_ID_DARK` 또는
 * `themeIdFor(effective)` 를 사용하라.
 */
export const PNU_THEME_ID = PNU_THEME_ID_DARK;

/**
 * effective 테마(light|dark) → 등록된 Monaco 테마 ID.
 * Editor 컴포넌트에서 `monaco.editor.setTheme()` 에 바로 전달한다.
 */
export function themeIdFor(effective: 'light' | 'dark'): string {
  return effective === 'light' ? PNU_THEME_ID_LIGHT : PNU_THEME_ID_DARK;
}

function defineThemes(): void {
  // Dark — VS Code Dark+ 기반 (기존 pnu-dark 유지)
  monaco.editor.defineTheme(PNU_THEME_ID_DARK, {
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

  // Light — VS Code Light+ 기반. 색은 WCAG AA 대비를 기준으로 조정.
  monaco.editor.defineTheme(PNU_THEME_ID_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '008000', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'af00db', fontStyle: 'bold' },
      { token: 'keyword.operator', foreground: 'af00db' },
      { token: 'support.function', foreground: '795e26' },
      { token: 'identifier', foreground: '001080' },
      { token: 'variable', foreground: '0070c1', fontStyle: 'italic' },
      { token: 'constant', foreground: '0451a5' },
      { token: 'number', foreground: '098658' },
      { token: 'number.hex', foreground: '098658' },
      { token: 'number.line', foreground: '707070' },
      { token: 'string', foreground: 'a31515' },
      { token: 'string.escape', foreground: '811f3f' },
      { token: 'operator', foreground: '000000' },
      { token: 'delimiter.terminator', foreground: 'af00db', fontStyle: 'bold' },
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

  defineThemes();
}

export {
  MOWKOW_LANGUAGE_ID,
  KOBASIC_LANGUAGE_ID,
  KPROLOG_LANGUAGE_ID,
};
