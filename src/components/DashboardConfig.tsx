import { useState, useEffect } from 'react';
import { bitable } from '@lark-base-open/js-sdk';
import {
  fetchAndNormalizeFields,
  isPersonField,
  shouldAutoCheckPerson,
  isDoneFieldCandidate,
  isAssignToMeTextFieldByName,
  isTextFieldType,
  isSelectField,
  isSingleSelectField,
  isMultiSelectField,
  getFieldIcon,
  getFieldOptions,
  type INormalizedField,
} from '../utils/fieldHelper';
import './DashboardConfig.css';

export interface MyFieldCondition {
  fieldId: string;
  type: 'contains_me' | 'equals_value';
  value: string;
}

export interface DashboardConfig {
  myConditions: MyFieldCondition[];
  doneFieldId: string;
  doneMode: 'not_empty' | 'equals';
  doneValue: string;
  myselfId: string;
  myselfName: string;
}

const STORAGE_KEY = 'lightflow_dashboard_config_v4';

const DEFAULT_CONFIG: DashboardConfig = {
  myConditions: [],
  doneFieldId: '',
  doneMode: 'not_empty',
  doneValue: '',
  myselfId: '',
  myselfName: '',
};

export function loadConfig(): DashboardConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.myConditions) && typeof parsed.doneFieldId === 'string') {
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    }
  } catch (e) {}
  return DEFAULT_CONFIG;
}

export function saveConfig(config: DashboardConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

interface Props {
  config: DashboardConfig;
  onChange: (config: DashboardConfig) => void;
  onClose: () => void;
}

function isPersonCondition(cond: MyFieldCondition): boolean {
  return cond.type === 'contains_me';
}

function isTextCondition(cond: MyFieldCondition): boolean {
  return cond.type === 'equals_value';
}

export function DashboardConfigModal({ config, onChange, onClose }: Props) {
  const [local, setLocal] = useState<DashboardConfig>(config);
  const [allFields, setAllFields] = useState<INormalizedField[]>([]);
  const [loading, setLoading] = useState(true);
  const [doneFieldOptions, setDoneFieldOptions] = useState<string[]>([]);
  const [allPersons, setAllPersons] = useState<Array<{ id: string; name: string; enName: string }>>([]);

  const doneField = allFields.find((f) => f.id === local.doneFieldId);
  const doneIsSelect = doneField ? isSelectField(doneField.type) : false;
  const doneIsMulti = doneField ? isMultiSelectField(doneField.type) : false;

  useEffect(() => {
    (async () => {
      try {
        const table = await bitable.base.getActiveTable();
        if (!table) { setLoading(false); return; }
        const fields = await fetchAndNormalizeFields(() => table.getFieldList() as Promise<any[]>);
        setAllFields(fields);

        if (config.myConditions.length === 0 && config.doneFieldId === '') {
          const recommendedPersonConditions: MyFieldCondition[] = fields
            .filter(shouldAutoCheckPerson)
            .map((f) => ({ fieldId: f.id, type: 'contains_me', value: '' }));
          const recommendedDoneField = fields.find(isDoneFieldCandidate);
          setLocal({
            ...config,
            myConditions: recommendedPersonConditions,
            doneFieldId: recommendedDoneField?.id || '',
          });
        }

        const personFieldIds = fields.filter(isPersonField).map((f) => f.id);
        if (personFieldIds.length > 0) {
          try {
            const recordsRaw: any = await table.getRecordList();
            const records: any[] = Array.isArray(recordsRaw)
              ? recordsRaw
              : recordsRaw?.records || recordsRaw?.recordList || recordsRaw?.items || [];
            const personMap = new Map<string, { id: string; name: string; enName: string }>();
            for (const record of records) {
              const recordFields = record.fields || {};
              for (const fieldId of personFieldIds) {
                const v = recordFields[fieldId];
                if (Array.isArray(v)) {
                  for (const u of v) {
                    if (u && typeof u === 'object' && u.id && !personMap.has(u.id)) {
                      personMap.set(u.id, {
                        id: u.id,
                        name: u.name || '',
                        enName: u.enName || u.en_name || '',
                      });
                    }
                  }
                }
              }
            }
            const persons = Array.from(personMap.values()).sort((a, b) =>
              (a.name || a.enName).localeCompare(b.name || b.enName)
            );
            setAllPersons(persons);
            console.log('👥 收集到的所有人员:', persons);

            if (!config.myselfId) {
              let matchedPerson: { id: string; name: string; enName: string } | null = null;
              try {
                const currentUserId = await (bitable.base as any).getUserId?.();
                console.log('👤 当前用户ID (getUserId):', currentUserId);
                if (currentUserId) {
                  matchedPerson = persons.find((p) => p.id === currentUserId) || null;
                }
              } catch (e) {
                console.warn('获取当前用户ID失败:', e);
              }

              if (!matchedPerson && persons.length === 1) {
                matchedPerson = persons[0];
              }

              if (matchedPerson) {
                setLocal((prev) => ({
                  ...prev,
                  myselfId: matchedPerson!.id,
                  myselfName: matchedPerson!.name || matchedPerson!.enName,
                }));
                console.log('✅ 自动匹配到「我」:', matchedPerson);
              }
            }
          } catch (e) {
            console.warn('收集人员列表失败:', e);
          }
        }

        setLoading(false);
      } catch (e) {
        console.error('DashboardConfig load error:', e);
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!doneField || !doneIsSelect) {
      setDoneFieldOptions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const table = await bitable.base.getActiveTable();
        if (!table || cancelled) return;
        const fieldObj = await table.getFieldById(doneField.id);
        if (cancelled || !fieldObj) return;
        const opts = await getFieldOptions(fieldObj);
        if (!cancelled) {
          setDoneFieldOptions(opts);
          console.log('🎯 完成字段选项:', doneField.name, opts);
        }
      } catch (e) {
        console.error('获取完成字段选项失败:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [local.doneFieldId]);

  const findCondition = (fieldId: string, type: MyFieldCondition['type']) =>
    local.myConditions.find((c) => c.fieldId === fieldId && c.type === type);

  const togglePersonCondition = (fieldId: string) => {
    const exists = findCondition(fieldId, 'contains_me');
    if (exists) {
      setLocal({
        ...local,
        myConditions: local.myConditions.filter(
          (c) => !(c.fieldId === fieldId && c.type === 'contains_me')
        ),
      });
    } else {
      setLocal({
        ...local,
        myConditions: [...local.myConditions, { fieldId, type: 'contains_me', value: '' }],
      });
    }
  };

  const toggleTextCondition = (fieldId: string) => {
    const exists = findCondition(fieldId, 'equals_value');
    if (exists) {
      setLocal({
        ...local,
        myConditions: local.myConditions.filter(
          (c) => !(c.fieldId === fieldId && c.type === 'equals_value')
        ),
      });
    } else {
      setLocal({
        ...local,
        myConditions: [...local.myConditions, { fieldId, type: 'equals_value', value: '' }],
      });
    }
  };

  const updateTextValue = (fieldId: string, value: string) => {
    setLocal({
      ...local,
      myConditions: local.myConditions.map((c) =>
        c.fieldId === fieldId && c.type === 'equals_value' ? { ...c, value } : c
      ),
    });
  };

  const handleSave = () => {
    const validConditions = local.myConditions.filter(
      (c) => c.type !== 'equals_value' || c.value.trim() !== ''
    );
    const finalConfig = { ...local, myConditions: validConditions };
    saveConfig(finalConfig);
    onChange(finalConfig);
    onClose();
  };

  const personFields = allFields.filter(isPersonField);
  const textFields = allFields.filter(
    (f) => isTextFieldType(f.type) && !isPersonField(f)
  );
  const otherFields = allFields.filter((f) => !isPersonField(f));

  const smartPersonFields = personFields.filter(
    (f) => shouldAutoCheckPerson(f) && !isAssignToMeTextFieldByName(f.name)
  );
  const otherPersonFields = personFields.filter(
    (f) => !shouldAutoCheckPerson(f) || isAssignToMeTextFieldByName(f.name)
  );
  const smartTextFields = textFields.filter((f) => isAssignToMeTextFieldByName(f.name));
  const otherTextFields = textFields.filter((f) => !isAssignToMeTextFieldByName(f.name));
  const smartDoneFields = otherFields.filter(isDoneFieldCandidate);
  const otherDoneFields = otherFields.filter((f) => !isDoneFieldCandidate(f));

  const doneFieldName =
    otherFields.find((f) => f.id === local.doneFieldId)?.name || '';

  const personCount = local.myConditions.filter(isPersonCondition).length;
  const textCount = local.myConditions.filter(isTextCondition).length;
  const totalMyCount = local.myConditions.length;

  const renderFieldItem = (
    f: INormalizedField,
    checked: boolean,
    onChange: () => void,
    inputType: 'checkbox' | 'radio' = 'checkbox',
    radioName?: string
  ) => (
    <label key={f.id} className={`dc-field-item ${checked ? 'checked' : ''}`}>
      <input
        type={inputType}
        name={radioName}
        checked={checked}
        onChange={onChange}
      />
      <span className="dc-field-icon">{getFieldIcon(f.type)}</span>
      <span className="dc-field-name">{f.name}</span>
      <span className="dc-field-type">{f.typeName}</span>
    </label>
  );

  return (
    <div className="dc-modal-overlay" onClick={onClose}>
      <div className="dc-modal-content dc-modal-content-v4" onClick={(e) => e.stopPropagation()}>
        <div className="dc-modal-header">
          <h3>⚙️ 仪表盘配置 v4</h3>
          <button className="dc-modal-close" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <div className="dc-modal-loading">⏳ 加载字段中…</div>
        ) : (
          <div className="dc-modal-body">
            <div className="dc-config-section">
              <h4>👤 我是谁？</h4>
              <p className="dc-config-desc">选择你自己，用于判断「分给我」的记录</p>
              {allPersons.length > 0 ? (
                <select
                  className="dc-config-select"
                  value={local.myselfId}
                  onChange={(e) => {
                    const p = allPersons.find((x) => x.id === e.target.value);
                    setLocal({
                      ...local,
                      myselfId: e.target.value,
                      myselfName: p?.name || p?.enName || '',
                    });
                  }}
                >
                  <option value="">请选择你自己</option>
                  {allPersons.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.enName} {p.name && p.enName ? `(${p.enName})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="dc-empty-hint">未检测到人员字段或人员数据</div>
              )}
            </div>

            <div className="dc-config-section">
              <h4>
                📋 哪些条件算「分给我」？
                <span className="dc-config-count">{totalMyCount} 个条件</span>
              </h4>
              <p className="dc-config-desc">满足任一条件 = 分给我</p>

              <div className="dc-config-subsection">
                <div className="dc-subsection-title">👤 人员字段含我</div>
                {smartPersonFields.length > 0 && (
                  <div className="dc-field-group">
                    <div className="dc-field-group-title">✨ 智能推荐</div>
                    <div className="dc-field-list dc-small">
                      {smartPersonFields.map((f) =>
                        renderFieldItem(
                          f,
                          !!findCondition(f.id, 'contains_me'),
                          () => togglePersonCondition(f.id)
                        )
                      )}
                    </div>
                  </div>
                )}
                {(otherPersonFields.length > 0 || smartPersonFields.length === 0) && (
                  <div className="dc-field-group">
                    <div className="dc-field-group-title">📌 其他人员字段</div>
                    <div className="dc-field-list dc-small">
                      {otherPersonFields.length === 0 ? (
                        <div className="dc-empty-hint">无</div>
                      ) : (
                        otherPersonFields.map((f) =>
                          renderFieldItem(
                            f,
                            !!findCondition(f.id, 'contains_me'),
                            () => togglePersonCondition(f.id)
                          )
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="dc-config-subsection">
                <div className="dc-subsection-title">📝 文本字段 = 某值</div>
                {smartTextFields.length > 0 && (
                  <div className="dc-field-group">
                    <div className="dc-field-group-title">✨ 智能推荐</div>
                    <div className="dc-field-list dc-small">
                      {smartTextFields.map((f) => {
                        const cond = findCondition(f.id, 'equals_value');
                        return (
                          <div key={f.id}>
                            {renderFieldItem(
                              f,
                              !!cond,
                              () => toggleTextCondition(f.id)
                            )}
                            {cond && (
                              <div className="dc-condition-row">
                                <span className="dc-condition-op">=</span>
                                <input
                                  type="text"
                                  className="dc-config-input dc-small-input"
                                  value={cond.value}
                                  onChange={(e) => updateTextValue(f.id, e.target.value)}
                                  placeholder="输入值，如：张三"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {otherTextFields.length > 0 && (
                  <div className="dc-field-group">
                    <div className="dc-field-group-title">📌 其他文本字段</div>
                    <div className="dc-field-list dc-small">
                      {otherTextFields.map((f) => {
                        const cond = findCondition(f.id, 'equals_value');
                        return (
                          <div key={f.id}>
                            {renderFieldItem(
                              f,
                              !!cond,
                              () => toggleTextCondition(f.id)
                            )}
                            {cond && (
                              <div className="dc-condition-row">
                                <span className="dc-condition-op">=</span>
                                <input
                                  type="text"
                                  className="dc-config-input dc-small-input"
                                  value={cond.value}
                                  onChange={(e) => updateTextValue(f.id, e.target.value)}
                                  placeholder="输入值，如：张三"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {textFields.length === 0 && (
                  <div className="dc-empty-hint">无文本字段</div>
                )}
              </div>
            </div>

            <div className="dc-config-section">
              <h4>🎯 哪个字段算「完成」？</h4>
              <p className="dc-config-desc">单选：该字段满足条件 = 已完成</p>

              {smartDoneFields.length > 0 && (
                <div className="dc-field-group">
                  <div className="dc-field-group-title">✨ 智能推荐</div>
                  <div className="dc-field-list dc-small">
                    {smartDoneFields.map((f) =>
                      renderFieldItem(
                        f,
                        local.doneFieldId === f.id,
                        () => setLocal({ ...local, doneFieldId: f.id }),
                        'radio',
                        'doneField'
                      )
                    )}
                  </div>
                </div>
              )}
              <div className="dc-field-group">
                <div className="dc-field-group-title">📌 其他字段</div>
                <div className="dc-field-list dc-small">
                  {otherDoneFields.length === 0 ? (
                    <div className="dc-empty-hint">无</div>
                  ) : (
                    otherDoneFields.map((f) =>
                      renderFieldItem(
                        f,
                        local.doneFieldId === f.id,
                        () => setLocal({ ...local, doneFieldId: f.id }),
                        'radio',
                        'doneField'
                      )
                    )
                  )}
                </div>
              </div>

              {local.doneFieldId && (
                <div className="dc-done-mode">
                  <label>
                    <input
                      type="radio"
                      name="doneMode"
                      value="not_empty"
                      checked={local.doneMode === 'not_empty'}
                      onChange={() => setLocal({ ...local, doneMode: 'not_empty' as const })}
                    />
                    字段不为空
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="doneMode"
                      value="equals"
                      checked={local.doneMode === 'equals'}
                      onChange={() => setLocal({ ...local, doneMode: 'equals' as const })}
                    />
                    {doneIsMulti ? '包含某选项' : doneIsSelect ? '等于某选项' : '字段 = 某值'}
                  </label>
                  {local.doneMode === 'equals' && (
                    doneIsSelect && doneFieldOptions.length > 0 ? (
                      <select
                        className="dc-config-select"
                        value={local.doneValue}
                        onChange={(e) => setLocal({ ...local, doneValue: e.target.value })}
                      >
                        <option value="">请选择{doneIsMulti ? '包含的' : ''}选项</option>
                        {doneFieldOptions.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="dc-config-input"
                        value={local.doneValue}
                        onChange={(e) => setLocal({ ...local, doneValue: e.target.value })}
                        placeholder={doneIsMulti ? '输入选项值' : '如：通过'}
                      />
                    )
                  )}
                </div>
              )}
            </div>

            {totalMyCount > 0 && local.doneFieldId && (
              <div className="dc-config-preview">
                <div className="dc-preview-title">📊 当前规则：</div>
                <div className="dc-preview-text">
                  「分给我」= {personCount} 个人员字段 + {textCount} 个文本条件<br />
                  「已完成」= 「{doneFieldName}」
                  {local.doneMode === 'not_empty' ? '不为空' : `= "${local.doneValue}"`}<br />
                  「待做」= 分给我的 − 已完成
                </div>
              </div>
            )}
          </div>
        )}

        <div className="dc-modal-footer">
          <div className="dc-flex-spacer" />
          <button className="dc-btn-secondary" onClick={onClose}>取消</button>
          <button
            className="dc-btn-primary"
            onClick={handleSave}
            disabled={loading || !local.myselfId || totalMyCount === 0 || !local.doneFieldId}
          >
            💾 保存
          </button>
        </div>
      </div>
    </div>
  );
}
