import { useState, useEffect, useCallback, useRef } from 'react';
import { IFieldMeta } from '@lark-base-open/js-sdk';
import { IViewConfig } from '../types';
import {
  getInitialViews,
  mergeBuiltInViewWithSaved,
  saveViews,
  createNewView,
  reorderFields,
  generateBuiltInViews,
} from './viewUtils';

export function useViews(tableId: string | undefined, fieldMetaList: IFieldMeta[]) {
  const [views, setViews] = useState<IViewConfig[]>([]);
  const [currentViewId, setCurrentViewId] = useState<string>('reviewer-aggregate');
  const prevFieldIdsRef = useRef<string>('');

  useEffect(() => {
    if (!tableId || fieldMetaList.length === 0) return;
    
    const fieldIdsKey = fieldMetaList.map(f => f.id).join(',');
    const isNewFieldOrder = fieldIdsKey !== prevFieldIdsRef.current;
    prevFieldIdsRef.current = fieldIdsKey;

    const initialViews = getInitialViews(tableId, fieldMetaList);
    
    if (isNewFieldOrder) {
      const builtInFresh = generateBuiltInViews(fieldMetaList);
      const builtInMap = new Map(builtInFresh.map(v => [v.viewId, v]));
      
      const updated = initialViews.map(v => {
        if (v.isBuiltIn && builtInMap.has(v.viewId)) {
          const fresh = builtInMap.get(v.viewId)!;
          return mergeBuiltInViewWithSaved(fresh, v);
        }
        return v;
      });
      
      setViews(updated);
    } else {
      setViews(initialViews);
    }
  }, [tableId, fieldMetaList]);

  useEffect(() => {
    if (!tableId || views.length === 0) return;
    saveViews(tableId, views);
  }, [tableId, views]);

  useEffect(() => {
    if (views.length === 0) return;
    if (!views.some((view) => view.viewId === currentViewId)) {
      setCurrentViewId(views[0].viewId);
    }
  }, [currentViewId, views]);

  const currentView = views.find((v) => v.viewId === currentViewId) || views[0];

  const switchView = useCallback((viewId: string) => {
    setCurrentViewId(viewId);
  }, []);

  const switchViewByIndex = useCallback(
    (index: number) => {
      if (views[index]) {
        setCurrentViewId(views[index].viewId);
      }
    },
    [views]
  );

  const updateCurrentViewFields = useCallback(
    (fieldsOrder: string[], hiddenFields: string[]) => {
      setViews((prev) =>
        prev.map((v) =>
          v.viewId === currentViewId
            ? { ...v, fieldsOrder, hiddenFields }
            : v
        )
      );
    },
    [currentViewId]
  );

  const updateCurrentViewSettings = useCallback(
    (nextSettings: Record<string, any>) => {
      setViews((prev) =>
        prev.map((v) =>
          v.viewId === currentViewId
            ? {
                ...v,
                settings: {
                  ...v.settings,
                  ...nextSettings,
                },
              }
            : v
        )
      );
    },
    [currentViewId]
  );

  const saveAsNewView = useCallback(
    (name: string, fieldsOrder: string[], hiddenFields: string[]) => {
      if (!currentView) return null;
      const newView = createNewView(currentView, name, fieldsOrder, hiddenFields);
      setViews((prev) => [...prev, newView]);
      setCurrentViewId(newView.viewId);
      return newView;
    },
    [currentView]
  );

  const renameView = useCallback((viewId: string, newName: string) => {
    setViews((prev) =>
      prev.map((v) => (v.viewId === viewId ? { ...v, viewName: newName } : v))
    );
  }, []);

  const deleteView = useCallback(
    (viewId: string) => {
      setViews((prev) => {
        const targetView = prev.find((v) => v.viewId === viewId);
        if (!targetView || targetView.isBuiltIn) {
          return prev;
        }

        const filtered = prev.filter((v) => v.viewId !== viewId);
        if (currentViewId === viewId && filtered.length > 0) {
          setCurrentViewId(filtered[0].viewId);
        }
        return filtered;
      });
    },
    [currentViewId]
  );

  const moveField = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!currentView) return;
      const newOrder = reorderFields(currentView.fieldsOrder, fromIndex, toIndex);
      updateCurrentViewFields(newOrder, currentView.hiddenFields);
    },
    [currentView, updateCurrentViewFields]
  );

  const toggleFieldVisibility = useCallback(
    (fieldId: string) => {
      if (!currentView) return;
      const isHidden = currentView.hiddenFields.includes(fieldId);
      const newHidden = isHidden
        ? currentView.hiddenFields.filter((id) => id !== fieldId)
        : [...currentView.hiddenFields, fieldId];
      updateCurrentViewFields(currentView.fieldsOrder, newHidden);
    },
    [currentView, updateCurrentViewFields]
  );

  const resetToDefault = useCallback(() => {
    if (!currentView) return;

    const builtInViews = generateBuiltInViews(fieldMetaList);
    const builtInMap = new Map(builtInViews.map((view) => [view.viewId, view]));
    const baseViewId = currentView.isBuiltIn ? currentView.viewId : currentView.settings?.baseViewId;
    const baseView = typeof baseViewId === 'string' ? builtInMap.get(baseViewId) : undefined;
    if (!baseView) return;

    setViews((prev) =>
      prev.map((view) =>
        view.viewId === currentViewId
          ? {
              ...view,
              fieldsOrder: [...baseView.fieldsOrder],
              hiddenFields: [...baseView.hiddenFields],
              settings: {
                ...baseView.settings,
                ...(view.isBuiltIn ? {} : { baseViewId }),
              },
            }
          : view
      )
    );
  }, [currentView, currentViewId, fieldMetaList]);

  return {
    views,
    currentView,
    currentViewId,
    switchView,
    switchViewByIndex,
    updateCurrentViewFields,
    updateCurrentViewSettings,
    saveAsNewView,
    renameView,
    deleteView,
    moveField,
    toggleFieldVisibility,
    resetToDefault,
  };
}
