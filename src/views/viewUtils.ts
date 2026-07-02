import { IFieldMeta, FieldType } from '@lark-base-open/js-sdk';
import { IViewConfig, ViewLayoutMode, ViewType } from '../types';

const STORAGE_KEY_PREFIX = 'lightflow_views_';
const LEGACY_BUILT_IN_VIEW_NAMES: Record<string, string[]> = {
  default: ['默认视图'],
  compare: ['对比视图'],
  speed: ['速读视图'],
  audit: ['审计视图'],
  'reviewer-aggregate': ['Reviewer 聚合'],
  'qc-aggregate': ['QC 聚合'],
};

export function getStorageKey(tableId: string): string {
  return `${STORAGE_KEY_PREFIX}${tableId}`;
}

export function loadViews(tableId: string): IViewConfig[] {
  try {
    const key = getStorageKey(tableId);
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load views from localStorage', e);
  }
  return [];
}

export function saveViews(tableId: string, views: IViewConfig[]): void {
  try {
    const key = getStorageKey(tableId);
    localStorage.setItem(key, JSON.stringify(views));
  } catch (e) {
    console.warn('Failed to save views to localStorage', e);
  }
}

export function generateBuiltInViews(fieldMetaList: IFieldMeta[]): IViewConfig[] {
  const allFieldIds = fieldMetaList
    .filter((f) => !f.isPrimary)
    .map((f) => f.id);
  const translatableFieldIds = identifyTranslatableFields(fieldMetaList);
  const feedbackFieldIds = identifyFeedbackFields(fieldMetaList);
  const grouped = groupFieldIds(fieldMetaList);
  const cbFieldIds = uniqueIds([
    ...grouped.context,
    ...grouped.responses,
    ...grouped.decision,
    ...grouped.other,
  ]);
  const compareFieldIds = uniqueIds([
    ...grouped.context,
    ...grouped.responses,
    ...grouped.decision,
    ...grouped.meta,
  ]);
  const speedFieldIds = uniqueIds([
    ...grouped.context,
    ...grouped.responses,
  ]);
  const qcFieldIds = uniqueIds([
    ...grouped.context,
    ...grouped.responses,
    ...grouped.decision,
    ...grouped.qc,
    ...grouped.other,
  ]);

  const defaultView: IViewConfig = {
    viewId: 'default',
    viewName: 'CB 作业',
    viewType: 'default',
    fieldsOrder: completeFieldOrder(cbFieldIds, allFieldIds),
    hiddenFields: allFieldIds.filter((id) => grouped.qc.includes(id)),
    settings: {
      layoutMode: 'single',
      description: 'CB 主作业视图。先读 history / prompt / 图像等上下文，再评估 R1、R2，填写问题标签、理由和提交结果。',
      translationFieldIds: translatableFieldIds,
      feedbackFieldIds,
      enableRichRender: true,
    },
    isBuiltIn: true,
  };

  const compareView: IViewConfig = {
    viewId: 'compare',
    viewName: '回复对比',
    viewType: 'compare',
    fieldsOrder: completeFieldOrder(compareFieldIds, allFieldIds),
    hiddenFields: allFieldIds.filter((id) => grouped.qc.includes(id)),
    settings: {
      responseFields: identifyResponseFields(fieldMetaList),
      layoutMode: 'single',
      description: '把 R1 / R2 拉到并排区域，减少来回滚动。适合专注比较两个模型回复，再顺手填写标签、Likert 和理由。',
      translationFieldIds: translatableFieldIds,
      feedbackFieldIds,
      enableRichRender: true,
    },
    isBuiltIn: true,
  };

  const textFieldIds = fieldMetaList
    .filter(
      (f) =>
        !f.isPrimary &&
        (f.type === FieldType.Text || f.type === FieldType.Url)
    )
    .map((f) => f.id);

  const speedView: IViewConfig = {
    viewId: 'speed',
    viewName: '速读翻译',
    viewType: 'speed',
    fieldsOrder: completeFieldOrder(speedFieldIds.filter((id) => textFieldIds.includes(id)), allFieldIds),
    hiddenFields: allFieldIds.filter((id) => !speedFieldIds.includes(id)),
    settings: {
      largeFont: true,
      layoutMode: 'compact',
      description: '只保留 history / prompt / 回复等核心文本，减少切屏。适合 CB 快速阅读、核对内容和做即时翻译。',
      translationFieldIds: translatableFieldIds,
      feedbackFieldIds,
      enableRichRender: true,
    },
    isBuiltIn: true,
  };

  const auditView: IViewConfig = {
    viewId: 'audit',
    viewName: 'QC 质检',
    viewType: 'audit',
    fieldsOrder: completeFieldOrder(qcFieldIds, allFieldIds),
    hiddenFields: [],
    settings: {
      highlightFields: grouped.qc,
      layoutMode: 'grid',
      description: '给 QC 用的复核视图。集中看 CB 的标签、理由、Likert、提交状态和 QC 自己的复判字段，方便逐条质检。',
      translationFieldIds: translatableFieldIds,
      feedbackFieldIds,
      enableRichRender: true,
    },
    isBuiltIn: true,
  };

  const aggregateTranslationFieldIds = identifyAggregateTranslatableFields(fieldMetaList);
  const reviewerAggregateView: IViewConfig = {
    viewId: 'reviewer-aggregate',
    viewName: 'reviewer',
    viewType: 'reviewerAggregate',
    fieldsOrder: [...allFieldIds],
    hiddenFields: [],
    settings: {
      layoutMode: 'single',
      description: '按 Prompt ID 自动匹配同组记录。上方集中阅读 prompt / history / image / Response1 / Response2，中间两栏对齐查看两个 Contributor 的作业，底部填写 Reviewer 自己的评价字段。',
      translationFieldIds: aggregateTranslationFieldIds,
      feedbackFieldIds,
      enableRichRender: true,
    },
    isBuiltIn: true,
  };

  const qcAggregateView: IViewConfig = {
    viewId: 'qc-aggregate',
    viewName: '质检视图',
    viewType: 'qcAggregate',
    fieldsOrder: [...allFieldIds],
    hiddenFields: [],
    settings: {
      layoutMode: 'single',
      description: '给 QC 质检使用。按 Prompt ID 展示同组 Contributor1 / Contributor2 / Reviewer 三列作业内容，底部集中填写 QC Status、QC justification、验收和问题等质检字段。',
      translationFieldIds: aggregateTranslationFieldIds,
      feedbackFieldIds,
      enableRichRender: true,
    },
    isBuiltIn: true,
  };

  return [reviewerAggregateView, qcAggregateView, speedView];
}

export function mergeBuiltInViewWithSaved(
  freshView: IViewConfig,
  savedView: IViewConfig
): IViewConfig {
  const allowedFieldIds = new Set(freshView.fieldsOrder);
  const savedOrder = savedView.fieldsOrder.filter((id) => allowedFieldIds.has(id));
  const missingFieldIds = freshView.fieldsOrder.filter((id) => !savedOrder.includes(id));

  return {
    ...freshView,
    viewName:
      savedView.viewName &&
      !LEGACY_BUILT_IN_VIEW_NAMES[freshView.viewId]?.includes(savedView.viewName)
        ? savedView.viewName
        : freshView.viewName,
    fieldsOrder: [...savedOrder, ...missingFieldIds],
    hiddenFields: savedView.hiddenFields.filter((id) => allowedFieldIds.has(id)),
    settings: {
      ...freshView.settings,
      ...savedView.settings,
      translationFieldIds: uniqueIds([
        ...(freshView.settings?.translationFieldIds || []),
        ...(savedView.settings?.translationFieldIds || []),
      ]),
    },
  };
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

function completeFieldOrder(priorityIds: string[], fallbackIds: string[]) {
  return uniqueIds([...priorityIds, ...fallbackIds]);
}

function includesKeyword(name: string, keywords: string[]) {
  const lower = name.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function groupFieldIds(fieldMetaList: IFieldMeta[]) {
  const contextKeywords = [
    'history', 'prompt', 'session', 'section', 'supplier', 'image', 'role',
    'ability', 'multi', 'single', 'cb name', 'task', 'source',
  ];
  const responseKeywords = ['response', 'r1', 'r2', 'answer', 'reply'];
  const decisionKeywords = [
    'problem', 'extra problem', 'comment', 'likert', 'justification',
    'reason', 'label', 'submit', 'gsb', 'diff',
  ];
  const qcKeywords = ['qc', 'reviewer', 'review', '质检', '审核', '复核'];
  const metaKeywords = ['id', 'date', 'time', 'status', 'name'];

  const grouped = {
    context: [] as string[],
    responses: [] as string[],
    decision: [] as string[],
    qc: [] as string[],
    meta: [] as string[],
    other: [] as string[],
  };

  fieldMetaList
    .filter((field) => !field.isPrimary)
    .forEach((field) => {
      const name = field.name;

      if (includesKeyword(name, qcKeywords)) {
        grouped.qc.push(field.id);
        return;
      }
      if (includesKeyword(name, responseKeywords)) {
        grouped.responses.push(field.id);
        return;
      }
      if (includesKeyword(name, decisionKeywords)) {
        grouped.decision.push(field.id);
        return;
      }
      if (includesKeyword(name, contextKeywords)) {
        grouped.context.push(field.id);
        return;
      }
      if (includesKeyword(name, metaKeywords)) {
        grouped.meta.push(field.id);
        return;
      }
      grouped.other.push(field.id);
    });

  return grouped;
}

export function identifyResponseFields(fieldMetaList: IFieldMeta[]): string[] {
  const keywords = [
    'Response',
    'R1',
    'R2',
    'R3',
    '回答1',
    '回答2',
    '回答3',
    '回复1',
    '回复2',
    '回复3',
  ];

  const responseFields: string[] = [];

  for (const keyword of keywords) {
    const found = fieldMetaList.find(
      (f) =>
        !f.isPrimary &&
        (f.name.toLowerCase().includes(keyword.toLowerCase()) ||
          f.name.includes(keyword))
    );
    if (found && !responseFields.includes(found.id)) {
      responseFields.push(found.id);
    }
  }

  if (responseFields.length < 2) {
    const textFields = fieldMetaList.filter(
      (f) => !f.isPrimary && f.type === FieldType.Text
    );
    for (const f of textFields) {
      if (!responseFields.includes(f.id)) {
        responseFields.push(f.id);
        if (responseFields.length >= 3) break;
      }
    }
  }

  return responseFields.slice(0, 3);
}

export function isTextLikeField(field: IFieldMeta) {
  return !field.isPrimary && [FieldType.Text, FieldType.Url].includes(field.type);
}

export function identifyTranslatableFields(fieldMetaList: IFieldMeta[]): string[] {
  const priorityKeywords = [
    'history',
    'prompt',
    'response',
    'comment',
    'justification',
    'reason',
    'feedback',
    'reply',
    'answer',
    'content',
  ];
  const skipKeywords = [
    'id',
    'status',
    'date',
    'time',
    'code',
    'name',
    'supplier',
  ];

  const textFields = fieldMetaList.filter((field) => isTextLikeField(field));
  const prioritized = textFields.filter(
    (field) =>
      includesKeyword(field.name, priorityKeywords) &&
      !includesKeyword(field.name, skipKeywords)
  );
  const fallback = textFields.filter(
    (field) =>
      !prioritized.some((item) => item.id === field.id) &&
      !includesKeyword(field.name, skipKeywords)
  );

  return [...prioritized, ...fallback].map((field) => field.id);
}

export function identifyFeedbackFields(fieldMetaList: IFieldMeta[]): string[] {
  const keywords = ['qc', 'comment', 'justification', 'reason', 'feedback', 'review'];
  return fieldMetaList
    .filter((field) => isTextLikeField(field) && includesKeyword(field.name, keywords))
    .map((field) => field.id);
}

export function identifyAggregateTranslatableFields(fieldMetaList: IFieldMeta[]): string[] {
  const exactNames = [
    'prompt',
    'History',
    'Response1',
    'Response2',
    'Response 1 comments',
    'Response 2 comments',
    'Likert justification',
  ].map((name) => normalizeFieldName(name));

  return fieldMetaList
    .filter((field) => isTextLikeField(field))
    .filter((field) => exactNames.includes(normalizeFieldName(field.name)))
    .map((field) => field.id);
}

export function identifyTranslationCacheFieldMap(fieldMetaList: IFieldMeta[]): Record<string, IFieldMeta> {
  const textLikeFields = fieldMetaList.filter((field) => isTextLikeField(field));
  const normalizedMap = new Map<string, IFieldMeta>(
    textLikeFields.map((field) => [normalizeFieldName(field.name), field])
  );

  return Object.fromEntries(
    textLikeFields
      .filter((field) => !normalizeFieldName(field.name).startsWith('cn'))
      .map((field) => {
        const cacheField = getTranslationCacheField(field, normalizedMap);
        return cacheField ? [field.id, cacheField] : null;
      })
      .filter(Boolean) as Array<[string, IFieldMeta]>
  );
}

function getTranslationCacheField(
  field: IFieldMeta,
  normalizedMap: Map<string, IFieldMeta>
) {
  const candidates = getTranslationCacheCandidateNames(field.name);
  for (const candidate of candidates) {
    const matched = normalizedMap.get(candidate);
    if (matched) {
      return matched;
    }
  }
  return undefined;
}

function getTranslationCacheCandidateNames(fieldName: string) {
  const normalized = normalizeFieldName(fieldName);
  const candidates = new Set<string>([`cn${normalized}`]);

  const aliasMap: Record<string, string[]> = {
    prompt: ['prompt'],
    history: ['history'],
    response1: ['response1', 'res1', 'r1'],
    response2: ['response2', 'res2', 'r2'],
    response1comment: ['response1comment', 'response1comments', 'res1comment', 'res1comments'],
    response1comments: ['response1comments', 'response1comment', 'res1comment', 'res1comments'],
    response2comment: ['response2comment', 'response2comments', 'res2comment', 'res2comments'],
    response2comments: ['response2comments', 'response2comment', 'res2comment', 'res2comments'],
    likertjustification: ['likertjustification', 'overalljustification', 'justification'],
  };

  for (const [key, aliases] of Object.entries(aliasMap)) {
    if (normalized === key) {
      aliases.forEach((alias) => candidates.add(`cn${alias}`));
    }
  }

  return Array.from(candidates);
}

function normalizeFieldName(name: string) {
  return name.toLowerCase().replace(/[\s_\-?？:：/]+/g, '');
}

export function isQCField(fieldName: string): boolean {
  const keywords = ['QC', 'Reviewer', '反馈', '质量', '审核', '检查', 'Status', '状态'];
  return keywords.some((k) => fieldName.toLowerCase().includes(k.toLowerCase()));
}

export function isStatusField(fieldName: string): boolean {
  const keywords = ['QC Status', 'Status', '状态', '审核状态', '质检状态'];
  return keywords.some((k) => fieldName.toLowerCase().includes(k.toLowerCase()));
}

export function findStatusFieldId(fieldMetaList: IFieldMeta[]): string | null {
  const field = fieldMetaList.find((f) => isStatusField(f.name) && f.type === FieldType.SingleSelect);
  return field?.id || null;
}

export function findWorkerFieldId(fieldMetaList: IFieldMeta[]): string | null {
  const keywords = ['CB Name', '作业人', '负责人', '处理人', '审核人', 'Reviewer'];
  const field = fieldMetaList.find(
    (f) =>
      f.type === FieldType.User &&
      keywords.some((k) => f.name.toLowerCase().includes(k.toLowerCase()))
  );
  return field?.id || null;
}

export function getInitialViews(
  tableId: string,
  fieldMetaList: IFieldMeta[]
): IViewConfig[] {
  const saved = loadViews(tableId);
  const builtIn = generateBuiltInViews(fieldMetaList);

  if (saved.length === 0) {
    return builtIn;
  }

  const builtInMap = new Map(builtIn.map((v) => [v.viewId, v]));
  const result: IViewConfig[] = [];

  for (const savedView of saved) {
    if (savedView.isBuiltIn && builtInMap.has(savedView.viewId)) {
      const freshBuiltIn = builtInMap.get(savedView.viewId)!;
      result.push(mergeBuiltInViewWithSaved(freshBuiltIn, savedView));
    } else if (savedView.isBuiltIn) {
      continue;
    } else {
      result.push(savedView);
    }
  }

  const resultIds = new Set(result.map((v) => v.viewId));
  for (const builtInView of builtIn) {
    if (!resultIds.has(builtInView.viewId)) {
      result.push(builtInView);
    }
  }

  return result;
}

export function createNewView(
  baseView: IViewConfig,
  name: string,
  fieldsOrder: string[],
  hiddenFields: string[]
): IViewConfig {
  const baseViewId =
    baseView.isBuiltIn
      ? baseView.viewId
      : typeof baseView.settings?.baseViewId === 'string'
        ? baseView.settings.baseViewId
        : undefined;

  return {
    viewId: `custom_${Date.now()}`,
    viewName: name,
    viewType: 'custom',
    fieldsOrder: [...fieldsOrder],
    hiddenFields: [...hiddenFields],
    settings: {
      ...baseView.settings,
      ...(baseViewId ? { baseViewId } : {}),
    },
    isBuiltIn: false,
  };
}

export function getViewDescription(view: IViewConfig | undefined): string {
  if (!view) return '';
  return view.settings?.description || '自定义字段显示顺序和布局，用作你的个人工作预设。';
}

export function getViewLayoutMode(view: IViewConfig | undefined): ViewLayoutMode {
  const layoutMode = view?.settings?.layoutMode;
  if (layoutMode === 'compact' || layoutMode === 'grid' || layoutMode === 'single') {
    return layoutMode;
  }

  if (view?.viewType === 'speed') return 'compact';
  if (view?.viewType === 'audit') return 'grid';
  return 'single';
}

export function getViewLayoutLabel(layoutMode: ViewLayoutMode): string {
  const labels: Record<ViewLayoutMode, string> = {
    single: '单列沉浸',
    compact: '紧凑速读',
    grid: '双列卡片',
  };
  return labels[layoutMode];
}

export function reorderFields(
  fieldsOrder: string[],
  fromIndex: number,
  toIndex: number
): string[] {
  const result = [...fieldsOrder];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}
