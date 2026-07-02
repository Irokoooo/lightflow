import { FieldType, IFieldMeta } from '@lark-base-open/js-sdk';

export interface IOpenTextSegment {
  type: number;
  text: string;
}

export interface IOpenUrlSegment {
  type: number;
  text: string;
  link: string;
}

export interface IOpenUserMentionSegment {
  mentionType: string;
  text: string;
  token: string;
  name: string;
  enName?: string;
  id: string;
}

export interface IOpenSingleSelect {
  id: string;
  text: string;
}

export interface IOpenMultiSelect extends IOpenSingleSelect {}

export interface IOpenUser {
  id: string;
  name?: string;
  enName?: string;
  email?: string;
  avatar?: {
    url?: string;
  };
}

export interface IOpenAttachment {
  name: string;
  size: number;
  type: string;
  token: string;
  timeStamp: number;
  url?: string;
  tmp_url?: string;
  permission?: {
    tableId: string;
    recordId: string;
    fieldId: string;
  };
}

export interface IFieldRenderData {
  fieldId: string;
  fieldName: string;
  fieldType: FieldType;
  value: any;
  translationCacheText?: string;
  translationCacheFieldName?: string;
  meta: IFieldMeta;
  tableId: string;
  recordId: string;
  isEditable?: boolean;
}

export interface IRecordHeader {
  title: string;
  fieldCount: number;
}

export type ViewType = 'default' | 'compare' | 'speed' | 'audit' | 'reviewerAggregate' | 'qcAggregate' | 'custom';
export type ViewLayoutMode = 'single' | 'compact' | 'grid';

export interface IViewConfig {
  viewId: string;
  viewName: string;
  viewType: ViewType;
  fieldsOrder: string[];
  hiddenFields: string[];
  settings: Record<string, any>;
  isBuiltIn?: boolean;
}

export interface IRecordInfo {
  recordId: string;
  title: string;
  fields: Record<string, any>;
}

export interface IDashboardStats {
  total: number;
  completed: number;
  avgTimePerRecord: number;
  currentWorkerName?: string;
  currentWorkerAvatar?: string;
}
