import React from 'react';
import { IViewConfig } from '../types';

interface ViewTabsProps {
  views: IViewConfig[];
  currentViewId: string;
  onSwitchView: (viewId: string) => void;
  onOpenEditor: () => void;
}

const ViewTabs: React.FC<ViewTabsProps> = ({
  views,
  currentViewId,
  onSwitchView,
  onOpenEditor,
}) => {
  return (
    <div className="view-tabs">
      <div className="view-tabs-list">
        {views.map((view) => (
          <button
            key={view.viewId}
            className={`view-tab ${currentViewId === view.viewId ? 'active' : ''}`}
            onClick={() => onSwitchView(view.viewId)}
          >
            {view.viewName}
          </button>
        ))}
      </div>
      <button
        className="view-editor-btn"
        onClick={onOpenEditor}
        title="视图设置"
      >
        ⚙
      </button>
    </div>
  );
};

export default ViewTabs;
