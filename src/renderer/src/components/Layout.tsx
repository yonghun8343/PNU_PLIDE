import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import type { ReactNode } from 'react';

interface LayoutProps {
  editor: ReactNode;
  terminal: ReactNode;
}

/**
 * 2-split 레이아웃 (수직).
 *   ┌─────────────────────────────┐
 *   │          Editor             │
 *   ├─────────────────────────────┤
 *   │         Terminal            │
 *   └─────────────────────────────┘
 *
 * - Editor 62% / Terminal 38%
 * - react-resizable-panels 가 자동으로 드래그 핸들 제공
 * - 우측 사이드바(Interpreters / Memory Map) 는 초학자 집중도를 위해 제거됨.
 *   추후 재도입 시 이 파일을 horizontal 3-split 으로 복원.
 */
export function Layout({ editor, terminal }: LayoutProps): JSX.Element {
  return (
    <PanelGroup direction="vertical" autoSaveId="pnu-pl-ide-v">
      <Panel defaultSize={62} minSize={20} className="layout-panel">
        <div className="panel-title">Editor</div>
        <div className="panel-body">{editor}</div>
      </Panel>
      <PanelResizeHandle className="resize-handle resize-handle-h" />
      <Panel defaultSize={38} minSize={15} className="layout-panel">
        <div className="panel-title">Terminal</div>
        <div className="panel-body">{terminal}</div>
      </Panel>
    </PanelGroup>
  );
}
