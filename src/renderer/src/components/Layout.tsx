import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import type { ReactNode } from 'react';

interface LayoutProps {
  editor: ReactNode;
  terminal: ReactNode;
  sidebar: ReactNode;
}

/**
 * 3-split 레이아웃.
 *   ┌─────────────────────────────┬─────────────┐
 *   │          Editor             │             │
 *   ├─────────────────────────────┤   Sidebar   │
 *   │         Terminal            │             │
 *   └─────────────────────────────┴─────────────┘
 *
 * - 좌측 65% 영역은 다시 수직 분할 (Editor 60% / Terminal 40%)
 * - 우측 사이드바 35%, 최소 200px 보장
 * - react-resizable-panels 는 자동으로 드래그 핸들 제공
 */
export function Layout({ editor, terminal, sidebar }: LayoutProps): JSX.Element {
  return (
    <PanelGroup direction="horizontal" autoSaveId="pnu-pl-ide-h">
      <Panel defaultSize={68} minSize={30}>
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
      </Panel>
      <PanelResizeHandle className="resize-handle resize-handle-v" />
      <Panel defaultSize={32} minSize={18} maxSize={50} className="layout-panel">
        <div className="panel-body">{sidebar}</div>
      </Panel>
    </PanelGroup>
  );
}
