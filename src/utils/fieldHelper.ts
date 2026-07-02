export interface INormalizedField {
  id: string;
  name: string;
  type: number;
  typeName: string;
  raw: any;
}

const PERSON_FIELD_TYPES = new Set([11, 100, 300, 301, 1005, 1006]);
const TEXT_FIELD_TYPES = new Set([1, 15]);

const FIELD_TYPE_MAP: Record<number, string> = {
  1: '文本',
  2: '数字',
  3: '单选',
  4: '多选',
  5: '日期',
  7: '链接',
  11: '人员',
  13: '电话',
  14: '地址',
  15: '消息',
  17: '附件',
  18: '双向关联',
  19: '查找引用',
  20: '公式',
  21: '关联',
  100: '人员',
  300: '多人',
  301: '人员',
  1001: '创建时间',
  1002: '最后更新时间',
  1003: '创建人',
  1004: '修改人',
  1005: '人员',
  1006: '人员',
  2000: '地理位置',
  2001: '群组',
  2002: '部门',
};

function getFieldType(field: any): number {
  if (typeof field.type === 'number') return field.type;
  if (typeof field.field_type === 'number') return field.field_type;
  if (field._field?.type !== undefined) return field._field.type;
  const meta = field._meta || field.meta;
  if (meta?.type !== undefined) return meta.type;
  return 0;
}

function getFieldId(field: any): string {
  if (typeof field.id === 'string' && field.id) return field.id;
  if (typeof field.field_id === 'string' && field.field_id) return field.field_id;
  if (field._field?.id) return field._field.id;
  const meta = field._meta || field.meta;
  if (meta?.id) return meta.id;
  return '';
}

function getFieldName(field: any): string {
  if (typeof field.name === 'string' && field.name) return field.name;
  if (typeof field.field_name === 'string' && field.field_name) return field.field_name;
  if (field._field?.name) return field._field.name;
  const meta = field._meta || field.meta;
  if (meta?.name) return meta.name;
  return '未知字段';
}

export function getTypeName(type: number): string {
  return FIELD_TYPE_MAP[type] || `类型${type}`;
}

export function normalizeField(field: any): INormalizedField {
  const type = getFieldType(field);
  const id = getFieldId(field);
  const name = getFieldName(field);
  return {
    id,
    name,
    type,
    typeName: getTypeName(type),
    raw: field,
  };
}

export function isPersonFieldType(type: number): boolean {
  return PERSON_FIELD_TYPES.has(type) || type === 1003 || type === 1004;
}

export function isPersonFieldByName(name: string): boolean {
  const n = (name || '').toLowerCase();
  return /(^|[_\s])name$|员|者|负责人|分配|assigned|owner|assignee|reviewer|contributor|mention|@/.test(n);
}

export function isPersonField(field: INormalizedField): boolean {
  if (isPersonFieldType(field.type)) return true;
  return isPersonFieldByName(field.name);
}

export function isCreatedOrUpdatedField(name: string): boolean {
  const n = (name || '').toLowerCase();
  return /created|updated|modified|创建|修改|更新/.test(n);
}

export function shouldAutoCheckPerson(field: INormalizedField): boolean {
  if (!isPersonField(field)) return false;
  if (isCreatedOrUpdatedField(field.name)) return false;
  return true;
}

export function isDoneFieldByName(name: string): boolean {
  const n = (name || '').toLowerCase();
  return /status|状态|done|完成|finish|评|分|score|rating|comment|意见|备注|notes|review|result|结果|qc|质检/.test(n);
}

export function isDoneFieldCandidate(field: INormalizedField): boolean {
  if (isPersonField(field)) return false;
  if (field.type === 17) return false;
  return isDoneFieldByName(field.name);
}

export function isAssignToMeTextFieldByName(name: string): boolean {
  const n = (name || '').toLowerCase();
  return /(owner|ownerid|assignee|assigned|分配|负责|处理人|处理|跟进|归属|所属)/.test(n);
}

export function isTextFieldType(type: number): boolean {
  return TEXT_FIELD_TYPES.has(type);
}

export function getFieldIcon(type: number): string {
  const map: Record<number, string> = {
    1: '📝', 2: '🔢', 3: '☑️', 4: '☑️', 5: '📅',
    7: '🔗', 11: '👤', 13: '📞', 14: '📍', 15: '💬',
    17: '📎', 100: '👤', 300: '👥', 301: '👤',
    1001: '🕐', 1002: '🕐', 1003: '👤', 1004: '👤',
    1005: '👤', 1006: '👤',
    18: '🔗', 19: '🔍', 20: '🧮', 21: '🔗',
  };
  return map[type] || '📌';
}

export const SINGLE_SELECT_TYPE = 3;
export const MULTI_SELECT_TYPE = 4;

export function isSingleSelectField(type: number): boolean {
  return type === SINGLE_SELECT_TYPE;
}

export function isMultiSelectField(type: number): boolean {
  return type === MULTI_SELECT_TYPE;
}

export function isSelectField(type: number): boolean {
  return isSingleSelectField(type) || isMultiSelectField(type);
}

export function extractOptionsFromMeta(meta: any): string[] {
  if (!meta) return [];
  if (Array.isArray(meta.options)) {
    return meta.options.map((o: any) => o.name || o.text || String(o)).filter(Boolean);
  }
  if (Array.isArray(meta.property?.options)) {
    return meta.property.options.map((o: any) => o.name || o.text || String(o)).filter(Boolean);
  }
  if (meta.property?.optionList) {
    const ol = meta.property.optionList;
    if (Array.isArray(ol)) {
      return ol.map((o: any) => o.name || o.text || String(o)).filter(Boolean);
    }
  }
  if (Array.isArray(meta.choices)) {
    return meta.choices.map((o: any) => o.name || o.text || String(o)).filter(Boolean);
  }
  return [];
}

export async function getFieldOptions(fieldObj: any): Promise<string[]> {
  try {
    const meta = await fieldObj.getMeta?.();
    if (meta) {
      const opts = extractOptionsFromMeta(meta);
      if (opts.length > 0) return opts;
    }
    if (fieldObj.options) return extractOptionsFromMeta({ options: fieldObj.options });
    if (fieldObj.property?.options) return extractOptionsFromMeta({ property: fieldObj.property });
  } catch {}
  return [];
}

export async function fetchAndNormalizeFields(getFieldListFn: () => Promise<any[]>): Promise<INormalizedField[]> {
  try {
    const rawFields = await getFieldListFn();
    const fields = await Promise.all(
      (rawFields || []).map(async (f: any) => {
        try {
          const meta = await f.getMeta?.();
          if (meta) {
            return normalizeField({ ...f, ...meta, _rawMeta: meta });
          }
        } catch {}
        return normalizeField(f);
      })
    );
    console.log('📋 表里所有字段', fields.map(f => ({ id: f.id, name: f.name, type: f.type, typeName: f.typeName })));
    return fields.filter((f: INormalizedField) => f.id && f.name);
  } catch (e) {
    console.error('fetchAndNormalizeFields error:', e);
    return [];
  }
}
