import React, { useEffect, useMemo, useState } from 'react';
import { bitable, FieldType, IFieldMeta } from '@lark-base-open/js-sdk';
import FieldRenderer from '.';
import { IFieldRenderData } from '../types';
import { identifyTranslationCacheFieldMap } from '../views/viewUtils';

type AggregateMode = 'reviewer' | 'qc';

interface PromptAggregateViewProps {
  mode: AggregateMode;
  tableId?: string;
  recordId?: string;
  recordFields: Record<string, any>;
  fields: IFieldRenderData[];
  fieldMetaList: IFieldMeta[];
  allFieldMetaList: IFieldMeta[];
  editableFieldMap: Record<string, boolean>;
  translatableFieldIds: string[];
  enableRichRender: boolean;
  onValueSaved?: () => Promise<void> | void;
}

interface AggregateRecord {
  recordId: string;
  fields: Record<string, any>;
}

type PromptIndexEntry = {
  index: Map<string, string[]>;
  builtAt: number;
  building: boolean;
  hydrated: boolean;
  promise?: Promise<PromptIndexEntry>;
};

const COMMON_FIELD_NAMES = ['prompt', 'History', 'image', 'image_url', 'Response1', 'Response2'];
const REVIEW_FIELDS = [
  'Problem Types 1',
  'Extra Problem Types 1',
  'Response 1 comments',
  'Problem Types 2',
  'Extra Problem Types 2',
  'Response 2 comments',
  'Overall Likert',
  'Overall Diff PT',
  'Likert justification',
];
const QC_FIELDS = ['QC Status', 'QC justification', '验收', '问题', 'CB Feedback'];
const PROMPT_INDEX_TTL = 5 * 60 * 1000;
const WINDOW_RADIUS = 25;
const WINDOW_EXPAND_STEP = 60;
const WINDOW_MAX_RADIUS = 400;
const INDEX_BATCH_SIZE = 500;
const COLUMN_SCROLL_STORAGE_KEY = 'lightflow_aggregate_column_scroll_v1';
// Prompt ID -> recordId[] index，按表 + 字段缓存，避免每次切记录都全表扫描
const promptIndexCache = new Map<string, PromptIndexEntry>();

function getTextFromCellValue(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((seg: any) => seg?.text || seg?.name || '').join('');
  if (typeof value === 'object') return value.text || value.name || '';
  return String(value);
}

function normalizePromptId(value: any) {
  return getTextFromCellValue(value)
    .normalize('NFKC')
    .replace(/[‐‑‒–—﹘﹣－]/g, '-')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
}

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[\s_\-?？:：/]+/g, '');
}

function findMetaByName(fieldMetaList: IFieldMeta[], names: string[]) {
  const normalizedTargets = names.map(normalizeName);
  return fieldMetaList.find((field) => normalizedTargets.includes(normalizeName(field.name)));
}

function getFieldValue(record: AggregateRecord | null, fieldId?: string) {
  if (!record || !fieldId) return undefined;
  return record.fields?.[fieldId];
}

function detectPromptLanguage(promptId: string) {
  const prefix = promptId.trim().slice(0, 2).toUpperCase();
  const map: Record<string, string> = {
    BR: 'pt-BR',
    MX: 'es-MX',
    PH: 'tl',
    ID: 'id',
  };
  return map[prefix];
}

function buildRenderData(
  meta: IFieldMeta,
  value: any,
  tableId: string,
  recordId: string,
  editable: boolean
): IFieldRenderData {
  return {
    fieldId: meta.id,
    fieldName: meta.name,
    fieldType: meta.type as FieldType,
    value,
    meta,
    tableId,
    recordId,
    isEditable: editable,
  };
}

function isEmptyValue(value: any) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

function scoreReviewerRecord(record: AggregateRecord, fieldIds: string[]) {
  return fieldIds.reduce((score, fieldId) => score + (isEmptyValue(record.fields[fieldId]) ? 0 : 1), 0);
}

function uniqueRecords(records: AggregateRecord[]) {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (!record.recordId || seen.has(record.recordId)) return false;
    seen.add(record.recordId);
    return true;
  });
}

function isAutoTranslateField(fieldName: string) {
  return [
    'prompt',
    'history',
    'response1',
    'response2',
    'response1comments',
    'response2comments',
    'likertjustification',
  ].includes(normalizeName(fieldName));
}

function getFieldLanguageHint(fieldName: string, promptLanguageHint?: string) {
  const normalized = normalizeName(fieldName);
  if (normalized === 'response1comments' || normalized === 'response2comments') {
    return 'en';
  }
  if (['prompt', 'history', 'response1', 'response2'].includes(normalized)) {
    return promptLanguageHint;
  }
  return undefined;
}

async function fetchRecordsByIds(table: any, ids: string[]): Promise<AggregateRecord[]> {
  if (!ids.length) return [];

  if (typeof table.getRecordsByIds === 'function') {
    const results: AggregateRecord[] = [];
    for (let i = 0; i < ids.length; i += 1000) {
      const chunkIds = ids.slice(i, i + 1000);
      const values = (await table.getRecordsByIds(chunkIds)) || [];
      chunkIds.forEach((id: string, idx: number) => {
        results.push({ recordId: id, fields: values[idx]?.fields || {} });
      });
    }
    return results;
  }

  const results: AggregateRecord[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const batchIds = ids.slice(i, i + 10);
    const batch = await Promise.all(
      batchIds.map(async (id: string) => {
        const record = await table.getRecordById(id);
        return { recordId: id, fields: record?.fields || {} };
      })
    );
    results.push(...batch);
  }
  return results;
}

// 窗口扫描：以当前记录为中心，只抓取前后邻近的记录做匹配，命中相邻同组记录即返回
async function scanWindowForGroup(
  table: any,
  recordIds: string[],
  centerIndex: number,
  fieldId: string,
  targetPromptId: string
): Promise<AggregateRecord[]> {
  const center = centerIndex < 0 ? 0 : centerIndex;
  let radius = WINDOW_RADIUS;
  let matched: AggregateRecord[] = [];
  let expansions = 0;

  while (true) {
    const start = Math.max(0, center - radius);
    const end = Math.min(recordIds.length, center + radius + 1);
    const windowIds = recordIds.slice(start, end);
    const records = await fetchRecordsByIds(table, windowIds);
    matched = records.filter((item) => normalizePromptId(item.fields[fieldId]) === targetPromptId);

    const coversAll = start === 0 && end === recordIds.length;
    // 找到了相邻的同组记录（不止当前这条）即可返回；否则最多再扩两次窗口，剩下的交给后台索引兜底
    if (matched.length > 1 || coversAll || expansions >= 2 || radius >= WINDOW_MAX_RADIUS) {
      break;
    }
    radius += WINDOW_EXPAND_STEP;
    expansions += 1;
  }

  return matched;
}

// 后台构建 Prompt ID -> recordId[] 索引，一张表只构建一次并缓存（带 TTL），并发去重
function ensurePromptIndex(
  table: any,
  indexKey: string,
  recordIds: string[],
  fieldId: string
): Promise<PromptIndexEntry> {
  const existing = promptIndexCache.get(indexKey);
  if (existing?.hydrated && Date.now() - existing.builtAt < PROMPT_INDEX_TTL) {
    return Promise.resolve(existing);
  }
  if (existing?.building && existing.promise) {
    return existing.promise;
  }

  const entry: PromptIndexEntry = existing ?? {
    index: new Map<string, string[]>(),
    builtAt: 0,
    building: false,
    hydrated: false,
  };
  entry.building = true;

  const promise = (async () => {
    const index = new Map<string, string[]>();
    for (let i = 0; i < recordIds.length; i += INDEX_BATCH_SIZE) {
      const chunkIds = recordIds.slice(i, i + INDEX_BATCH_SIZE);
      const records = await fetchRecordsByIds(table, chunkIds);
      records.forEach((item) => {
        const key = normalizePromptId(item.fields[fieldId]);
        if (!key) return;
        const bucket = index.get(key);
        if (bucket) bucket.push(item.recordId);
        else index.set(key, [item.recordId]);
      });
      // 让出主线程，避免大表索引构建阻塞交互
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    entry.index = index;
    entry.builtAt = Date.now();
    entry.hydrated = true;
    entry.building = false;
    return entry;
  })();

  entry.promise = promise;
  promptIndexCache.set(indexKey, entry);
  return promise;
}

const PromptAggregateView: React.FC<PromptAggregateViewProps> = ({
  mode,
  tableId,
  recordId,
  recordFields,
  fields,
  allFieldMetaList,
  editableFieldMap,
  translatableFieldIds,
  enableRichRender,
  onValueSaved,
}) => {
  const [groupRecords, setGroupRecords] = useState<AggregateRecord[]>([]);
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [groupError, setGroupError] = useState('');
  const [resolvedGroupKey, setResolvedGroupKey] = useState('');
  const [columnScrollEnabled, setColumnScrollEnabled] = useState(() => {
    try {
      return localStorage.getItem(COLUMN_SCROLL_STORAGE_KEY) !== 'off';
    } catch {
      return true;
    }
  });

  const fieldMap = useMemo(() => new Map(fields.map((field) => [field.fieldId, field])), [fields]);
  const translationCacheFieldMap = useMemo(
    () => identifyTranslationCacheFieldMap(allFieldMetaList),
    [allFieldMetaList]
  );
  const promptIdMeta = useMemo(
    () => findMetaByName(allFieldMetaList, ['Prompt ID']),
    [allFieldMetaList]
  );
  const currentRecord = useMemo<AggregateRecord | null>(() => {
    if (!recordId) return null;
    return {
      recordId,
      fields: recordFields || {},
    };
  }, [recordId, recordFields]);
  const promptId = normalizePromptId(getFieldValue(currentRecord, promptIdMeta?.id));
  const sourceLanguageHint = detectPromptLanguage(promptId);
  const groupLookupKey = `${tableId || ''}:${promptIdMeta?.id || ''}:${promptId}`;

  const commonMetas = useMemo(
    () =>
      COMMON_FIELD_NAMES
        .map((name) => findMetaByName(allFieldMetaList, [name]))
        .filter(Boolean) as IFieldMeta[],
    [allFieldMetaList]
  );
  const reviewMetas = useMemo(
    () =>
      REVIEW_FIELDS
        .map((name) => findMetaByName(allFieldMetaList, [name]))
        .filter(Boolean) as IFieldMeta[],
    [allFieldMetaList]
  );
  const qcMetas = useMemo(
    () =>
      QC_FIELDS
        .map((name) => findMetaByName(allFieldMetaList, [name]))
        .filter(Boolean) as IFieldMeta[],
    [allFieldMetaList]
  );

  useEffect(() => {
    let cancelled = false;

    const applyMatched = (matched: AggregateRecord[]) => {
      if (cancelled) return;
      setGroupRecords(uniqueRecords([...(currentRecord ? [currentRecord] : []), ...matched]));
      setResolvedGroupKey(groupLookupKey);
    };

    const loadGroup = async () => {
      if (!tableId || !promptIdMeta || !promptId) {
        setGroupRecords([]);
        setResolvedGroupKey('');
        return;
      }

      setGroupError('');
      setLoadingGroup(true);
      setResolvedGroupKey('');
      const fieldId = promptIdMeta.id;
      const indexKey = `${tableId}:${fieldId}`;

      try {
        const table = await bitable.base.getTableById(tableId);
        const recordIds = (await table.getRecordIdList()) || [];

        // 命中已构建的索引：直接按 Prompt ID 取 recordId 列表，最快路径
        const indexed = promptIndexCache.get(indexKey);
        if (indexed?.hydrated && Date.now() - indexed.builtAt < PROMPT_INDEX_TTL) {
          const ids = indexed.index.get(promptId) || [];
          const records = await fetchRecordsByIds(table, ids);
          if (!cancelled) {
            applyMatched(records);
            setLoadingGroup(false);
          }
          return;
        }

        // 无索引：先做邻近窗口扫描，快速命中相邻的同组记录
        const centerIndex = recordId ? recordIds.indexOf(recordId) : -1;
        const windowMatched = await scanWindowForGroup(table, recordIds, centerIndex, fieldId, promptId);
        if (!cancelled) {
          applyMatched(windowMatched);
          setLoadingGroup(false);
        }

        // 后台补建全表索引，构建完再用完整结果校正当前分组（不阻塞首屏）
        ensurePromptIndex(table, indexKey, recordIds, fieldId)
          .then(async (entry) => {
            if (cancelled) return;
            const ids = entry.index.get(promptId) || [];
            if (ids.length <= windowMatched.length) return;
            const fullRecords = await fetchRecordsByIds(table, ids);
            if (!cancelled) applyMatched(fullRecords);
          })
          .catch(() => {
            /* 后台索引失败不影响窗口扫描结果 */
          });
      } catch (err: any) {
        if (!cancelled) {
          setGroupError(err?.message || '同 Prompt ID 记录读取失败');
          setGroupRecords(currentRecord ? [currentRecord] : []);
          setResolvedGroupKey(groupLookupKey);
          setLoadingGroup(false);
        }
      }
    };

    loadGroup();
    return () => {
      cancelled = true;
    };
  }, [tableId, promptIdMeta?.id, promptId, currentRecord, groupLookupKey]);

  const groupLookupResolved = resolvedGroupKey === groupLookupKey;

  const roleRecords = useMemo(() => {
    const all = groupRecords.length > 0 ? groupRecords : currentRecord ? [currentRecord] : [];
    const current = all.find((record) => record.recordId === recordId) || currentRecord || all[0] || null;
    const others = all.filter((record) => record.recordId !== current?.recordId);
    const reviewFieldIds = reviewMetas.map((meta) => meta.id);
    const sortedOthers = [...others].sort(
      (a, b) => scoreReviewerRecord(b, reviewFieldIds) - scoreReviewerRecord(a, reviewFieldIds)
    );

    return {
      contributor1: sortedOthers[0] || null,
      contributor2: sortedOthers[1] || null,
      reviewer: current,
    };
  }, [groupRecords, currentRecord, recordId, reviewMetas]);

  const compareColumns = useMemo(
    () =>
      mode === 'qc'
        ? [
            { title: 'Contributor 1 作业字段', record: roleRecords.contributor1 },
            { title: 'Contributor 2 作业字段', record: roleRecords.contributor2 },
            { title: 'Reviewer 作业字段', record: roleRecords.reviewer },
          ]
        : [
            { title: 'Contributor 1 作业字段', record: roleRecords.contributor1 },
            { title: 'Contributor 2 作业字段', record: roleRecords.contributor2 },
          ],
    [mode, roleRecords]
  );

  const renderCard = (
    meta: IFieldMeta,
    ownerRecord: AggregateRecord | null,
    options: { editable?: boolean; translate?: boolean; languageHint?: string; autoTranslate?: boolean } = {}
  ) => {
    if (!tableId || !ownerRecord) {
      return (
        <div key={meta.id} className="aggregate-empty">
          {groupLookupResolved && !loadingGroup ? '未找到对应记录' : '匹配同 Prompt ID 记录中...'}
        </div>
      );
    }

    const currentField = fieldMap.get(meta.id);
    const editable = !!options.editable && ownerRecord.recordId === recordId && !!editableFieldMap[meta.id];
    const showTranslate = !!options.translate || translatableFieldIds.includes(meta.id);
    const autoTranslate = showTranslate && (options.autoTranslate || isAutoTranslateField(meta.name));
    const cacheMeta = translationCacheFieldMap[meta.id];
    const renderData = buildRenderData(
      meta,
      ownerRecord.recordId === recordId && currentField ? currentField.value : ownerRecord.fields[meta.id],
      tableId,
      ownerRecord.recordId,
      editable
    );

    return (
      <div
        key={`${ownerRecord.recordId}-${meta.id}`}
        className={`aggregate-field-card ${isAutoTranslateField(meta.name) ? 'scroll-card' : ''}`}
      >
        <div className="aggregate-field-name">
          <span>{meta.name}</span>
          {editable && <span className="field-permission-tag editable">可编辑</span>}
        </div>
        <FieldRenderer
          data={renderData}
          showTranslate={showTranslate}
          sourceLanguageHint={options.languageHint}
          cachedTranslatedText={cacheMeta ? getTextFromCellValue(ownerRecord.fields[cacheMeta.id]) : ''}
          cachedTranslatedFieldName={cacheMeta?.name}
          autoTranslate={autoTranslate}
          enableRichRender={enableRichRender}
          showFeedbackAssistant={false}
          onValueSaved={onValueSaved}
        />
      </div>
    );
  };

  const renderEditableSection = (title: string, metas: IFieldMeta[]) => (
    <section className="aggregate-bottom-section">
      <div className="aggregate-section-title">{title}</div>
      <div className="aggregate-edit-grid">
        {metas.map((meta) =>
          renderCard(meta, roleRecords.reviewer, {
            editable: true,
            translate: normalizeName(meta.name).includes('justification'),
              autoTranslate: normalizeName(meta.name) === 'likertjustification',
          })
        )}
      </div>
    </section>
  );

  return (
    <div className="prompt-aggregate-view">
      <div className="aggregate-status-bar">
        <span>{mode === 'reviewer' ? 'Reviewer 聚合作业视图' : 'QC 质检聚合视图'}</span>
        <span>Prompt ID：{promptId || '未识别'}</span>
        <span>同组记录：{groupRecords.length || 1} 条</span>
        {sourceLanguageHint && <span>语言提示：{sourceLanguageHint}</span>}
        <label className="aggregate-inline-toggle">
          <input
            type="checkbox"
            checked={columnScrollEnabled}
            onChange={(event) => {
              const enabled = event.target.checked;
              setColumnScrollEnabled(enabled);
              try {
                localStorage.setItem(COLUMN_SCROLL_STORAGE_KEY, enabled ? 'on' : 'off');
              } catch {
                // ignore storage failures in host iframe
              }
            }}
          />
          作业板块内嵌滚动
        </label>
      </div>

      {groupError && <div className="aggregate-hint error">{groupError}</div>}

      <section className="aggregate-common-section">
        <div className="aggregate-section-title">题目与回复阅读区</div>
        <div className="aggregate-common-grid">
          {commonMetas.map((meta) =>
            renderCard(meta, roleRecords.reviewer || currentRecord, {
              translate: ['prompt', 'history', 'response1', 'response2'].includes(normalizeName(meta.name)),
              languageHint: getFieldLanguageHint(meta.name, sourceLanguageHint),
              autoTranslate: true,
            })
          )}
        </div>
      </section>

      <section className={`aggregate-column aggregate-compare-section ${columnScrollEnabled ? 'panel-scroll' : ''}`}>
        <div
          className={`aggregate-columns aggregate-columns-header ${mode === 'qc' ? 'three' : 'two'}`}
          style={{ gridTemplateColumns: `repeat(${compareColumns.length}, minmax(0, 1fr))` }}
        >
          {compareColumns.map((column) => (
            <div key={column.title} className="aggregate-column-title">
              {column.title}
            </div>
          ))}
        </div>
        <div className="aggregate-column-body aggregate-aligned-body">
          {reviewMetas.map((meta) => (
            <div
              key={meta.id}
              className="aggregate-compare-row"
              style={{ gridTemplateColumns: `repeat(${compareColumns.length}, minmax(0, 1fr))` }}
            >
              {compareColumns.map((column) => (
                <div key={`${meta.id}-${column.title}`} className="aggregate-compare-cell">
                  {renderCard(meta, column.record, {
                    editable: false,
                    translate: isAutoTranslateField(meta.name),
                    languageHint: getFieldLanguageHint(meta.name, sourceLanguageHint),
                    autoTranslate: isAutoTranslateField(meta.name),
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {mode === 'reviewer'
        ? renderEditableSection('Reviewer 需要填写的字段', reviewMetas)
        : renderEditableSection('QC 需要填写的字段', qcMetas)}
    </div>
  );
};

export default PromptAggregateView;
