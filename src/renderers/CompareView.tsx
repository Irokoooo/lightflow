import React from 'react';
import { IFieldRenderData } from '../types';
import FieldRenderer from './index';

interface CompareViewProps {
  fields: IFieldRenderData[];
  responseFieldIds: string[];
  hiddenFields: string[];
  translatableFieldIds?: string[];
  feedbackFieldIds?: string[];
  enableRichRender?: boolean;
  onValueSaved?: () => Promise<void> | void;
}

const CompareView: React.FC<CompareViewProps> = ({
  fields,
  responseFieldIds,
  hiddenFields,
  translatableFieldIds = [],
  feedbackFieldIds = [],
  enableRichRender = true,
  onValueSaved,
}) => {
  const fieldMap = new Map(fields.map((f) => [f.fieldId, f]));

  const responseFields = responseFieldIds
    .map((id) => fieldMap.get(id))
    .filter((f) => !!f && !hiddenFields.includes(f.fieldId)) as IFieldRenderData[];

  const otherFields = fields.filter(
    (f) =>
      !responseFieldIds.includes(f.fieldId) && !hiddenFields.includes(f.fieldId)
  );

  return (
    <div className="compare-view">
      {otherFields.length > 0 && (
        <div className="compare-other-fields">
          {otherFields.map((field, idx) => (
            <div key={field.fieldId} className="field-section">
              <div className="field-header">
                <span className="field-name">{field.fieldName}</span>
              </div>
              <div className="field-content">
                <FieldRenderer
                  data={field}
                  showTranslate={translatableFieldIds.includes(field.fieldId)}
                  enableRichRender={enableRichRender}
                  showFeedbackAssistant={feedbackFieldIds.includes(field.fieldId)}
                  onValueSaved={onValueSaved}
                />
              </div>
              {idx < otherFields.length - 1 && <div className="field-divider" />}
            </div>
          ))}
        </div>
      )}

      {responseFields.length > 0 && (
        <div
          className="compare-columns"
          style={{ '--compare-columns': responseFields.length } as React.CSSProperties}
        >
          <div className="compare-columns-header">
            {responseFields.map((field, idx) => (
              <div key={field.fieldId} className="compare-column-title">
                <span className="response-badge">R{idx + 1}</span>
                <span className="response-field-name">{field.fieldName}</span>
              </div>
            ))}
          </div>
          <div className="compare-columns-body">
            {responseFields.map((field) => (
              <div key={field.fieldId} className="compare-column">
                <FieldRenderer
                  data={field}
                  showTranslate={translatableFieldIds.includes(field.fieldId)}
                  enableRichRender={enableRichRender}
                  showFeedbackAssistant={feedbackFieldIds.includes(field.fieldId)}
                  onValueSaved={onValueSaved}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CompareView;
