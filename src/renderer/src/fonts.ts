/**
 * 코드 전용 모노스페이스 폰트 번들.
 *
 * D2Coding (NAVER, OFL): 한글 폭이 ASCII 2배로 정확히 정렬되어 한글 코드 편집에 최적.
 * Hack  (MIT/Bitstream Vera): 기호 구분이 명확한 영문 프로그래밍 폰트.
 *
 * 폰트 파일은 app/resources/font/ 아래에 번들되며, Vite 의 `?url` 쿼리 import 를 통해
 *   - dev:  file:// 또는 Vite dev-server 의 파일 URL
 *   - prod: Rollup 이 해시해 번들에 포함한 assets/*.{ttf,woff2} URL
 * 로 치환된다. CSP 의 `font-src 'self'` 를 벗어나지 않으므로 네트워크 요청 없음.
 */

// alias @fonts → app/resources/font (electron.vite.config.ts 참조)
import d2codingRegular from '@fonts/D2Coding-Ver1.3.2-20180524.ttf?url';
import d2codingBold from '@fonts/D2CodingBold-Ver1.3.2-20180524.ttf?url';
import hackRegular from '@fonts/hack-regular.woff2?url';
import hackBold from '@fonts/hack-bold.woff2?url';

type FontFormat = 'truetype' | 'woff2';

/**
 * `@font-face` 규칙을 런타임에 `<head>` 로 주입.
 * 중복 주입 방지를 위해 data-attribute 마커로 existence 체크.
 */
function injectFontFace(
  family: string,
  weight: 400 | 700,
  url: string,
  format: FontFormat,
): void {
  const marker = `pnu-font-${family.toLowerCase()}-${weight}`;
  if (document.querySelector(`style[data-font="${marker}"]`)) return;

  const style = document.createElement('style');
  style.setAttribute('data-font', marker);
  style.textContent = `@font-face {
  font-family: '${family}';
  src: url('${url}') format('${format}');
  font-weight: ${weight};
  font-style: normal;
  font-display: swap;
}`;
  document.head.appendChild(style);
}

// 모듈 import 시점에 1회 주입.
injectFontFace('D2Coding', 400, d2codingRegular, 'truetype');
injectFontFace('D2Coding', 700, d2codingBold, 'truetype');
injectFontFace('Hack', 400, hackRegular, 'woff2');
injectFontFace('Hack', 700, hackBold, 'woff2');

/** CodeFont 선택값. App 레벨에서 persistence 대상. */
export type CodeFontId = 'd2coding' | 'hack';

export interface CodeFontSpec {
  id: CodeFontId;
  displayName: string;
  /** Monaco·Xterm 의 fontFamily 에 직접 대입 가능한 fallback 체인. */
  family: string;
}

export const CODE_FONTS: readonly CodeFontSpec[] = [
  {
    id: 'd2coding',
    displayName: 'D2Coding',
    family:
      "'D2Coding', 'Noto Sans Mono CJK KR', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  },
  {
    id: 'hack',
    displayName: 'Hack',
    family:
      "'Hack', 'Noto Sans Mono CJK KR', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  },
];

export const DEFAULT_CODE_FONT: CodeFontId = 'd2coding';

export function familyOf(id: CodeFontId): string {
  return (CODE_FONTS.find((f) => f.id === id) ?? CODE_FONTS[0]).family;
}
