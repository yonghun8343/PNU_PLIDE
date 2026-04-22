/**
 * K-Prolog — 한국어 Prolog dialect.
 *
 * Parser 조사: `interpreter/K-Prolog-main/PARSER/parser.py`, `SOLVER/builtin.py`.
 *
 * 주요 특이점:
 *   - 변수는 `_` 로 시작해야 함 (`_엑스`, `_와이`)  ← ISO Prolog 와 다름
 *   - Atom 문자열 리터럴: `'...'` (single-quote)
 *   - assignment: `:=`, unification: `=`, arith eq: `=:=`, arith neq: `=\=`
 *   - less-eq: `=<` (not `<=`)
 *   - line comment: `%`
 *   - clause terminator: `.` (statement 끝)
 *   - head-tail list: `[H|T]`
 *
 * 키워드 분류:
 *   - controlKeywords: Prolog 의 제어 술어 (참/거짓/not 등)
 *   - builtinPredicates: README/built-in 술어 목록
 */
import * as monaco from 'monaco-editor';

export const KPROLOG_LANGUAGE_ID = 'kprolog';

const controlKeywords = [
  '참',
  '거짓',
  '포기', // fail
  '논리부정', // not
  'is',
  'initialization',
  '초기화',
];

const builtinPredicates = [
  '추가',
  '상수인가',
  '상수연결',
  '문자리스트',
  '접합',
  '이내',
  '문자코드',
  '모두찾기',
  '평평히',
  '모두만족',
  '정수인가',
  '리스트인가',
  '키정렬',
  '길이',
  '목록에적용',
  '원소',
  '원소점검',
  '나머지',
  '줄바꿈',
  '변수아닌가',
  '수',
  '읽기',
  '거꾸로',
  '선택',
  '집합',
  '정렬',
  '원소제거',
  '쓰기',
  '쓰고줄바꿈',
  '적재',
  '재적재',
  '목록',
  '종료',
  '추적',
  '중단',
  '나가기',
  '추적중단',
  // 영문 병기
  'assert',
  'asserta',
  'atomic',
  'atom_concat',
  'atom_chars',
  'append',
  'between',
  'char_code',
  'fail',
  'findall',
  'flatten',
  'forall',
  'integer',
  'is_list',
  'keysort',
  'length',
  'maplist',
  'member',
  'memberchk',
  'mod',
  'nl',
  'nonvar',
  'not',
  'number',
  'read',
  'reverse',
  'select',
  'setof',
  'sort',
  'subtract',
  'write',
  'writeln',
];

export const kprologTokens: monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  ignoreCase: false,

  keywords: controlKeywords,
  builtins: builtinPredicates,

  brackets: [
    { open: '(', close: ')', token: 'delimiter.parenthesis' },
    { open: '[', close: ']', token: 'delimiter.square' },
    { open: '{', close: '}', token: 'delimiter.curly' },
  ],

  // 변수: `_` 로 시작 + 뒤에 word char/한글.  Prolog 표준과 달리 대문자 시작 X.
  // _ 단독(anonymous)도 허용.
  variable: /_[\w\u0080-\uffff]*/,

  // Atom 식별자: 한글/영문 혼합 허용. `?` `!` 등 기호 포함 가능성이 낮아
  // word char 와 한글만 수용.
  atomIdent: /[A-Za-z\u0080-\uffff][\w\u0080-\uffff]*/,

  tokenizer: {
    root: [
      // 주석
      [/%.*$/, 'comment'],
      // (Prolog 표준 block comment `/* ... */`)
      [/\/\*/, { token: 'comment', next: '@blockComment' }],

      // 변수 (언더스코어로 시작)
      [/@variable/, 'variable'],

      // Single-quoted atom
      [/'/, { token: 'string.quote', bracket: '@open', next: '@quotedAtom' }],

      // 숫자 — 정수/부동소수
      [/\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],

      // operator clusters — 긴 매칭 우선
      [/:-|->|=:=|=\\=|=<|>=|\\=|:=|==|!=|\|\|/, 'operator'],
      [/[=<>+\-*/!;|]/, 'operator'],

      // clause terminator — `.` (숫자 소수점은 위 number rule 에서 이미 소화)
      [/\.(?=\s|$)/, 'delimiter.terminator'],
      [/\./, 'operator'], // functor 분리자

      // 구분자
      [/,/, 'delimiter'],
      [/[()[\]{}]/, '@brackets'],

      // 식별자 → keyword / builtin / atom
      [
        /@atomIdent/,
        {
          cases: {
            '@keywords': 'keyword',
            '@builtins': 'support.function',
            '@default': 'identifier',
          },
        },
      ],
    ],

    quotedAtom: [
      [/[^\\']+/, 'string'],
      [/\\./, 'string.escape'],
      [/'/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
    ],

    blockComment: [
      [/[^*/]+/, 'comment'],
      [/\*\//, { token: 'comment', next: '@pop' }],
      [/[*/]/, 'comment'],
    ],
  },
};

export const kprologLangConfig: monaco.languages.LanguageConfiguration = {
  comments: {
    lineComment: '%',
    blockComment: ['/*', '*/'],
  },
  brackets: [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: "'", close: "'", notIn: ['string', 'comment'] },
  ],
  surroundingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: "'", close: "'" },
  ],
  wordPattern: /_?[\w\u0080-\uffff]+/,
  onEnterRules: [
    {
      // `:-` 로 시작하는 절 body 는 들여쓰기
      beforeText: /:-\s*$/,
      action: { indentAction: monaco.languages.IndentAction.Indent },
    },
  ],
};
