import { LarkFieldType } from './types.js';

export const LARK_FIELD_TYPE_NAMES: Record<number, string> = {
  [LarkFieldType.Text]: 'Text',
  [LarkFieldType.Number]: 'Number',
  [LarkFieldType.SingleSelect]: 'SingleSelect',
  [LarkFieldType.MultiSelect]: 'MultiSelect',
  [LarkFieldType.DateTime]: 'DateTime',
  [LarkFieldType.Checkbox]: 'Checkbox',
  [LarkFieldType.User]: 'User',
  [LarkFieldType.Phone]: 'Phone',
  [LarkFieldType.Url]: 'Url',
  [LarkFieldType.Attachment]: 'Attachment',
  [LarkFieldType.SingleLink]: 'SingleLink',
  [LarkFieldType.Lookup]: 'Lookup',
  [LarkFieldType.Formula]: 'Formula',
  [LarkFieldType.DuplexLink]: 'DuplexLink',
  [LarkFieldType.WorkflowStage]: 'WorkflowStage',
  [LarkFieldType.CreatedAt]: 'CreatedAt',
  [LarkFieldType.AutoNumber]: 'AutoNumber'
};

export function getFieldTypeName(type: number): string {
  return LARK_FIELD_TYPE_NAMES[type] || `Unknown(${type})`;
}
