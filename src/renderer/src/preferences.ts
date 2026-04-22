/**
 * Renderer-side user preferences.
 *
 * - localStorage 단일 키("pnu-pl-ide:prefs")에 JSON 으로 저장.
 * - 부분 갱신(patch) 가능하도록 `updatePrefs` 제공.
 * - 스키마 변경 시 `PREFS_VERSION` 을 올리고 migrateXxx 를 추가.
 *
 * main process 의 상태(창 크기/위치)는 electron BrowserWindow 에서 별도로 관리하며
 * 이 모듈은 renderer-local UI 상태 전용.
 */
import type { InterpreterId } from '@shared/types';
import type { CodeFontId } from './fonts';

const STORAGE_KEY = 'pnu-pl-ide:prefs';
const PREFS_VERSION = 2;

export type ThemeMode = 'light' | 'dark' | 'system';

/** 에디터/터미널 공용 폰트 크기(px). 상·하한 clamp 는 `clampFontSize` 사용. */
export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 28;
export const FONT_SIZE_DEFAULT = 13;

export function clampFontSize(n: number): number {
  if (!Number.isFinite(n)) return FONT_SIZE_DEFAULT;
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)));
}

export interface AppPreferences {
  version: number;
  /** 마지막으로 선택한 코드 폰트 */
  codeFont?: CodeFontId;
  /** 에디터·터미널 폰트 크기(px) — 미지정 시 FONT_SIZE_DEFAULT */
  fontSize?: number;
  /** 테마 모드 — 미지정 시 'system' */
  themeMode?: ThemeMode;
  /** 마지막으로 선택/감지된 인터프리터 */
  activeInterpreter?: InterpreterId;
  /** 마지막으로 열었던 파일 절대경로 (존재 확인 후 복원) */
  lastFilePath?: string;
}

const EMPTY: AppPreferences = { version: PREFS_VERSION };

function safeParse(raw: string | null): AppPreferences {
  if (!raw) return { ...EMPTY };
  try {
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY };
    // 향후 version 분기 포인트
    return { ...EMPTY, ...parsed, version: PREFS_VERSION };
  } catch {
    return { ...EMPTY };
  }
}

export function loadPrefs(): AppPreferences {
  if (typeof localStorage === 'undefined') return { ...EMPTY };
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...EMPTY };
  }
}

export function savePrefs(prefs: AppPreferences): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prefs, version: PREFS_VERSION }));
  } catch {
    /* quota / private mode 실패 무시 */
  }
}

/** 부분 갱신 — 기존 값 유지하며 patch 만 덮어씀. */
export function updatePrefs(patch: Partial<AppPreferences>): AppPreferences {
  const next: AppPreferences = { ...loadPrefs(), ...patch, version: PREFS_VERSION };
  savePrefs(next);
  return next;
}
