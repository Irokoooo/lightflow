import { useState, useEffect, useCallback, useRef } from 'react';
import { bitable, IFieldMeta, FieldType } from '@lark-base-open/js-sdk';
import { findStatusFieldId, findWorkerFieldId } from '../views/viewUtils';
import { IOpenUser } from '../types';

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

export function useRecords(
  tableId: string | undefined,
  recordId: string | undefined,
  fieldMetaList: IFieldMeta[]
) {
  const [recordIds, setRecordIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [recordTimes, setRecordTimes] = useState<Record<string, number>>({});
  const recordStartTimeRef = useRef<number>(Date.now());
  const [loading, setLoading] = useState(false);

  const statusFieldId = fieldMetaList.length > 0 ? findStatusFieldId(fieldMetaList) : null;
  const workerFieldId = fieldMetaList.length > 0 ? findWorkerFieldId(fieldMetaList) : null;

  const loadRecordList = useCallback(async () => {
    if (!tableId) return;
    try {
      setLoading(true);
      const table = await bitable.base.getTableById(tableId);
      const ids = await table.getRecordIdList();
      setRecordIds(ids || []);

      if (recordId) {
        const idx = (ids || []).indexOf(recordId);
        setCurrentIndex(idx);
      }
    } catch (e) {
      console.error('Failed to load record list', e);
    } finally {
      setLoading(false);
    }
  }, [tableId, recordId]);

  useEffect(() => {
    loadRecordList();
  }, [tableId]);

  useEffect(() => {
    if (recordIds.length > 0 && recordId) {
      const idx = recordIds.indexOf(recordId);
      setCurrentIndex(idx);
    }
  }, [recordIds, recordId]);

  useEffect(() => {
    recordStartTimeRef.current = Date.now();
  }, [recordId]);

  const goToNextRecord = useCallback(async () => {
    if (currentIndex < 0) return;
    const nextIndex = currentIndex + 1;
    if (nextIndex >= recordIds.length) return;

    const elapsed = Date.now() - recordStartTimeRef.current;
    if (recordId) {
      setRecordTimes((prev) => ({
        ...prev,
        [recordId]: (prev[recordId] || 0) + elapsed,
      }));
    }

    const nextRecordId = recordIds[nextIndex];
    try {
      await (bitable.base as any).setSelection?.({
        recordId: nextRecordId,
      });
    } catch (e) {
      console.warn('setSelection not available, please manually switch records', e);
    }
  }, [currentIndex, recordIds, recordId]);

  const goToPrevRecord = useCallback(async () => {
    if (currentIndex <= 0) return;
    const prevIndex = currentIndex - 1;

    const elapsed = Date.now() - recordStartTimeRef.current;
    if (recordId) {
      setRecordTimes((prev) => ({
        ...prev,
        [recordId]: (prev[recordId] || 0) + elapsed,
      }));
    }

    const prevRecordId = recordIds[prevIndex];
    try {
      await (bitable.base as any).setSelection?.({
        recordId: prevRecordId,
      });
    } catch (e) {
      console.warn('setSelection not available, please manually switch records', e);
    }
  }, [currentIndex, recordIds, recordId]);

  const goToNextUnreviewed = useCallback(async () => {
    if (!tableId || !statusFieldId) return;

    try {
      const table = await bitable.base.getTableById(tableId);
      const records = await table.getRecords({ pageSize: 200 });
      const recordList = (records as any)?.records || [];

      for (let i = 0; i < recordList.length; i++) {
        const record = recordList[i];
        const statusValue = (record as any).fields?.[statusFieldId];
        if (!statusValue || (Array.isArray(statusValue) && statusValue.length === 0)) {
          try {
            await (bitable.base as any).setSelection?.({
              recordId: (record as any).recordId || record.id,
            });
          } catch (e) {
            console.warn('setSelection not available', e);
          }
          return;
        }
        const statusText = getTextFromCellValue(statusValue);
        if (!statusText) {
          try {
            await (bitable.base as any).setSelection?.({
              recordId: (record as any).recordId || record.id,
            });
          } catch (e) {
            console.warn('setSelection not available', e);
          }
          return;
        }
      }
    } catch (e) {
      console.error('Failed to find next unreviewed', e);
    }
  }, [tableId, statusFieldId]);

  const setStatus = useCallback(
    async (status: string) => {
      if (!tableId || !recordId || !statusFieldId) return;

      try {
        const table = await bitable.base.getTableById(tableId);
        const field = await table.getField(statusFieldId);
        const fieldMeta = await field.getMeta();

        if (fieldMeta.type === FieldType.SingleSelect) {
          await table.setCellValue(statusFieldId, recordId, {
            text: status,
          } as any);
        }

        await goToNextRecord();
      } catch (e) {
        console.error('Failed to set status', e);
      }
    },
    [tableId, recordId, statusFieldId, goToNextRecord]
  );

  const markBestResponse = useCallback(
    async (index: number) => {
      console.log('Mark best response:', index);
    },
    []
  );

  const getStats = useCallback(() => {
    let completed = 0;
    const times: number[] = [];

    for (const rid of recordIds) {
      if (recordTimes[rid]) {
        times.push(recordTimes[rid]);
        completed++;
      }
    }

    const avgTime = times.length > 0
      ? times.reduce((a, b) => a + b, 0) / times.length / 60000
      : 2;

    return {
      total: recordIds.length,
      completed,
      avgTimePerRecord: avgTime,
    };
  }, [recordIds, recordTimes]);

  const getWorkerInfo = useCallback(
    (recordFields: Record<string, any>) => {
      if (!workerFieldId || !recordFields[workerFieldId]) {
        return { name: undefined, avatar: undefined };
      }

      const value = recordFields[workerFieldId];
      const users: IOpenUser[] = Array.isArray(value) ? value : [value];
      const firstUser = users[0];

      if (firstUser) {
        return {
          name: firstUser.name,
          avatar: (firstUser as any).avatar?.url,
        };
      }

      return { name: undefined, avatar: undefined };
    },
    [workerFieldId]
  );

  return {
    recordIds,
    currentIndex,
    loading,
    goToNextRecord,
    goToPrevRecord,
    goToNextUnreviewed,
    setStatus,
    markBestResponse,
    getStats,
    getWorkerInfo,
    statusFieldId,
  };
}
