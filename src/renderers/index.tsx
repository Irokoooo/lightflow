import { FieldType } from '@lark-base-open/js-sdk';
import React from 'react';
import TextRenderer from './TextRenderer';
import SelectRenderer from './SelectRenderer';
import NumberRenderer from './NumberRenderer';
import DateRenderer from './DateRenderer';
import UserRenderer from './UserRenderer';
import AttachmentRenderer from './AttachmentRenderer';
import UrlRenderer from './UrlRenderer';
import OtherRenderer from './OtherRenderer';
import InlineEditableRenderer from './InlineEditableRenderer';
import { IFieldRenderData } from '../types';
import { ErrorBoundary } from '../components/ErrorBoundary';
import './renderers.css';

interface FieldRendererProps {
  data: IFieldRenderData;
  onValueSaved?: () => Promise<void> | void;
  showTranslate?: boolean;
  sourceLanguageHint?: string;
  cachedTranslatedText?: string;
  cachedTranslatedFieldName?: string;
  autoTranslate?: boolean;
  enableRichRender?: boolean;
  showFeedbackAssistant?: boolean;
}

const FieldRenderer: React.FC<FieldRendererProps> = ({
  data,
  onValueSaved,
  showTranslate = false,
  sourceLanguageHint,
  cachedTranslatedText,
  cachedTranslatedFieldName,
  autoTranslate = false,
  enableRichRender = true,
  showFeedbackAssistant = false,
}) => {
  const renderContent = () => {
    const supportsInlineEditing = [
      FieldType.Text,
      FieldType.Url,
      FieldType.SingleSelect,
      FieldType.MultiSelect,
      FieldType.Number,
      FieldType.Currency,
      FieldType.Progress,
      FieldType.Rating,
      FieldType.Checkbox,
    ].includes(data.fieldType);

    if (data.isEditable && supportsInlineEditing) {
      return (
        <InlineEditableRenderer
          data={data}
          onSaved={onValueSaved}
          showTranslate={showTranslate}
          sourceLanguageHint={sourceLanguageHint}
          cachedTranslatedText={cachedTranslatedText ?? data.translationCacheText}
          cachedTranslatedFieldName={cachedTranslatedFieldName ?? data.translationCacheFieldName}
          autoTranslate={autoTranslate}
          enableRichRender={enableRichRender}
          showFeedbackAssistant={showFeedbackAssistant}
        />
      );
    }

    switch (data.fieldType) {
      case FieldType.Text:
        return (
          <TextRenderer
            value={data.value}
            showTranslate={showTranslate}
            sourceLanguageHint={sourceLanguageHint}
            cachedTranslatedText={cachedTranslatedText ?? data.translationCacheText}
            cachedTranslatedFieldName={cachedTranslatedFieldName ?? data.translationCacheFieldName}
            autoTranslate={autoTranslate}
            enableRichRender={enableRichRender}
          />
        );
      case FieldType.Url:
        return <UrlRenderer value={data.value} />;
      case FieldType.SingleSelect:
      case FieldType.MultiSelect:
        return <SelectRenderer value={data.value} meta={data.meta} />;
      case FieldType.Number:
      case FieldType.AutoNumber:
      case FieldType.Currency:
      case FieldType.Progress:
      case FieldType.Rating:
        return <NumberRenderer value={data.value} />;
      case FieldType.DateTime:
      case FieldType.CreatedTime:
      case FieldType.ModifiedTime:
        return <DateRenderer value={data.value} />;
      case FieldType.Checkbox:
        return <OtherRenderer value={data.value} />;
      case FieldType.User:
      case FieldType.CreatedUser:
      case FieldType.ModifiedUser:
        return <UserRenderer value={data.value} />;
      case FieldType.Attachment:
        return (
          <AttachmentRenderer
            value={data.value}
            fieldId={data.fieldId}
            tableId={data.tableId}
            recordId={data.recordId}
          />
        );
      default:
        return <OtherRenderer value={data.value} />;
    }
  };

  return (
    <ErrorBoundary name={data.fieldName}>
      {renderContent()}
    </ErrorBoundary>
  );
};

export default FieldRenderer;
