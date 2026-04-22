/**
 * Kobasic (코베이직) — 한국어 BASIC dialect.
 *
 * Grammar 조사: `interpreter/kobasic-main/KoBASIC_Grammar.txt`, `interpreter.cpp`.
 *
 * 토큰 정책:
 *   - 라인 번호: 줄 첫 토큰이 정수면 `number.line` (visual hint)
 *   - 키워드: 영어 BASIC 키워드 + 한국어 별칭 병행 (IF/조건, PRINT/출력 등)
 *   - REM … : 라인 끝까지 주석
 *   - 문자열: `"..."` (escape 명세 없음 — 그대로 처리)
 *   - 숫자: 정수/부동소수 (hex 없음)
 *   - 비교 연산자: `<`, `>`, `<=`, `>=`, `<>`, `><`, `=`
 *   - 문자열 concat: `&`
 *   - 거듭제곱: `^`
 *
 * 대소문자: 원본 interpreter.cpp 는 대소문자 구분 없음 (toUpper 후 매칭).
 * Monarch 는 `ignoreCase: true` 로 대응.
 */
import * as monaco from 'monaco-editor';

export const KOBASIC_LANGUAGE_ID = 'kobasic';

// 제어 흐름 키워드 (영 + 한)
const controlKeywords = [
  'IF',
  'THEN',
  'ELSE',
  'ENDIF',
  'FOR',
  'TO',
  'STEP',
  'NEXT',
  'WHILE',
  'WEND',
  'GOTO',
  'GOSUB',
  'RETURN',
  'ON',
  'END',
  '조건',
  '그러면',
  '아니면',
  '끝조건',
  '반복',
  '까지',
  '다음',
  '분기',
  '순회',
  '복귀',
  '끝',
];

const statementKeywords = [
  'LET',
  'PRINT',
  'INPUT',
  'READ',
  'DATA',
  'RESTORE',
  'DIM',
  'DEF',
  'REM',
  'NEW',
  'CLEAR',
  'RUN',
  'LIST',
  'STOP',
  '대입',
  '출력',
  '입력',
  '배열',
  '실행',
  '목록',
  '지우기',
  '정지',
];

const operatorKeywords = ['AND', 'OR', 'NOT', 'MOD', '그리고', '또는', '아니', '나머지'];

const builtinFunctions = [
  'ABS',
  'INT',
  'RND',
  'SIN',
  'COS',
  'TAN',
  'SQR',
  'LOG',
  'EXP',
  'LEN',
  'LEFT$',
  'RIGHT$',
  'MID$',
  'STR$',
  'VAL',
  'CHR$',
  'ASC',
];

export const kobasicTokens: monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  ignoreCase: true,

  keywords: [...controlKeywords, ...statementKeywords, ...operatorKeywords],
  builtins: builtinFunctions,

  brackets: [{ open: '(', close: ')', token: 'delimiter.parenthesis' }],

  // BASIC 식별자: 알파벳+숫자+언더스코어+한글. 끝에 `$` (string variable) 허용.
  // (한글은 유니코드 클래스 미지원이라 negated class 사용)
  identifier: /[A-Za-z_\u0080-\uffff][\w\u0080-\uffff]*\$?/,

  tokenizer: {
    root: [
      // 라인 맨 앞의 숫자는 BASIC 라인 번호 — 시각적 구분
      [/^\s*\d+\b/, 'number.line'],

      // REM 주석 (단독 키워드 혹은 `'` 대체 표기는 사용 안 함)
      [/\b(?:REM|주석)\b.*$/i, 'comment'],

      // 문자열 — escape 미지원, `"` 닫히면 종료
      [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],

      // 숫자: float / int. `1e10` 허용.
      [/\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],

      // 비교/논리 연산자 2문자 먼저
      [/<=|>=|<>|><|:=/, 'operator'],
      [/[+\-*/^&=<>]/, 'operator'],

      // 구분자
      [/[;,:]/, 'delimiter'],
      [/[()]/, '@brackets'],

      // 식별자 / 키워드 / 빌트인
      [
        /@identifier/,
        {
          cases: {
            '@keywords': 'keyword',
            '@builtins': 'support.function',
            '@default': 'identifier',
          },
        },
      ],
    ],

    string: [
      [/[^"]+/, 'string'],
      [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
    ],
  },
};

export const kobasicLangConfig: monaco.languages.LanguageConfiguration = {
  comments: { lineComment: 'REM' },
  brackets: [['(', ')']],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string', 'comment'] },
  ],
  surroundingPairs: [
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
  wordPattern: /[A-Za-z_\u0080-\uffff][\w\u0080-\uffff]*\$?/,
};
