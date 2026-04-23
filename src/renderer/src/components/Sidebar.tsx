import type { JSX } from 'react';
import { INTERPRETERS, type InterpreterId } from '@shared/types';

interface SidebarProps {
  activeInterpreter: InterpreterId | null;
  onSelectInterpreter: (id: InterpreterId) => void;
}

export function Sidebar({ activeInterpreter, onSelectInterpreter }: SidebarProps): JSX.Element {
  return (
    <div className="sidebar">
      <div className="panel-title">Interpreters</div>
      <ul className="interp-list">
        {INTERPRETERS.map((i) => (
          <li
            key={i.id}
            className={activeInterpreter === i.id ? 'interp-item interp-item-active' : 'interp-item'}
            onClick={() => onSelectInterpreter(i.id)}
          >
            <strong>{i.displayName}</strong>
            <div className="interp-meta">
              ext: {i.fileExtensions.join(', ')} · PTY: {i.needsPty ? '필요' : '불필요'}
            </div>
            <div className="interp-meta">종료: {i.replExitHint}</div>
          </li>
        ))}
      </ul>

      <div className="panel-title" style={{ marginTop: 16 }}>
        Memory Map (Phase 7 예약)
      </div>
      <div className="placeholder-small">레지스터 · 메모리 시각화 공간</div>
    </div>
  );
}
