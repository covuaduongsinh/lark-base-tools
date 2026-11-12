import { LarkFieldType, type LarkFieldProperty } from './types.js';

export function decodeCellValue(
  fieldType: number,
  rawCell: unknown,
  property?: LarkFieldProperty
): unknown {
  if (rawCell === null || rawCell === undefined) {
    return null;
  }

  // Raw cell in Lark Base can either be { value: ... } or direct value
  const val = (typeof rawCell === 'object' && rawCell !== null && 'value' in rawCell)
    ? (rawCell as { value: unknown }).value
    : rawCell;

  if (val === null || val === undefined) {
    return null;
  }

  switch (fieldType) {
    case LarkFieldType.Text: {
      if (typeof val === 'string') return val;
      if (Array.isArray(val)) {
        return val.map((segment: unknown) => {
          if (typeof segment === 'string') return segment;
          if (typeof segment === 'object' && segment !== null && 'text' in segment) {
            return String((segment as { text: unknown }).text || '');
          }
          return '';
        }).join('');
      }
      return String(val);
    }

    case LarkFieldType.Number: {
      if (typeof val === 'number') return val;
      const num = Number(val);
      return isNaN(num) ? val : num;
    }

    case LarkFieldType.SingleSelect: {
      const optId = String(val);
      if (property?.options && Array.isArray(property.options)) {
        const found = property.options.find(o => o.id === optId);
        if (found) return found.name;
      }
      return optId;
    }

    case LarkFieldType.MultiSelect: {
      if (!Array.isArray(val)) return [];
      const optMap = new Map((property?.options || []).map(o => [o.id, o.name]));
      return val.map(id => optMap.get(String(id)) || String(id));
    }

    case LarkFieldType.DateTime: {
      if (typeof val === 'number') return val;
      const num = Number(val);
      return isNaN(num) ? val : num;
    }

    case LarkFieldType.Checkbox: {
      return Boolean(val);
    }

    case LarkFieldType.User: {
      if (typeof val === 'object' && val !== null && 'users' in val) {
        const users = (val as { users: Array<{ name?: string; userId?: string; enName?: string }> }).users;
        if (Array.isArray(users)) {
          return users.map(u => u.name || u.enName || u.userId || '');
        }
      }
      if (Array.isArray(val)) {
        return val.map(u => (typeof u === 'object' && u !== null && 'name' in u) ? (u as { name: string }).name : String(u));
      }
      return val;
    }

    case LarkFieldType.Phone: {
      if (typeof val === 'object' && val !== null && 'fullPhoneNum' in val) {
        return (val as { fullPhoneNum: string }).fullPhoneNum;
      }
      return String(val);
    }

    case LarkFieldType.Url: {
      if (Array.isArray(val)) {
        return val.map((item: unknown) => {
          if (typeof item === 'object' && item !== null && 'link' in item) {
            return (item as { link: string }).link;
          }
          return String(item);
        }).join(', ');
      }
      return String(val);
    }

    case LarkFieldType.Attachment: {
      if (Array.isArray(val)) {
        return val.map((att: unknown) => {
          if (typeof att === 'object' && att !== null) {
            const a = att as { name?: string; size?: number; token?: string; type?: string };
            return {
              name: a.name || '',
              size: a.size || 0,
              token: a.token || '',
              type: a.type || ''
            };
          }
          return att;
        });
      }
      return [];
    }

    case LarkFieldType.SingleLink:
    case LarkFieldType.DuplexLink: {
      if (Array.isArray(val)) {
        return val.map(v => String(v));
      }
      if (typeof val === 'string') return [val];
      return [];
    }

    case LarkFieldType.WorkflowStage: {
      const optId = String(val);
      if (property?.options && Array.isArray(property.options)) {
        const found = property.options.find(o => o.id === optId);
        if (found) return found.name;
      }
      return optId;
    }

    case LarkFieldType.CreatedAt: {
      if (typeof val === 'number') return val;
      const num = Number(val);
      return isNaN(num) ? val : num;
    }

    case LarkFieldType.AutoNumber: {
      if (Array.isArray(val) && val.length > 0) {
        const first = val[0] as { sequence?: string; number?: string };
        if (first.sequence !== undefined) return first.sequence;
        if (first.number !== undefined) return first.number;
      }
      return val;
    }

    default:
      return val;
  }
}
