import React, { useMemo } from 'react';
import { FieldType } from '@lark-base-open/js-sdk';
import { IViewConfig, IFieldRenderData } from '../types';

interface ViewEditorProps {
  isOpen: boolean;
  onClose: () => void;
  currentView: IViewConfig | undefined;
  fields: IFieldRenderData[];
  onResetToDefault: () => void;
  onDeleteView: (viewId: string) => void;
  onUpdateViewSettings: (settings: Record<string, any>) => void;
}

const ViewEditor: React.FC<ViewEditorProps> = ({
  isOpen,
  onClose,
  currentView,
  fields,
  onResetToDefault,
  onDeleteView,
  onUpdateViewSettings,
}) => {
  const orderedFields = useMemo(() => {
    if (!currentView || fields.length === 0) return [];
    const fieldMap = new Map(fields.map((f) => [f.fieldId, f]));
    return currentView.fieldsOrder
      .map((id) => fieldMap.get(id))
      .filter((f) => !!f) as IFieldRenderData[];
  }, [currentView, fields]);

  const handleDeleteView = () => {
    if (!currentView || currentView.isBuiltIn) return;
    const confirmed = window.confirm(`确认删除预设「${currentView.viewName}」吗？删除后不可恢复。`);
    if (!confirmed) return;
    onDeleteView(currentView.viewId);
    onClose();
  };

  if (!isOpen || !currentView) return null;

  const enableRichRender = currentView.settings?.enableRichRender !== false;
  const translationFieldIds: string[] = currentView.settings?.translationFieldIds || [];
  const textLikeFields = orderedFields.filter(
    (field) => [FieldType.Text, FieldType.Url].includes(field.fieldType)
  );

  const toggleTranslationField = (fieldId: string) => {
    const next = translationFieldIds.includes(fieldId)
      ? translationFieldIds.filter((id) => id !== fieldId)
      : [...translationFieldIds, fieldId];
    onUpdateViewSettings({ translationFieldIds: next });
  };

  return (
    <div className="view-editor-overlay" onClick={onClose}>
      <div className="view-editor-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="view-editor-header">
          <div className="view-editor-title">
            <span>{currentView.viewName}</span>
            <div className="view-editor-subtitle">这里仅管理翻译字段开关，以及把当前视图恢复到默认状态。</div>
          </div>
          <button className="view-editor-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="view-editor-body">
          <div className="view-editor-section">
            <div className="view-editor-section-title">内容渲染</div>
            <div className="view-description-editor">
              <label className={`view-layout-option ${enableRichRender ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={enableRichRender}
                  onChange={(e) => onUpdateViewSettings({ enableRichRender: e.target.checked })}
                />
                <span>自动渲染 Markdown / LaTeX</span>
                <small>开启后字段内容和翻译结果都会自动识别标题、列表、表格、代码块和数学公式。</small>
              </label>
            </div>
          </div>

          <div className="view-editor-section">
            <div className="view-editor-section-title">翻译字段</div>
            <div className="view-editor-subtitle">只在这些字段下显示翻译工具。插件会先自动识别，你也可以手动调整。</div>
            <div className="view-editor-subtitle">
              若表中存在对应的 <code>CN_</code> 缓存字段，翻译区会优先直接显示该字段内容；支持识别如 <code>CN_Prompt</code>、<code>CN_Res1</code>、<code>CN_Res1 Comment</code>、<code>CN_Res2</code>、<code>CN_Res2 Comment</code>。没有缓存字段时才走实时翻译。外部 MyMemory 兜底仅在用户手动点击“翻译”按钮时调用，自动翻译不会调用。
            </div>
            <div className="sortable-fields-list">
              {textLikeFields.map((field) => {
                const enabled = translationFieldIds.includes(field.fieldId);
                return (
                  <label
                    key={`translate-${field.fieldId}`}
                    className={`sortable-field-item ${enabled ? '' : 'hidden'}`}
                  >
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggleTranslationField(field.fieldId)}
                    />
                    <span className="sortable-field-name">{field.fieldName}</span>
                    <span className="field-type-tag">{enabled ? '翻译开启' : '翻译关闭'}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="view-editor-footer">
          <button
            className="btn btn-secondary"
            onClick={onResetToDefault}
          >
            恢复默认
          </button>
          {!currentView.isBuiltIn && (
            <button
              className="btn btn-secondary"
              onClick={handleDeleteView}
              title="删除当前自定义预设"
            >
              删除当前预设
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ViewEditor;
