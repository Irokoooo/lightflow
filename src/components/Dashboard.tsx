import React, { useState, useEffect, useCallback } from 'react';
import { bitable } from '@lark-base-open/js-sdk';
import { DashboardConfigModal, loadConfig, type DashboardConfig, type MyFieldCondition } from './DashboardConfig';

// #region debug-point D:dashboard-next
const dbgDashboard = (_hypothesisId: string, _msg: string, _data: Record<string, any> = {}) => {};
// #endregion

function formatTime(minutes: number): string {
  if (minutes < 1) return '<1分钟';
  if (minutes < 60) return `${Math.round(minutes)} 分钟`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

const fieldContainsMe = (v: any, myOpenId: string, myName: string): boolean => {
  if (!v) return false;
  if (Array.isArray(v)) {
    return v.some((u: any) => {
      if (u == null) return false;
      if (typeof u === 'object') {
        const uid = u.id || u.open_id || u.openId || u.userId || u.user_id || '';
        const uname = u.name || u.enName || u.en_name || u.nickname || u.nickName || '';
        const matchId = !!(myOpenId && (uid === myOpenId));
        const matchName = !!(myName && (uname === myName));
        return matchId || matchName;
      }
      if (typeof u === 'string') {
        return !!(myName && u.includes(myName));
      }
      return false;
    });
  }
  if (typeof v === 'string') {
    return !!(myName && v.includes(myName));
  }
  return false;
};

const fieldEqualsValue = (v: any, target: string): boolean => {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() === target;
  if (Array.isArray(v)) {
    return v.some((x: any) => {
      if (typeof x === 'string') return x === target;
      if (x && typeof x === 'object') {
        return x.text === target || x.name === target || x.value === target;
      }
      return false;
    });
  }
  if (typeof v === 'object' && v) return v.text === target || v.name === target || v.value === target;
  return String(v) === target;
};

const isNotEmpty = (v: any): boolean => {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number') return !isNaN(v);
  if (typeof v === 'object') {
    if (v.text !== undefined) return v.text !== '' && v.text != null;
    return Object.keys(v).length > 0;
  }
  return Boolean(v);
};

const matchesCondition = (
  cond: MyFieldCondition,
  v: any,
  myOpenId: string,
  myName: string
): boolean => {
  if (cond.type === 'contains_me') {
    return fieldContainsMe(v, myOpenId, myName);
  }
  if (cond.type === 'equals_value') {
    return fieldEqualsValue(v, cond.value);
  }
  return false;
};

interface DashboardProps {
  onOpenRecord?: (recordId: string) => Promise<void> | void;
  currentRecordId?: string;
}

const Dashboard: React.FC<DashboardProps> = ({ onOpenRecord, currentRecordId }) => {
  const [config, setConfig] = useState<DashboardConfig>(loadConfig);
  const [showConfig, setShowConfig] = useState(false);
  const [myCount, setMyCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [avgTimePerRecord] = useState(1.8);
  const [workerName] = useState('');
  const [workerAvatar] = useState('');
  const [doneFieldName, setDoneFieldName] = useState('');

  const getDoneFieldName = async (cfg: DashboardConfig): Promise<string> => {
    try {
      const table = await bitable.base.getActiveTable();
      if (!table || !cfg.doneFieldId) return '';
      const field = await table.getFieldById(cfg.doneFieldId);
      const meta = await (field as any).getMeta?.();
      return meta?.name || (field as any).name || '';
    } catch (e) { return ''; }
  };

  const calculate = async (cfg: DashboardConfig) => {
    try {
      const table = await bitable.base.getActiveTable();
      if (!table) { return { mine: 0, done: 0 }; }

      const myOpenId = cfg.myselfId || '';
      const myName = cfg.myselfName || '';
      if (!myOpenId && !myName) {
        return { mine: 0, done: 0 };
      }

      const allRecordsRaw: any = await table.getRecordList();
      const allRecords: any[] = Array.isArray(allRecordsRaw)
        ? allRecordsRaw
        : allRecordsRaw?.records || allRecordsRaw?.items || allRecordsRaw?.recordList || [];

      let mine = 0, done = 0;

      for (const record of (allRecords as any) || []) {
        const fields = (record as any).fields || {};
        const condResults = cfg.myConditions.map((cond) =>
          matchesCondition(cond, fields[cond.fieldId], myOpenId, myName)
        );
        const isMine = condResults.some(Boolean);

        if (isMine) {
          mine++;
          if (cfg.doneFieldId) {
            const v = fields[cfg.doneFieldId];
            let isDone = false;
            if (cfg.doneMode === 'not_empty' && isNotEmpty(v)) isDone = true;
            else if (cfg.doneMode === 'equals' && fieldEqualsValue(v, cfg.doneValue)) isDone = true;
            if (isDone) done++;
          }
        }
      }

      return { mine, done };
    } catch (e) {
      return { mine: 0, done: 0 };
    }
  };

  const recalculate = useCallback(async (cfg: DashboardConfig) => {
    const { mine, done } = await calculate(cfg);
    setMyCount(mine);
    setDoneCount(done);
    const name = await getDoneFieldName(cfg);
    setDoneFieldName(name);
  }, []);

  useEffect(() => { recalculate(config); }, [config, recalculate]);

  useEffect(() => {
    let offModify: (() => void) | null = null;
    let offAdd: (() => void) | null = null;
    let offDelete: (() => void) | null = null;

    (async () => {
      try {
        const table = await bitable.base.getActiveTable();
        if (!table) return;

        const handler = () => {
          recalculate(config);
        };

        offModify = (table as any).onRecordModify?.(handler);
        offAdd = (table as any).onRecordAdd?.(handler);
        offDelete = (table as any).onRecordDelete?.(handler);
      } catch (e) {
      }
    })();

    return () => {
      offModify?.();
      offAdd?.();
      offDelete?.();
    };
  }, [config, recalculate]);

  const handleNext = async () => {
    try {
      const table = await bitable.base.getActiveTable();
      const selection = await bitable.base.getSelection();
      const myOpenId = config.myselfId || '';
      const myName = config.myselfName || '';
      // #region debug-point D:handle-next-start
      dbgDashboard('D', 'handleNext invoked', { hasTable: !!table, selection, myOpenId, myName, pendingCount });
      // #endregion

      if (!table) return;
      if (!myOpenId && !myName) return;

      const tableId = table.id || (selection as any)?.tableId || '';

      const allRecordsRaw: any = await table.getRecordList();
      const allRecords: any[] = Array.isArray(allRecordsRaw)
        ? allRecordsRaw
        : allRecordsRaw?.records || allRecordsRaw?.items || allRecordsRaw?.recordList || [];

      let foundRecord = null;
      for (const record of allRecords) {
        const nextRecordId = record.id || record.recordId;
        const fields = record.fields || {};
        const isMine = config.myConditions.some((cond) =>
          matchesCondition(cond, fields[cond.fieldId], myOpenId, myName)
        );
        if (!isMine) continue;

        const v = config.doneFieldId ? fields[config.doneFieldId] : null;
        let isPending = true;
        if (config.doneFieldId) {
          if (config.doneMode === 'not_empty' && isNotEmpty(v)) isPending = false;
          else if (config.doneMode === 'equals' && fieldEqualsValue(v, config.doneValue)) isPending = false;
        }

        if (isPending && nextRecordId !== currentRecordId) {
          foundRecord = record;
          break;
        }
      }

      if (!foundRecord) {
        // #region debug-point D:no-target
        dbgDashboard('D', 'handleNext found no pending record', { totalRecords: allRecords.length });
        // #endregion
        return;
      }

      const recordId = foundRecord.id || foundRecord.recordId;
      // #region debug-point D:target-found
      dbgDashboard('D', 'handleNext found target record', { recordId, currentRecordId: selection?.recordId, tableId });
      // #endregion

      try {
        await onOpenRecord?.(recordId);
        // #region debug-point C:set-selection-ok
        dbgDashboard('C', 'plugin internal record switch resolved', { recordId });
        // #endregion
      } catch (e) {
        // #region debug-point C:set-selection-failed
        dbgDashboard('C', 'plugin internal record switch threw', { recordId, message: (e as any)?.message || String(e) });
        // #endregion
      }
    } catch (e) {
    }
  };

  const pendingCount = myCount - doneCount;
  const percent = myCount > 0 ? Math.round((doneCount / myCount) * 100) : 0;
  const progress = percent;
  const personCount = config.myConditions.filter((c) => c.type === 'contains_me').length;
  const textCount = config.myConditions.filter((c) => c.type === 'equals_value').length;
  const displayName = config.myselfName || '未设置';

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <span>📊 我的进度</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button className="config-btn" onClick={() => recalculate(config)} title="刷新">🔄</button>
          <button className="config-btn" onClick={() => setShowConfig(true)}>⚙️</button>
        </div>
      </div>

      <div className="dashboard-row">
        <div className="dashboard-item">
          <div className="progress-stats">
            <span className="progress-current">{doneCount}</span>
            <span className="progress-divider"> / </span>
            <span className="progress-total">{myCount}</span>
            <span className="progress-label"> 已完成</span>
            <span className="progress-percent">
              ({pendingCount} 待做 · {percent}%)
            </span>
          </div>
        </div>

        <div className="dashboard-item">
          <span className="dashboard-label">剩</span>
          <span className="dashboard-text">
            {formatTime(pendingCount * avgTimePerRecord)} · {avgTimePerRecord.toFixed(1)} 分钟/条
          </span>
        </div>
      </div>

      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="dashboard-row">
        <div className="dashboard-item worker-item">
          {config.myselfName ? (
            <div className="worker-avatar-placeholder">{config.myselfName.charAt(0)}</div>
          ) : null}
          <span className="worker-name">{config.myselfName || '点击⚙️设置「我是谁」'}</span>
        </div>

        <button className="btn-next-unreviewed" onClick={handleNext} disabled={pendingCount === 0}>
          下一条待做 →
        </button>
      </div>

      <div className="dashboard-config-summary">
        📋 {personCount}人 + {textCount}文 · 🎯 {doneFieldName || '未设置'} {config.doneMode === 'not_empty' ? '非空' : `= ${config.doneValue}`}
      </div>

      {showConfig && (
        <DashboardConfigModal
          config={config}
          onChange={(c) => setConfig(c)}
          onClose={() => setShowConfig(false)}
        />
      )}
    </div>
  );
};

export default Dashboard;
