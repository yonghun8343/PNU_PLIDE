import { useEffect, useState, type JSX } from 'react';
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  clampFontSize,
  type ThemeMode,
} from '../preferences';
import { CODE_FONTS, type CodeFontId } from '../fonts';

/**
 * 프로그램 내 설정 모달.
 *
 * 현재 다루는 항목:
 *   - 폰트 패밀리 (D2Coding / Hack)
 *   - 폰트 크기 (슬라이더 + 숫자 입력, 실 크기 라이브 프리뷰)
 *   - 테마 모드 (light / dark / system)
 *
 * 저장 방식:
 *   - 값이 바뀔 때마다 부모 onChange 로 즉시 전달한다 (Apply 버튼 없이 라이브 반영).
 *   - 부모는 renderer preferences 에 persist 한다.
 */
export interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  codeFont: CodeFontId;
  fontSize: number;
  themeMode: ThemeMode;
  onCodeFontChange: (id: CodeFontId) => void;
  onFontSizeChange: (n: number) => void;
  onThemeModeChange: (m: ThemeMode) => void;
}

export function SettingsDialog(props: SettingsDialogProps): JSX.Element | null {
  const {
    open,
    onClose,
    codeFont,
    fontSize,
    themeMode,
    onCodeFontChange,
    onFontSizeChange,
    onThemeModeChange,
  } = props;

  // 슬라이더의 로컬 state — blur/commit 시 부모에게 전달.
  const [localSize, setLocalSize] = useState(fontSize);
  useEffect(() => {
    setLocalSize(fontSize);
  }, [fontSize]);

  // ESC 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const commitSize = (n: number): void => {
    const v = clampFontSize(n);
    setLocalSize(v);
    onFontSizeChange(v);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>설정</h2>
          <button className="modal-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="modal-body">
          <section className="settings-row">
            <div className="settings-label">폰트</div>
            <div className="settings-control settings-radio-group">
              {CODE_FONTS.map((f) => (
                <label key={f.id} className="settings-radio">
                  <input
                    type="radio"
                    name="code-font"
                    value={f.id}
                    checked={codeFont === f.id}
                    onChange={() => onCodeFontChange(f.id)}
                  />
                  <span>{f.displayName}</span>
                </label>
              ))}
            </div>
            <div className="settings-hint">
              에디터와 터미널에 공통으로 적용되는 모노스페이스 폰트.
            </div>
          </section>

          <section className="settings-row">
            <div className="settings-label">폰트 크기</div>
            <div className="settings-control">
              <input
                type="range"
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                step={1}
                value={localSize}
                onChange={(e) => commitSize(Number(e.target.value))}
              />
              <input
                type="number"
                className="settings-number"
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                value={localSize}
                onChange={(e) => commitSize(Number(e.target.value))}
              />
              <span className="settings-unit">px</span>
              <button
                className="settings-reset"
                onClick={() => commitSize(FONT_SIZE_DEFAULT)}
                title={`기본값 ${FONT_SIZE_DEFAULT}px 로 되돌리기`}
              >
                기본
              </button>
            </div>
            {/* 라이브 프리뷰 — 선택된 폰트 크기를 실 크기로 즉시 확인 */}
            <div
              className="settings-preview"
              style={{ fontSize: `${localSize}px`, lineHeight: 1.4 }}
            >
              가나다 ABC 0123 { '{ let x = 42; }' }
            </div>
          </section>

          <section className="settings-row">
            <div className="settings-label">테마</div>
            <div className="settings-control settings-radio-group">
              {(['light', 'dark', 'system'] as const).map((m) => (
                <label key={m} className="settings-radio">
                  <input
                    type="radio"
                    name="theme-mode"
                    value={m}
                    checked={themeMode === m}
                    onChange={() => onThemeModeChange(m)}
                  />
                  <span>
                    {m === 'light' ? '라이트' : m === 'dark' ? '다크' : '시스템'}
                  </span>
                </label>
              ))}
            </div>
            <div className="settings-hint">
              시스템을 선택하면 OS 의 <code>prefers-color-scheme</code> 을 따른다.
            </div>
          </section>
        </div>

        <div className="modal-footer">
          <button className="modal-btn" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
