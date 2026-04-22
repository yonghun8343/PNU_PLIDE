/**
 * Mowkow (머꼬) — 한국어 LISP-like.
 *
 * Parser 조사 결과(`interpreter/mowkow-main/_parse.py`, `_eval.py`,
 * `library_kor.scm`)를 바탕으로 작성.
 *
 * 토큰 정책:
 *   - `(`, `)`, `[`, `]` → `@brackets`
 *   - `'`, `` ` ``, `,`, `,@` → quote marker (keyword.operator)
 *   - 문자열: `"..."`, escape `\"`
 *   - 숫자: 10진 정수/실수 (± prefix), `0x` hex, `0육` 한글 hex
 *   - 주석: `;` → EOL
 *   - 구문/라이브러리 키워드는 controlKeywords / builtinFunctions 로 분리하여
 *     의미적 컬러 레이블을 부여.
 *
 * AST 기반 의미 강조(예: 함수/변수 바인딩)는 향후 tree-sitter 통합 시점에 대체.
 */
import * as monaco from 'monaco-editor';

export const MOWKOW_LANGUAGE_ID = 'mowkow';

// Parser 의 special form (_parse.py / _eval.py)
const controlKeywords = [
  '정의',
  '만약',
  '람다',
  '잠시',
  '조건',
  '인용',
  '특이인용',
  '비인용',
  '비인용연결',
  '매크로',
];

// Library 및 built-in (library_kor.scm, _eval.py)
const builtinFunctions = [
  '머',
  '머리',
  '꼬',
  '꼬리',
  '짝',
  '그대로',
  '절댓값',
  '머리돌기',
  '꼬리돌기',
  '한맵',
  '맵',
  '접합',
  '거꾸로',
  '리스트',
  '아톰?',
  '리스트?',
  '단?',
  '열?',
  '부정',
  '그리고',
  '또는',
  '같다?',
  '짝?',
  '공?',
  '읽기',
  '쓰기',
];

const constants = ['#참', '#거짓', '공'];

export const mowkowTokens: monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  ignoreCase: false,

  // Monarch 는 $languageId 나 $keyword 패턴에서 Unicode 를 바로 못 쓰기에
  // keyword 매칭은 한글 atom 을 분리한 뒤 cases 로 위임한다.
  brackets: [
    { open: '(', close: ')', token: 'delimiter.parenthesis' },
    { open: '[', close: ']', token: 'delimiter.square' },
  ],

  // @keywords / @builtins 를 cases 에서 참조
  keywords: controlKeywords,
  builtins: builtinFunctions,
  constants: constants,

  // atom 을 구성할 수 있는 문자 (공백/(/)/[/]/;/"/'/,/`/. 제외 모두 허용).
  // Monarch 는 Unicode 속성 클래스를 쓸 수 없어 negated class 로 근사.
  atomBody: /[^\s()[\];"'`,.]+/,

  tokenizer: {
    root: [
      // 주석
      [/;.*$/, 'comment'],

      // quote markers (list-context 에서의 prefix)
      [/,@/, 'keyword.operator'],
      [/[`',]/, 'keyword.operator'],

      // 문자열
      [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],

      // 숫자: 한글 hex (0육…) — 한글 nibble 포함
      [/0육[0-9a-fA-Fㄱㄴㄷㄹㅁㅂ]+/, 'number.hex'],
      // 0x hex
      [/0[xX][0-9a-fA-F]+/, 'number.hex'],
      // 10진 정수/실수 (선택적 부호, 선택적 소수부)
      [/[+-]?\d+(?:\.\d+)?/, 'number'],

      // bracket pairs
      [/[()[\]]/, '@brackets'],

      // #참 / #거짓 같은 부울/상수 (# 로 시작하는 식별자)
      [/#[^\s()[\];"'`,]+/, 'constant'],

      // 점 표기 (dotted pair)
      [/\./, 'operator'],

      // atom (식별자) — keyword / builtin / constant 로 구분
      [
        /@atomBody/,
        {
          cases: {
            '@keywords': 'keyword',
            '@builtins': 'support.function',
            '@constants': 'constant',
            '@default': 'identifier',
          },
        },
      ],
    ],

    string: [
      [/[^\\"]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
    ],
  },
};

export const mowkowLangConfig: monaco.languages.LanguageConfiguration = {
  comments: { lineComment: ';' },
  brackets: [
    ['(', ')'],
    ['[', ']'],
  ],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '"', close: '"', notIn: ['string', 'comment'] },
  ],
  surroundingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '"', close: '"' },
  ],
  wordPattern: /[^\s()[\];"'`,.]+/,
  // S-expr 은 들여쓰기 의존이 아니지만 입력 편의상 여는 괄호 뒤 자동 들여쓰기.
  onEnterRules: [
    {
      beforeText: /\([^)]*$/,
      action: { indentAction: monaco.languages.IndentAction.Indent },
    },
  ],
};
