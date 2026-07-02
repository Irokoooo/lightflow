import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { bitable, IFieldMeta, FieldType, OperationType, PermissionEntity, ThemeModeType } from '@lark-base-open/js-sdk';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import FieldRenderer from './renderers';
import CompareView from './renderers/CompareView';
import PromptAggregateView from './renderers/PromptAggregateView';
import { IFieldRenderData, IOpenUser } from './types';
import { useViews } from './views/useViews';
import {
  getViewDescription,
  getViewLayoutLabel,
  getViewLayoutMode,
  identifyFeedbackFields,
  identifyTranslationCacheFieldMap,
  identifyTranslatableFields,
  isQCField,
} from './views/viewUtils';
import { useRecords } from './hooks/useRecords';
import ViewTabs from './components/ViewTabs';
import ViewEditor from './components/ViewEditor';
import Dashboard from './components/Dashboard';
import { loadConfig, type DashboardConfig, type MyFieldCondition } from './components/DashboardConfig';
import KeyboardHelp from './components/KeyboardHelp';
import AIProbePanel from './components/AIProbePanel';
import { hasFeishuTranslationProvider, prefetchTranslations } from './renderers/translationService';
import './App.css';

const dbgApp = (_hypothesisId: string, _msg: string, _data: Record<string, any> = {}) => {};

function getTextFromCellValue(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((seg: any) => seg.text || '')
      .join('');
  }
  if (typeof value === 'object') return value.text || value.name || value.value || '';
  return String(value);
}

function normalizeFieldName(name: string) {
  return name.toLowerCase().replace(/[\s_\-?？:：/]+/g, '');
}

function getPermissionTargetFieldIds(metaList: IFieldMeta[], view: any): string[] {
  if (view?.viewType === 'reviewerAggregate' || view?.viewType === 'qcAggregate') {
    const reviewerFields = [
      'problemtypes1',
      'extraproblemtypes1',
      'response1comments',
      'problemtypes2',
      'extraproblemtypes2',
      'response2comments',
      'overalllikert',
      'overalldiffpt',
      'likertjustification',
    ];
    const qcFields = ['qcstatus', 'qcjustification', '验收', '问题', 'cbfeedback'];
    const targets = view.viewType === 'qcAggregate' ? qcFields : reviewerFields;
    return metaList
      .filter((meta) => targets.includes(normalizeFieldName(meta.name)))
      .map((meta) => meta.id);
  }

  const visibleIds =
    view?.fieldsOrder?.filter((fieldId: string) => !view.hiddenFields?.includes(fieldId)) || metaList.map((meta) => meta.id);
  return visibleIds;
}

function detectPromptLanguageFromText(promptId: string) {
  const prefix = promptId.trim().slice(0, 2).toUpperCase();
  const map: Record<string, string> = {
    BR: 'pt-BR',
    MX: 'es-MX',
    PH: 'tl',
    ID: 'id',
  };
  return map[prefix] || '';
}

function fieldContainsMe(v: any, myOpenId: string, myName: string): boolean {
  if (!v) return false;
  if (Array.isArray(v)) {
    return v.some((u: any) => {
      if (u == null) return false;
      if (typeof u === 'object') {
        const uid = u.id || u.open_id || u.openId || u.userId || u.user_id || '';
        const uname = u.name || u.enName || u.en_name || u.nickname || u.nickName || '';
        return !!(myOpenId && uid === myOpenId) || !!(myName && uname === myName);
      }
      return typeof u === 'string' && !!(myName && u.includes(myName));
    });
  }
  return typeof v === 'string' && !!(myName && v.includes(myName));
}

function fieldEqualsValue(v: any, target: string): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() === target;
  if (Array.isArray(v)) {
    return v.some((x: any) => {
      if (typeof x === 'string') return x === target;
      if (x && typeof x === 'object') return x.text === target || x.name === target || x.value === target;
      return false;
    });
  }
  if (typeof v === 'object') return v.text === target || v.name === target || v.value === target;
  return String(v) === target;
}

function isNotEmptyValue(v: any): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number') return !Number.isNaN(v);
  if (typeof v === 'object') {
    if (v.text !== undefined) return v.text !== '' && v.text != null;
    return Object.keys(v).length > 0;
  }
  return Boolean(v);
}

function matchesDashboardCondition(
  cond: MyFieldCondition,
  value: any,
  config: DashboardConfig
) {
  if (cond.type === 'contains_me') {
    return fieldContainsMe(value, config.myselfId || '', config.myselfName || '');
  }
  return fieldEqualsValue(value, cond.value);
}

function isPendingForDashboard(fields: Record<string, any>, config: DashboardConfig) {
  const hasMineRule = !!(config.myselfId || config.myselfName) && config.myConditions.length > 0;
  const isMine = hasMineRule
    ? config.myConditions.some((cond) => matchesDashboardCondition(cond, fields[cond.fieldId], config))
    : true;
  if (!isMine) return false;

  if (!config.doneFieldId) return true;
  const doneValue = fields[config.doneFieldId];
  if (config.doneMode === 'not_empty') return !isNotEmptyValue(doneValue);
  return !fieldEqualsValue(doneValue, config.doneValue);
}

function getPrefetchFieldMetas(fieldMetaList: IFieldMeta[]) {
  const targets = new Set([
    'prompt',
    'history',
    'response1',
    'response2',
    'response1comments',
    'response2comments',
    'likertjustification',
  ]);
  return fieldMetaList.filter((meta) => targets.has(normalizeFieldName(meta.name)));
}

type LayoutEditSnapshot = {
  viewId: string;
  fieldsOrder: string[];
  hiddenFields: string[];
  translationFieldIds: string[];
  enableRichRender: boolean;
};

function buildLayoutEditSnapshot(view: any): LayoutEditSnapshot | null {
  if (!view?.viewId) return null;
  return {
    viewId: view.viewId,
    fieldsOrder: [...(view.fieldsOrder || [])],
    hiddenFields: [...(view.hiddenFields || [])],
    translationFieldIds: [...(view.settings?.translationFieldIds || [])],
    enableRichRender: view.settings?.enableRichRender !== false,
  };
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function hasLayoutEditChanges(before: LayoutEditSnapshot | null, after: LayoutEditSnapshot | null) {
  if (!before || !after || before.viewId !== after.viewId) return false;
  return (
    !areStringArraysEqual(before.fieldsOrder, after.fieldsOrder) ||
    !areStringArraysEqual(before.hiddenFields, after.hiddenFields) ||
    !areStringArraysEqual(before.translationFieldIds, after.translationFieldIds) ||
    before.enableRichRender !== after.enableRichRender
  );
}

export default function App() {
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [fields, setFields] = useState<IFieldRenderData[]>([]);
  const [recordTitle, setRecordTitle] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldMetaList, setFieldMetaList] = useState<IFieldMeta[]>([]);
  const [allFieldMetaList, setAllFieldMetaList] = useState<IFieldMeta[]>([]);
  const [tableId, setTableId] = useState<string | undefined>();
  const [viewId, setViewId] = useState<string | undefined>();
  const [recordId, setRecordId] = useState<string | undefined>();
  const [recordFields, setRecordFields] = useState<Record<string, any>>({});
  const [editableFieldMap, setEditableFieldMap] = useState<Record<string, boolean>>({});
  const permissionCacheRef = useRef<Map<string, boolean>>(new Map());
  const hasLoadedRecordRef = useRef(false);
  const prefetchRecordsCacheRef = useRef<{
    tableId: string;
    loadedAt: number;
    records: Array<{ recordId: string; fields: Record<string, any> }>;
  } | null>(null);
  const prefetchRunKeyRef = useRef('');
  const refreshTimerRef = useRef<number | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [layoutEditMode, setLayoutEditMode] = useState(false);
  const [savePresetDialogOpen, setSavePresetDialogOpen] = useState(false);
  const [presetDraftName, setPresetDraftName] = useState('');
  const layoutEditSnapshotRef = useRef<LayoutEditSnapshot | null>(null);

  const {
    views,
    currentView,
    currentViewId,
    switchView,
    switchViewByIndex,
    moveField,
    toggleFieldVisibility,
    updateCurrentViewSettings,
    saveAsNewView,
    deleteView,
    resetToDefault,
  } = useViews(tableId, fieldMetaList);
  const currentViewRef = useRef(currentView);

  useEffect(() => {
    let disposed = false;

    const applyTheme = (theme?: ThemeModeType | string | null) => {
      const nextTheme = theme === ThemeModeType.DARK ? 'dark' : 'light';
      if (!disposed) {
        setThemeMode(nextTheme);
      }
      document.documentElement.setAttribute('data-lightflow-theme', nextTheme);
      document.documentElement.style.setProperty('color-scheme', nextTheme);
    };

    bitable.bridge
      .getTheme()
      .then((theme) => {
        applyTheme(theme);
      })
      .catch(() => {
        applyTheme(ThemeModeType.LIGHT);
      });

    const offThemeChange = bitable.bridge.onThemeChange((event) => {
      applyTheme(event?.data?.theme);
    });

    return () => {
      disposed = true;
      offThemeChange?.();
      document.documentElement.removeAttribute('data-lightflow-theme');
      document.documentElement.style.removeProperty('color-scheme');
    };
  }, []);

  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  const {
    goToNextRecord,
    goToPrevRecord,
    goToNextUnreviewed,
    setStatus,
    markBestResponse,
    getStats,
    getWorkerInfo,
  } = useRecords(tableId, recordId, fieldMetaList);

  const stats = useMemo(() => getStats(), [getStats]);
  const workerInfo = useMemo(
    () => getWorkerInfo(recordFields),
    [getWorkerInfo, recordFields]
  );

  const loadRecord = useCallback(async (
    target?: { tableId?: string | null; viewId?: string | null; recordId?: string | null },
    options?: { silent?: boolean }
  ) => {
    try {
      const shouldShowInitialLoading = !options?.silent && !hasLoadedRecordRef.current;
      if (shouldShowInitialLoading) {
        setLoading(true);
        setError(null);
      } else if (!options?.silent) {
        setError(null);
      }

      const selection = target ?? await bitable.base.getSelection();
      // #region debug-point C:load-record-selection
      dbgApp('C', 'loadRecord selection snapshot', { selection });
      // #endregion
      if (!selection.tableId || !selection.recordId) {
        setLoading(false);
        return;
      }

      setTableId(selection.tableId);
      setViewId(selection.viewId || undefined);
      setRecordId(selection.recordId);

      const table = await bitable.base.getTableById(selection.tableId);

      let metaList: IFieldMeta[];
      if (selection.viewId) {
        try {
          const view = await table.getViewById(selection.viewId);
          metaList = await view.getFieldMetaList();
        } catch {
          metaList = await table.getFieldMetaList();
        }
      } else {
        metaList = await table.getFieldMetaList();
      }

      const fullMetaList = await table.getFieldMetaList();
      const record = await table.getRecordById(selection.recordId);
      const translationCacheFieldMap = identifyTranslationCacheFieldMap(fullMetaList);
      setFieldMetaList(metaList);
      setAllFieldMetaList(fullMetaList);
      setRecordFields(record.fields);


      const primaryField = metaList.find((f: IFieldMeta) => f.isPrimary);
      const titleValue = primaryField ? record.fields[primaryField.id] : null;
      const title = primaryField
        ? getTextFromCellValue(titleValue) || '未命名记录'
        : '未命名记录';

      const permissionTargetIds = new Set(getPermissionTargetFieldIds(metaList, currentViewRef.current));
      const editableEntries = await Promise.all(
        metaList.map(async (meta: IFieldMeta) => {
          if (!permissionTargetIds.has(meta.id)) {
            return [meta.id, false] as const;
          }

          const cacheKey = `${selection.tableId}:${selection.recordId}:${meta.id}`;
          if (permissionCacheRef.current.has(cacheKey)) {
            return [meta.id, permissionCacheRef.current.get(cacheKey)!] as const;
          }

          try {
            const canEdit = await bitable.base.getPermission({
              entity: PermissionEntity.Cell,
              type: OperationType.Editable,
              param: {
                tableId: selection.tableId!,
                recordId: selection.recordId!,
                fieldId: meta.id,
              },
            } as any);
            permissionCacheRef.current.set(cacheKey, !!canEdit);
            return [meta.id, !!canEdit] as const;
          } catch {
            permissionCacheRef.current.set(cacheKey, false);
            return [meta.id, false] as const;
          }
        })
      );
      const nextEditableFieldMap = Object.fromEntries(editableEntries);
      setEditableFieldMap(nextEditableFieldMap);

      const fieldDataList: IFieldRenderData[] = metaList
        .filter((f: IFieldMeta) => f.id !== primaryField?.id)
        .map((meta: IFieldMeta) => {
          const cacheMeta = translationCacheFieldMap[meta.id];
          return {
            fieldId: meta.id,
            fieldName: meta.name,
            fieldType: meta.type as FieldType,
            value: record.fields[meta.id],
            translationCacheText: cacheMeta ? getTextFromCellValue(record.fields[cacheMeta.id]) : '',
            translationCacheFieldName: cacheMeta?.name,
            meta,
            tableId: selection.tableId!,
            recordId: selection.recordId!,
            isEditable: nextEditableFieldMap[meta.id],
          };
        });

      setRecordTitle(title);
      setFields(fieldDataList);
      hasLoadedRecordRef.current = true;
      setLoading(false);
      // #region debug-point C:load-record-finished
      dbgApp('C', 'loadRecord applied to plugin state', { tableId: selection.tableId, viewId: selection.viewId, recordId: selection.recordId, title, fieldCount: fieldDataList.length });
      // #endregion
    } catch (err: any) {
      setError(err?.message || '加载失败');
      setLoading(false);
      // #region debug-point C:load-record-error
      dbgApp('C', 'loadRecord failed', { message: err?.message || String(err) });
      // #endregion
    }
  }, []);

  const queueSilentRefresh = useCallback((delay = 80) => {
    if (refreshTimerRef.current != null) {
      window.clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = window.setTimeout(async () => {
      refreshTimerRef.current = null;
      const selection = await bitable.base.getSelection();
      if (!selection.tableId || !selection.recordId) {
        return;
      }
      loadRecord(selection, { silent: true });
    }, delay);
  }, [loadRecord]);

  useEffect(() => {
    loadRecord();

    const offSelectionChange = bitable.base.onSelectionChange(async () => {
      // #region debug-point C:selection-change-event
      dbgApp('C', 'bitable selection change event fired');
      // #endregion
      const selection = await bitable.base.getSelection();
      if (!selection.tableId || !selection.recordId) {
        // #region debug-point C:selection-change-ignored
        dbgApp('C', 'selection change ignored because recordId is empty', { selection });
        // #endregion
        return;
      }
      loadRecord(selection);
    });

    return () => {
      offSelectionChange?.();
    };
  }, [loadRecord]);

  useEffect(() => {
    if (!tableId) return;

    let disposed = false;
    let offFieldAdd: (() => void) | undefined;
    let offFieldModify: (() => void) | undefined;
    let offFieldDelete: (() => void) | undefined;
    let offTableAdd: (() => void) | undefined;
    let offTableDelete: (() => void) | undefined;
    let offRecordModify: (() => void) | undefined;
    let offDataChange: (() => void) | undefined;

    const handleRefresh = () => {
      if (disposed) return;
      queueSilentRefresh();
    };

    const bindListeners = async () => {
      const table = await bitable.base.getTableById(tableId);
      if (disposed) return;

      offFieldAdd = table.onFieldAdd(handleRefresh);
      offFieldModify = table.onFieldModify(handleRefresh);
      offFieldDelete = table.onFieldDelete(handleRefresh);
      offTableAdd = bitable.base.onTableAdd(handleRefresh);
      offTableDelete = bitable.base.onTableDelete(handleRefresh);
      offRecordModify = table.onRecordModify(handleRefresh);
      // SDK 暂无 direct onViewAdd/onViewModify/onViewDelete/onCellChange，统一由数据变化事件兜底刷新。
      offDataChange = bitable.bridge.onDataChange(handleRefresh);
    };

    bindListeners().catch(() => {
      // 监听失败不阻断主流程，保留已有 selection 监听能力。
    });

    return () => {
      disposed = true;
      offFieldAdd?.();
      offFieldModify?.();
      offFieldDelete?.();
      offTableAdd?.();
      offTableDelete?.();
      offRecordModify?.();
      offDataChange?.();
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [queueSilentRefresh, tableId]);

  const openRecordInsidePlugin = useCallback(async (nextRecordId: string) => {
    if (!tableId || !nextRecordId) return;
    await loadRecord({ tableId, viewId, recordId: nextRecordId });
  }, [loadRecord, tableId, viewId]);

  const orderedFields = useMemo(() => {
    if (!currentView || fields.length === 0) return fields;
    const fieldMap = new Map(fields.map((f) => [f.fieldId, f]));
    return currentView.fieldsOrder
      .map((id) => fieldMap.get(id))
      .filter((f) => !!f) as IFieldRenderData[];
  }, [currentView, fields]);

  const visibleFields = useMemo(() => {
    if (!currentView) return orderedFields;
    return orderedFields.filter(
      (f) => !currentView.hiddenFields.includes(f.fieldId)
    );
  }, [orderedFields, currentView]);

  const isSpeedView = currentView?.viewType === 'speed';
  const isAuditView = currentView?.viewType === 'audit';
  const isCompareView = currentView?.viewType === 'compare';
  const isReviewerAggregateView = currentView?.viewType === 'reviewerAggregate';
  const isQcAggregateView = currentView?.viewType === 'qcAggregate';
  const layoutMode = getViewLayoutMode(currentView);
  const viewDescription = getViewDescription(currentView);
  const viewLayoutLabel = getViewLayoutLabel(layoutMode);

  const responseFieldIds = useMemo(() => {
    return currentView?.settings?.responseFields || [];
  }, [currentView]);
  const translatableFieldIds = useMemo(() => {
    const configured = currentView?.settings?.translationFieldIds;
    return Array.isArray(configured) && configured.length > 0
      ? configured
      : identifyTranslatableFields(fieldMetaList);
  }, [currentView, fieldMetaList]);
  const feedbackFieldIds = useMemo(() => {
    const configured = currentView?.settings?.feedbackFieldIds;
    return Array.isArray(configured) && configured.length > 0
      ? configured
      : identifyFeedbackFields(fieldMetaList);
  }, [currentView, fieldMetaList]);
  const enableRichRender = currentView?.settings?.enableRichRender !== false;
  const hiddenFields = useMemo(() => {
    if (!currentView) return [];
    const visibleSet = new Set(visibleFields.map((field) => field.fieldId));
    return orderedFields.filter((field) => !visibleSet.has(field.fieldId));
  }, [currentView, orderedFields, visibleFields]);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    setLayoutEditMode(false);
    setSavePresetDialogOpen(false);
    setPresetDraftName('');
    layoutEditSnapshotRef.current = null;
  }, [currentViewId]);

  const beginLayoutEdit = useCallback(() => {
    if (!currentView) return;
    setSavePresetDialogOpen(false);
    layoutEditSnapshotRef.current = buildLayoutEditSnapshot(currentView);
    setLayoutEditMode(true);
  }, [currentView]);

  const closeSavePresetDialog = useCallback(() => {
    setSavePresetDialogOpen(false);
    setPresetDraftName('');
  }, []);

  const finishLayoutEdit = useCallback(() => {
    const before = layoutEditSnapshotRef.current;
    const after = buildLayoutEditSnapshot(currentView);
    setLayoutEditMode(false);
    layoutEditSnapshotRef.current = null;

    if (!hasLayoutEditChanges(before, after) || !currentView) {
      closeSavePresetDialog();
      return;
    }

    setPresetDraftName(`${currentView.viewName}-自定义`);
    setSavePresetDialogOpen(true);
  }, [closeSavePresetDialog, currentView]);

  const saveCurrentLayoutAsPreset = useCallback(() => {
    if (!currentView || !presetDraftName.trim()) return;
    saveAsNewView(presetDraftName.trim(), currentView.fieldsOrder, currentView.hiddenFields);
    closeSavePresetDialog();
  }, [closeSavePresetDialog, currentView, presetDraftName, saveAsNewView]);

  useEffect(() => {
    if (!tableId || !recordId || fieldMetaList.length === 0) return;

    const prefetchMetas = getPrefetchFieldMetas(fieldMetaList);
    if (prefetchMetas.length === 0) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      const run = async () => {
        if (cancelled) return;
        try {
          const canUseFeishu = await hasFeishuTranslationProvider();
          if (!canUseFeishu || cancelled) return;

          const table = await bitable.base.getTableById(tableId);
          const config = loadConfig();
          const cache = prefetchRecordsCacheRef.current;
          const records =
            cache && cache.tableId === tableId && Date.now() - cache.loadedAt < 2 * 60 * 1000
              ? cache.records
              : await (async () => {
                  const response = await table.getRecords({ pageSize: 500 });
                  const nextRecords = (((response as any)?.records || []) as any[]).map((item) => ({
                    recordId: item.recordId || item.id,
                    fields: item.fields || {},
                  }));
                  prefetchRecordsCacheRef.current = {
                    tableId,
                    loadedAt: Date.now(),
                    records: nextRecords,
                  };
                  return nextRecords;
                })();

          if (cancelled || records.length === 0) return;

          const currentIndexInRecords = records.findIndex((record) => record.recordId === recordId);
          const orderedRecords =
            currentIndexInRecords >= 0
              ? [...records.slice(currentIndexInRecords + 1), ...records.slice(0, currentIndexInRecords)]
              : records.filter((record) => record.recordId !== recordId);
          const pendingRecords = orderedRecords
            .filter((record) => record.recordId !== recordId)
            .filter((record) => isPendingForDashboard(record.fields, config))
            .slice(0, 5);

          const promptIdMeta = fieldMetaList.find((meta) => normalizeFieldName(meta.name) === 'promptid');
          const items = pendingRecords.flatMap((record) => {
            const sourceLang = detectPromptLanguageFromText(getTextFromCellValue(promptIdMeta ? record.fields[promptIdMeta.id] : ''));
            return prefetchMetas
              .map((meta) => ({
                text: getTextFromCellValue(record.fields[meta.id]),
                sourceLang,
                targetLang: 'zh-CN',
                cacheScope: 'field',
              }))
              .filter((item) => item.text.trim() && item.sourceLang && item.sourceLang !== item.targetLang);
          });

          const runKey = `${tableId}:${recordId}:${items.length}:${pendingRecords.map((record) => record.recordId).join(',')}`;
          if (!items.length || prefetchRunKeyRef.current === runKey) return;
          prefetchRunKeyRef.current = runKey;
          await prefetchTranslations(items.slice(0, 18));
        } catch {
          // Background cache warmup should stay invisible to active work.
        }
      };

      const idle = (window as any).requestIdleCallback;
      if (typeof idle === 'function') {
        idle(run, { timeout: 2500 });
      } else {
        run();
      }
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tableId, recordId, fieldMetaList]);

  useHotkeys('j', () => {
    goToNextRecord();
  }, {
    enableOnFormTags: false,
  });

  useHotkeys('k', () => {
    goToPrevRecord();
  }, {
    enableOnFormTags: false,
  });

  useHotkeys('p', () => {
    setStatus('Pass');
  }, {
    enableOnFormTags: false,
  });

  useHotkeys('f', () => {
    setStatus('Fail');
  }, {
    enableOnFormTags: false,
  });

  useHotkeys('space', (e) => {
    e.preventDefault();
    setStatus('暂停');
  }, {
    enableOnFormTags: false,
  });

  useHotkeys('1, 2, 3', (e, handler) => {
    if (isCompareView) {
      const key = handler.keys?.[0];
      if (key) {
        const idx = parseInt(key, 10) - 1;
        markBestResponse(idx);
      }
    }
  }, {
    enableOnFormTags: false,
  });

  useHotkeys('mod+1', () => switchViewByIndex(0), { enableOnFormTags: false });
  useHotkeys('mod+2', () => switchViewByIndex(1), { enableOnFormTags: false });
  useHotkeys('mod+3', () => switchViewByIndex(2), { enableOnFormTags: false });
  useHotkeys('mod+4', () => switchViewByIndex(3), { enableOnFormTags: false });
  useHotkeys('mod+5', () => switchViewByIndex(4), { enableOnFormTags: false });

  useHotkeys('?', () => {
    setHelpOpen((prev) => !prev);
  }, {
    enableOnFormTags: ['INPUT', 'TEXTAREA'],
  });

  const renderFieldList = () => {
    if (layoutEditMode && currentView) {
      const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = currentView.fieldsOrder.indexOf(String(active.id));
        const newIndex = currentView.fieldsOrder.indexOf(String(over.id));
        if (oldIndex !== -1 && newIndex !== -1) {
          moveField(oldIndex, newIndex);
        }
      };

      return (
        <div className="layout-editor-mode">
          <div className="layout-editor-toolbar">
            <div className="layout-editor-tip">拖动当前可见卡片即可调整顺序；也可以直接关闭、开启翻译或恢复隐藏字段。</div>
            <div className="layout-editor-actions">
              <button
                className={`layout-toggle-btn ${enableRichRender ? 'active' : ''}`}
                onClick={() => updateCurrentViewSettings({ enableRichRender: !enableRichRender })}
              >
                {enableRichRender ? '已开渲染' : '纯文本'}
              </button>
              <button className="layout-toggle-btn active" onClick={finishLayoutEdit}>
                完成编辑
              </button>
            </div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleFields.map((field) => field.fieldId)} strategy={verticalListSortingStrategy}>
              <div className={`field-list layout-${layoutMode} layout-edit-grid`}>
                {visibleFields.map((field) => (
                  <SortableFieldCard
                    key={field.fieldId}
                    field={field}
                    editable={editableFieldMap[field.fieldId]}
                    renderTag={getFieldTypeLabel(field.fieldType)}
                    translateEnabled={translatableFieldIds.includes(field.fieldId)}
                    richRenderEnabled={enableRichRender}
                    onToggleVisibility={() => toggleFieldVisibility(field.fieldId)}
                    onToggleTranslate={() => {
                      const next = translatableFieldIds.includes(field.fieldId)
                        ? translatableFieldIds.filter((id) => id !== field.fieldId)
                        : [...translatableFieldIds, field.fieldId];
                      updateCurrentViewSettings({ translationFieldIds: next });
                    }}
                  >
                    <FieldRenderer
                      data={field}
                      showTranslate={translatableFieldIds.includes(field.fieldId)}
                      enableRichRender={enableRichRender}
                      showFeedbackAssistant={feedbackFieldIds.includes(field.fieldId)}
                      onValueSaved={() => loadRecord({ tableId, viewId, recordId }, { silent: true })}
                    />
                  </SortableFieldCard>
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {hiddenFields.length > 0 && (
            <div className="hidden-fields-panel">
              <div className="view-editor-subtitle">已隐藏字段</div>
              <div className="hidden-fields-list">
                {hiddenFields.map((field) => (
                  <button
                    key={field.fieldId}
                    className="hidden-field-chip"
                    onClick={() => toggleFieldVisibility(field.fieldId)}
                  >
                    + {field.fieldName}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (isCompareView) {
      return (
        <CompareView
          fields={orderedFields}
          responseFieldIds={responseFieldIds}
          hiddenFields={currentView?.hiddenFields || []}
          translatableFieldIds={translatableFieldIds}
          feedbackFieldIds={feedbackFieldIds}
          enableRichRender={enableRichRender}
          onValueSaved={() => loadRecord({ tableId, viewId, recordId }, { silent: true })}
        />
      );
    }

    if (isReviewerAggregateView || isQcAggregateView) {
      return (
        <PromptAggregateView
          mode={isQcAggregateView ? 'qc' : 'reviewer'}
          tableId={tableId}
          recordId={recordId}
          recordFields={recordFields}
          fields={orderedFields}
          fieldMetaList={fieldMetaList}
          allFieldMetaList={allFieldMetaList}
          editableFieldMap={editableFieldMap}
          translatableFieldIds={translatableFieldIds}
          enableRichRender={enableRichRender}
          onValueSaved={() => loadRecord({ tableId, viewId, recordId }, { silent: true })}
        />
      );
    }

    return (
      <div className={`field-list ${isSpeedView ? 'speed-view' : ''} layout-${layoutMode}`}>
        {visibleFields.map((field, idx) => {
          const isHighlighted =
            isAuditView && isQCField(field.fieldName);
          const isDimmed =
            isAuditView && !isQCField(field.fieldName);

          return (
            <div
              key={field.fieldId}
              className={`field-section ${isHighlighted ? 'highlighted' : ''} ${isDimmed ? 'dimmed' : ''}`}
            >
              <div className="field-header">
                <span className="field-name">{field.fieldName}</span>
                <div className="field-header-actions">
                  <span className={`field-permission-tag ${editableFieldMap[field.fieldId] ? 'editable' : 'readonly'}`}>
                    {editableFieldMap[field.fieldId] ? '可编辑' : '只读'}
                  </span>
                  <span className="field-type-tag">
                    {getFieldTypeLabel(field.fieldType)}
                  </span>
                </div>
              </div>
              <div className="field-content">
                <FieldRenderer
                  data={field}
                  showTranslate={translatableFieldIds.includes(field.fieldId)}
                  enableRichRender={enableRichRender}
                  showFeedbackAssistant={feedbackFieldIds.includes(field.fieldId)}
                  onValueSaved={() => loadRecord({ tableId, viewId, recordId }, { silent: true })}
                />
              </div>
              {idx < visibleFields.length - 1 && (
                <div className="field-divider" />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <main className={`main theme-${themeMode}`}>
      <header className="header">
        <div className="app-title">LightFlow · 标注工作台</div>
        <ViewTabs
          views={views}
          currentViewId={currentViewId}
          onSwitchView={switchView}
          onOpenEditor={() => setEditorOpen(true)}
        />
        {!!currentView && (
          <div className="view-meta-card">
            <div className="view-meta-topline">
              <span className="view-meta-name">{currentView.viewName}</span>
              <span className="view-meta-layout">{viewLayoutLabel}</span>
            </div>
            <div className="view-meta-description">{viewDescription}</div>
            <div className="view-meta-actions">
              <button className="layout-toggle-btn" onClick={() => (layoutEditMode ? finishLayoutEdit() : beginLayoutEdit())}>
                {layoutEditMode ? '完成布局编辑' : '编辑布局'}
              </button>
              <button
                className={`layout-toggle-btn ${enableRichRender ? 'active' : ''}`}
                onClick={() => updateCurrentViewSettings({ enableRichRender: !enableRichRender })}
              >
                {enableRichRender ? 'Markdown/LaTeX 已开' : 'Markdown/LaTeX 已关'}
              </button>
            </div>
          </div>
        )}
        {!loading && !error && recordTitle && (
          <div className="record-meta">
            <h1 className="record-title">{recordTitle}</h1>
            <span className="field-count">{fields.length} 个字段</span>
          </div>
        )}
      </header>

      {!loading && !error && tableId && (
        <Dashboard onOpenRecord={openRecordInsidePlugin} currentRecordId={recordId} />
      )}

      {loading && <div className="status">加载中...</div>}
      {error && <div className="status error">{error}</div>}

      {!loading && !error && visibleFields.length > 0 && (
        <div className="field-list-container">
          {renderFieldList()}
        </div>
      )}

      {!loading && !error && visibleFields.length === 0 && (
        <div className="status">当前视图没有可见字段</div>
      )}

      <button
        className="keyboard-hint-badge"
        onClick={() => setHelpOpen(true)}
        title="查看快捷键"
      >
        ⌨️ 按 ? 看快捷键
      </button>

      <ViewEditor
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        currentView={currentView}
        fields={fields}
        onResetToDefault={resetToDefault}
        onDeleteView={deleteView}
        onUpdateViewSettings={updateCurrentViewSettings}
      />

      {savePresetDialogOpen && (
        <div className="view-editor-overlay" onClick={closeSavePresetDialog}>
          <div className="view-save-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="view-save-dialog-title">保存新的预设？</div>
            <div className="view-save-dialog-text">
              当前改动已经保存在本地当前视图，切换记录不会重置。是否额外保存成一个新的预设，方便以后直接切换？
            </div>
            <input
              type="text"
              className="new-view-input"
              value={presetDraftName}
              onChange={(event) => setPresetDraftName(event.target.value)}
              placeholder="输入新预设名称"
              autoFocus
            />
            <div className="view-save-dialog-actions">
              <button className="btn btn-secondary" onClick={closeSavePresetDialog}>
                仅保留当前修改
              </button>
              <button className="btn btn-secondary" onClick={beginLayoutEdit}>
                继续编辑
              </button>
              <button className="btn btn-primary" onClick={saveCurrentLayoutAsPreset} disabled={!presetDraftName.trim()}>
                保存为新预设
              </button>
            </div>
          </div>
        </div>
      )}

      <KeyboardHelp
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
      />

      {!loading && !error && <AIProbePanel />}
    </main>
  );
}

function getFieldTypeLabel(type: FieldType): string {
  const map: Partial<Record<FieldType, string>> = {
    [FieldType.Text]: '文本',
    [FieldType.Number]: '数字',
    [FieldType.SingleSelect]: '单选',
    [FieldType.MultiSelect]: '多选',
    [FieldType.DateTime]: '日期',
    [FieldType.Checkbox]: '复选框',
    [FieldType.User]: '人员',
    [FieldType.Phone]: '电话',
    [FieldType.Url]: '链接',
    [FieldType.Attachment]: '附件',
    [FieldType.SingleLink]: '单向关联',
    [FieldType.Lookup]: '查找引用',
    [FieldType.Formula]: '公式',
    [FieldType.DuplexLink]: '双向关联',
    [FieldType.Location]: '地理位置',
    [FieldType.CreatedTime]: '创建时间',
    [FieldType.ModifiedTime]: '修改时间',
    [FieldType.CreatedUser]: '创建人',
    [FieldType.ModifiedUser]: '修改人',
    [FieldType.AutoNumber]: '自动编号',
    [FieldType.Progress]: '进度',
    [FieldType.Currency]: '货币',
    [FieldType.Rating]: '评分',
    [FieldType.Email]: '邮箱',
  };
  return map[type] || `类型 ${type}`;
}

function SortableFieldCard({
  field,
  editable,
  renderTag,
  translateEnabled,
  richRenderEnabled,
  onToggleVisibility,
  onToggleTranslate,
  children,
}: {
  field: IFieldRenderData;
  editable: boolean;
  renderTag: string;
  translateEnabled: boolean;
  richRenderEnabled: boolean;
  onToggleVisibility: () => void;
  onToggleTranslate: () => void;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.fieldId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.75 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="field-section layout-edit-card">
      <div className="field-header">
        <div className="layout-edit-card-title">
          <button className="layout-drag-handle" {...attributes} {...listeners} title="拖动排序">
            ⋮⋮
          </button>
          <span className="field-name">{field.fieldName}</span>
        </div>
        <div className="field-header-actions">
          <span className={`field-permission-tag ${editable ? 'editable' : 'readonly'}`}>
            {editable ? '可编辑' : '只读'}
          </span>
          <span className="field-type-tag">{renderTag}</span>
        </div>
      </div>
      <div className="layout-edit-card-tools">
        <button className={`mini-toggle-btn ${translateEnabled ? 'active' : ''}`} onClick={onToggleTranslate}>
          {translateEnabled ? '翻译开' : '翻译关'}
        </button>
        <span className={`mini-toggle-btn static ${richRenderEnabled ? 'active' : ''}`}>
          {richRenderEnabled ? '富文本渲染' : '纯文本'}
        </span>
        <button className="mini-toggle-btn danger" onClick={onToggleVisibility}>
          隐藏
        </button>
      </div>
      <div className="field-content">{children}</div>
    </div>
  );
}
