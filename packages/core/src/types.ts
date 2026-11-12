/**
 * Lark Base (Bitable) Field Type Codes
 */
export enum LarkFieldType {
  Text = 1,
  Number = 2,
  SingleSelect = 3,
  MultiSelect = 4,
  DateTime = 5,
  Checkbox = 7,
  User = 11,
  Phone = 13,
  Url = 15,
  Attachment = 17,
  SingleLink = 18,
  Lookup = 19,
  Formula = 20,
  DuplexLink = 21,
  WorkflowStage = 24,
  CreatedAt = 1001,
  AutoNumber = 1005
}

export interface FieldOption {
  id: string;
  name: string;
  color?: number;
  type?: string;
  [key: string]: unknown;
}

export interface LarkFieldProperty {
  options?: FieldOption[];
  tableId?: string;
  viewId?: string;
  baseId?: string;
  multiple?: boolean;
  backFieldId?: string;
  backFieldName?: string;
  formula?: string;
  formatter?: string;
  currencyCode?: string;
  dateFormat?: string;
  timeFormat?: string;
  filterInfo?: {
    targetTable?: string;
    conditions?: {
      conjunction?: string;
      children?: Array<{
        fieldId: string;
        fieldType: number;
        operator: string;
        matchValue?: { value: unknown; valueType?: number };
      }>;
    };
  };
  targetField?: string;
  rollup?: number;
  [key: string]: unknown;
}

export interface LarkField {
  id: string;
  name: string;
  type: number;
  typeName: string;
  property?: LarkFieldProperty;
  formula?: string;
  readableFormula?: string;
  linkTableId?: string;
  lookup?: {
    targetTableId?: string;
    targetFieldId?: string;
    rollup?: number;
    rawFormula?: string;
    readableFormula?: string;
  };
  options?: FieldOption[];
}

export interface LarkRecord {
  id: string;
  cells: Record<string, unknown>;
  createdAt?: number;
  modifiedAt?: number;
}

export interface LarkView {
  id: string;
  name: string;
  type: number | string;
  property?: Record<string, unknown>;
}

export interface LarkTable {
  id: string;
  name: string;
  primaryKey?: string;
  fields: LarkField[];
  views: LarkView[];
  records: LarkRecord[];
  recordCount: number;
}

export interface LarkBaseMeta {
  id: string | number;
  name: string;
  [key: string]: unknown;
}

export interface LarkAutomationTrigger {
  name: string;
  type?: string;
  params?: Record<string, unknown>;
}

export interface LarkAutomation {
  id: string | number;
  name: string;
  triggerName?: string;
  status: number;
  createdTime?: number;
  updatedTime?: number;
  raw?: Record<string, unknown>;
}

export interface LarkDashboard {
  id: string | number;
  name: string;
  raw?: Record<string, unknown>;
}

export interface LarkRole {
  id: string | number;
  name: string;
  raw?: Record<string, unknown>;
}

export interface LarkBaseResult {
  base: LarkBaseMeta;
  tables: LarkTable[];
  automations: LarkAutomation[];
  dashboards: LarkDashboard[];
  roles: LarkRole[];
}

export interface ParseOptions {
  includeRecords?: boolean;
  tableIds?: string[];
  anonymize?: boolean;
}
