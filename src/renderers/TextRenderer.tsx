import React from 'react';
import { TranslateButton } from './TranslateButton';
import RenderableText from './RenderableText';

interface TextRendererProps {
  value: any;
  showTranslate?: boolean;
  sourceLanguageHint?: string;
  cachedTranslatedText?: string;
  cachedTranslatedFieldName?: string;
  autoTranslate?: boolean;
  enableRichRender?: boolean;
}

function getTextFromCellValue(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((seg: any) => seg.text || '')
      .join('');
  }
  return String(value);
}

const TextRenderer: React.FC<TextRendererProps> = ({
  value,
  showTranslate = true,
  sourceLanguageHint,
  cachedTranslatedText,
  cachedTranslatedFieldName,
  autoTranslate = false,
  enableRichRender = true,
}) => {
  const text = getTextFromCellValue(value);

  if (!text) {
    return <div className="renderer-empty">—</div>;
  }

  return (
    <div className="renderer-text-wrapper">
      <div className="renderer-text">
        <RenderableText content={text} enableRichRender={enableRichRender} />
      </div>

      {showTranslate && (
        <div className="renderer-translate">
          <TranslateButton
            text={text}
            sourceLanguageHint={sourceLanguageHint}
            cachedTranslatedText={cachedTranslatedText}
            cachedTranslatedFieldName={cachedTranslatedFieldName}
            autoTranslate={autoTranslate}
            enableRichRender={enableRichRender}
          />
        </div>
      )}
    </div>
  );
};

export default TextRenderer;
