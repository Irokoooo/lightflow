import React, { useEffect, useMemo, useState } from 'react';
import { bitable, FieldType, IOpenSegmentType, OperationType, PermissionEntity } from '@lark-base-open/js-sdk';
import { IFieldRenderData } from '../types';
import TextRenderer from './TextRenderer';
import SelectRenderer from './SelectRenderer';
import NumberRenderer from './NumberRenderer';
import UrlRenderer from './UrlRenderer';
import OtherRenderer from './OtherRenderer';
import { TranslateButton } from './TranslateButton';

interface InlineEditableRendererProps {
  data: IFieldRenderData;
  onSaved?: () => Promise<void> | void;
  showTranslate?: boolean;
  sourceLanguageHint?: string;
  cachedTranslatedText?: string;
  cachedTranslatedFieldName?: string;
  autoTranslate?: boolean;
  enableRichRender?: boolean;
  showFeedbackAssistant?: boolean;
}

function getTextValue(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((seg: any) => seg?.text || '').join('');
  return String(value);
}

function getUrlTextValue(value: any): { text: string; link: string } {
  if (value == null) return { text: '', link: '' };
  if (typeof value === 'string') return { text: value, link: value };
  if (Array.isArray(value)) {
    const firstLink = value.find((seg: any) => seg?.link);
    return {
      text: value.map((seg: any) => seg?.text || '').join(''),
      link: firstLink?.link || '',
    };
  }
  const raw = String(value);
  return { text: raw, link: raw };
}

function getNumberValue(value: any): string {
  if (value == null || value === '') return '';
  return typeof value === 'number' ? String(value) : String(Number(value));
}

function getSingleSelectValue(value: any): string {
  if (!value) return '';
  return value.text || '';
}

function getMultiSelectValue(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => item?.text).filter(Boolean);
}

function getOptionList(meta: any): Array<{ id?: string; text: string }> {
  const rawOptions = meta?.property?.options || [];
  return rawOptions
    .map((opt: any) => ({
      id: opt?.id,
      text: opt?.text || opt?.name || '',
    }))
    .filter((opt: any) => opt.text);
}

function findOptionByText(options: Array<{ id?: string; text: string }>, text: string) {
  return options.find((opt) => opt.text === text);
}

function isInlineSupported(type: FieldType): boolean {
  return [
    FieldType.Text,
    FieldType.Url,
    FieldType.Number,
    FieldType.Currency,
    FieldType.Progress,
    FieldType.Rating,
    FieldType.SingleSelect,
    FieldType.MultiSelect,
    FieldType.Checkbox,
  ].includes(type);
}

function isAlwaysReadonly(type: FieldType): boolean {
  return [
    FieldType.Attachment,
    FieldType.Formula,
    FieldType.Lookup,
    FieldType.AutoNumber,
    FieldType.CreatedTime,
    FieldType.ModifiedTime,
    FieldType.CreatedUser,
    FieldType.ModifiedUser,
    FieldType.User,
    FieldType.SingleLink,
    FieldType.DuplexLink,
    FieldType.DateTime,
    FieldType.Location,
    FieldType.Phone,
    FieldType.Email,
  ].includes(type);
}

const InlineEditableRenderer: React.FC<InlineEditableRendererProps> = ({
  data,
  onSaved,
  showTranslate = true,
  sourceLanguageHint,
  cachedTranslatedText,
  cachedTranslatedFieldName,
  autoTranslate = false,
  enableRichRender = true,
  showFeedbackAssistant = false,
}) => {
  const [editable, setEditable] = useState<boolean>(!!data.isEditable);
  const [checkingPermission, setCheckingPermission] = useState<boolean>(data.isEditable == null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [textValue, setTextValue] = useState(getTextValue(data.value));
  const [urlText, setUrlText] = useState(getUrlTextValue(data.value).text);
  const [urlLink, setUrlLink] = useState(getUrlTextValue(data.value).link);
  const [numberValue, setNumberValue] = useState(getNumberValue(data.value));
  const [singleSelectValue, setSingleSelectValue] = useState(getSingleSelectValue(data.value));
  const [multiSelectValue, setMultiSelectValue] = useState<string[]>(getMultiSelectValue(data.value));
  const [checkboxValue, setCheckboxValue] = useState(Boolean(data.value));
  const [options, setOptions] = useState<Array<{ id?: string; text: string }>>(() => getOptionList(data.meta));

  useEffect(() => {
    setTextValue(getTextValue(data.value));
    const urlVal = getUrlTextValue(data.value);
    setUrlText(urlVal.text);
    setUrlLink(urlVal.link);
    setNumberValue(getNumberValue(data.value));
    setSingleSelectValue(getSingleSelectValue(data.value));
    setMultiSelectValue(getMultiSelectValue(data.value));
    setCheckboxValue(Boolean(data.value));
    setSaveError(null);
  }, [data.value, data.recordId, data.fieldId]);

  useEffect(() => {
    let cancelled = false;

    const loadOptions = async () => {
      if (![FieldType.SingleSelect, FieldType.MultiSelect].includes(data.fieldType)) {
        setOptions([]);
        return;
      }

      const metaOptions = getOptionList(data.meta);
      if (metaOptions.length > 0) {
        setOptions(metaOptions);
        return;
      }

      try {
        const table = await bitable.base.getTableById(data.tableId);
        const field = await table.getField(data.fieldId);
        const remoteOptions = await (field as any).getOptions?.();
        if (!cancelled) {
          setOptions(
            (remoteOptions || [])
              .map((opt: any) => ({ id: opt?.id, text: opt?.text || opt?.name || '' }))
              .filter((opt: any) => opt.text)
          );
        }
      } catch {
        if (!cancelled) {
          setOptions(metaOptions);
        }
      }
    };

    loadOptions();
    return () => {
      cancelled = true;
    };
  }, [data.fieldId, data.fieldType, data.meta, data.tableId]);

  useEffect(() => {
    let cancelled = false;

    const checkPermission = async () => {
      if (data.isEditable != null) {
        setEditable(!!data.isEditable);
        setCheckingPermission(false);
        return;
      }

      if (isAlwaysReadonly(data.fieldType) || !isInlineSupported(data.fieldType)) {
        setEditable(false);
        setCheckingPermission(false);
        return;
      }

      try {
        const canEdit = await bitable.base.getPermission({
          entity: PermissionEntity.Cell,
          type: OperationType.Editable,
          param: {
            tableId: data.tableId,
            recordId: data.recordId,
            fieldId: data.fieldId,
          },
        } as any);
        if (!cancelled) {
          setEditable(!!canEdit);
          setCheckingPermission(false);
        }
      } catch {
        if (!cancelled) {
          setEditable(false);
          setCheckingPermission(false);
        }
      }
    };

    checkPermission();
    return () => {
      cancelled = true;
    };
  }, [data.fieldId, data.fieldType, data.isEditable, data.recordId, data.tableId]);

  const saveValue = async (nextValue: any) => {
    setSaving(true);
    setSaveError(null);
    try {
      const table = await bitable.base.getTableById(data.tableId);
      await table.setCellValue(data.fieldId, data.recordId, nextValue as any);
      await onSaved?.();
    } catch (err: any) {
      setEditable(false);
      setSaveError(err?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const renderReadonly = () => {
    switch (data.fieldType) {
      case FieldType.Text:
        return (
          <TextRenderer
            value={data.value}
            cachedTranslatedText={cachedTranslatedText}
            cachedTranslatedFieldName={cachedTranslatedFieldName}
            enableRichRender={enableRichRender}
          />
        );
      case FieldType.Url:
        return <UrlRenderer value={data.value} />;
      case FieldType.SingleSelect:
      case FieldType.MultiSelect:
        return <SelectRenderer value={data.value} meta={data.meta} />;
      case FieldType.Number:
      case FieldType.Currency:
      case FieldType.Progress:
      case FieldType.Rating:
        return <NumberRenderer value={data.value} />;
      default:
        return <OtherRenderer value={data.value} />;
    }
  };

  if (checkingPermission) {
    return <div className="renderer-empty">权限识别中...</div>;
  }

  if (!editable) {
    return (
      <div className="inline-field-readonly">
        {renderReadonly()}
        {saveError && <div className="inline-edit-error">{saveError}</div>}
      </div>
    );
  }

  if (data.fieldType === FieldType.Text) {
    return (
      <div className="inline-edit-block">
        <textarea
          className="inline-edit-textarea"
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          onBlur={() => saveValue(textValue ? [{ type: IOpenSegmentType.Text, text: textValue }] : [])}
          placeholder="直接输入..."
        />
        {showTranslate && (
          <div className="renderer-translate">
            <TranslateButton
              text={textValue}
              sourceLanguageHint={sourceLanguageHint}
              cachedTranslatedText={cachedTranslatedText}
              cachedTranslatedFieldName={cachedTranslatedFieldName}
              autoTranslate={autoTranslate}
              enableRichRender={enableRichRender}
              onWriteBack={
                showFeedbackAssistant
                  ? async (nextText) => {
                      setTextValue(nextText);
                      await saveValue(nextText ? [{ type: IOpenSegmentType.Text, text: nextText }] : []);
                    }
                  : undefined
              }
            />
          </div>
        )}
        {saving && <div className="inline-edit-hint">保存中...</div>}
        {saveError && <div className="inline-edit-error">{saveError}</div>}
      </div>
    );
  }

  if (data.fieldType === FieldType.Url) {
    return (
      <div className="inline-edit-block">
        <input
          className="inline-edit-input"
          value={urlText}
          onChange={(e) => setUrlText(e.target.value)}
          placeholder="显示文本"
        />
        <input
          className="inline-edit-input"
          value={urlLink}
          onChange={(e) => setUrlLink(e.target.value)}
          onBlur={() => {
            const link = urlLink.trim();
            const text = urlText.trim() || link;
            saveValue(link ? [{ type: IOpenSegmentType.Url, text, link }] : []);
          }}
          placeholder="https://..."
        />
        {saving && <div className="inline-edit-hint">保存中...</div>}
        {saveError && <div className="inline-edit-error">{saveError}</div>}
      </div>
    );
  }

  if ([FieldType.Number, FieldType.Currency, FieldType.Progress, FieldType.Rating].includes(data.fieldType)) {
    return (
      <div className="inline-edit-block">
        <input
          type="number"
          className="inline-edit-input"
          value={numberValue}
          onChange={(e) => setNumberValue(e.target.value)}
          onBlur={() => saveValue(numberValue === '' ? null : Number(numberValue))}
          placeholder="输入数字"
        />
        {saving && <div className="inline-edit-hint">保存中...</div>}
        {saveError && <div className="inline-edit-error">{saveError}</div>}
      </div>
    );
  }

  if (data.fieldType === FieldType.SingleSelect) {
    return (
      <div className="inline-edit-block">
        <select
          className="inline-edit-select"
          value={singleSelectValue}
          onChange={async (e) => {
            const next = e.target.value;
            setSingleSelectValue(next);
            const selectedOption = findOptionByText(options, next);
            await saveValue(
              next
                ? {
                    id: selectedOption?.id,
                    text: selectedOption?.text || next,
                  }
                : null
            );
          }}
        >
          <option value="">未选择</option>
          {options.map((opt) => (
            <option key={opt.id || opt.text} value={opt.text}>
              {opt.text}
            </option>
          ))}
        </select>
        {saving && <div className="inline-edit-hint">保存中...</div>}
        {saveError && <div className="inline-edit-error">{saveError}</div>}
      </div>
    );
  }

  if (data.fieldType === FieldType.MultiSelect) {
    return (
      <div className="inline-edit-block">
        <div className="inline-edit-multiselect">
          {options.map((opt) => {
            const checked = multiSelectValue.includes(opt.text);
            return (
              <label key={opt.id || opt.text} className="inline-edit-check-item">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={async () => {
                    const next = checked
                      ? multiSelectValue.filter((item) => item !== opt.text)
                      : [...multiSelectValue, opt.text];
                    setMultiSelectValue(next);
                    await saveValue(
                      next.map((text) => {
                        const matched = findOptionByText(options, text);
                        return {
                          id: matched?.id,
                          text: matched?.text || text,
                        };
                      })
                    );
                  }}
                />
                <span>{opt.text}</span>
              </label>
            );
          })}
        </div>
        {saving && <div className="inline-edit-hint">保存中...</div>}
        {saveError && <div className="inline-edit-error">{saveError}</div>}
      </div>
    );
  }

  if (data.fieldType === FieldType.Checkbox) {
    return (
      <div className="inline-edit-block">
        <label className="inline-edit-check-item">
          <input
            type="checkbox"
            checked={checkboxValue}
            onChange={async (e) => {
              const next = e.target.checked;
              setCheckboxValue(next);
              await saveValue(next);
            }}
          />
          <span>{checkboxValue ? '已勾选' : '未勾选'}</span>
        </label>
        {saving && <div className="inline-edit-hint">保存中...</div>}
        {saveError && <div className="inline-edit-error">{saveError}</div>}
      </div>
    );
  }

  return renderReadonly();
};

export default InlineEditableRenderer;
