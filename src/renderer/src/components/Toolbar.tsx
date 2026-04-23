import type { JSX } from 'react';
import {
  FolderOpen,
  Save,
  Play,
  StopCircle,
  FilePlus,
  Sliders,
  Download,
} from 'lucide-react';
import { INTERPRETERS, type InterpreterId } from '@shared/types';

interface ToolbarProps {
  currentFilePath: string | null;
  isDirty: boolean;
  isRunning: boolean;
  activeInterpreter: InterpreterId | null;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onRun: () => void;
  onStop: () => void;
  onOpenSettings?: () => void;
  onCheckUpdates?: () => void;
  updateBadge?: number;
  onSelectInterpreter: (id: InterpreterId) => void;
}

export function Toolbar(props: ToolbarProps): JSX.Element {
  const {
    currentFilePath,
    isDirty,
    isRunning,
    activeInterpreter,
    onNew,
    onOpen,
    onSave,
    onRun,
    onStop,
    onOpenSettings,
    onCheckUpdates,
    updateBadge,
    onSelectInterpreter,
  } = props;

  const displayName = currentFilePath?.split(/[\\/]/).pop() ?? '(무제)';

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={onNew} title="새 파일">
          <FilePlus size={14} />
          <span>새 파일</span>
        </button>
        <button className="toolbar-btn" onClick={onOpen} title="파일 열기">
          <FolderOpen size={14} />
          <span>열기</span>
        </button>
        <button className="toolbar-btn" onClick={onSave} title="저장" disabled={!isDirty}>
          <Save size={14} />
          <span>저장</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <label className="toolbar-label" htmlFor="interp-select">
          언어
        </label>
        <select
          id="interp-select"
          className="toolbar-select"
          value={activeInterpreter ?? ''}
          onChange={(e) => onSelectInterpreter(e.target.value as InterpreterId)}
        >
          <option value="" disabled>
            선택…
          </option>
          {INTERPRETERS.map((i) => (
            <option key={i.id} value={i.id}>
              {i.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        {isRunning ? (
          <button className="toolbar-btn toolbar-btn-danger" onClick={onStop} title="중지">
            <StopCircle size={14} />
            <span>중지</span>
          </button>
        ) : (
          <button
            className="toolbar-btn toolbar-btn-accent"
            onClick={onRun}
            title="실행"
            disabled={!activeInterpreter}
          >
            <Play size={14} />
            <span>실행</span>
          </button>
        )}
      </div>

      <div className="toolbar-spacer" />

      {onCheckUpdates && (
        <button
          className="toolbar-btn"
          onClick={onCheckUpdates}
          title="인터프리터 업데이트 확인"
        >
          <Download size={14} />
          <span>업데이트</span>
          {updateBadge && updateBadge > 0 ? (
            <span className="toolbar-badge" aria-label="업데이트 사용 가능">
              {updateBadge}
            </span>
          ) : null}
        </button>
      )}

      {onOpenSettings && (
        <button
          className="toolbar-btn"
          onClick={onOpenSettings}
          title="앱 설정 (폰트 · 테마)"
        >
          <Sliders size={14} />
          <span>설정</span>
        </button>
      )}

      <div className="toolbar-filename">
        {displayName}
        {isDirty ? ' •' : ''}
      </div>
    </div>
  );
}
