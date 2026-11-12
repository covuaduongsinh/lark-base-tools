import { type LarkTable, isSensitiveField, anonymizeName } from '@duongsinh/lark-base-core';
import { type ExportProfile } from '../profiles/types.js';

export function exportTableToJson(
  table: LarkTable,
  profile?: ExportProfile
): Record<string, unknown>[] {
  const activeFields = table.fields.filter(f => {
    if (profile?.excludeSensitiveFields && isSensitiveField(f.name)) {
      return false;
    }
    if (profile?.excludeFields?.[table.name]?.includes(f.name)) {
      return false;
    }
    return true;
  });

  return table.records.map(rec => {
    const item: Record<string, unknown> = {
      id: rec.id
    };

    for (const f of activeFields) {
      const fieldKey = profile?.renameFields?.[table.name]?.[f.name] || f.name;
      let cellVal = rec.cells[f.id];

      if (profile?.anonymizeAllNames && f.name.toLowerCase().includes('tên') && typeof cellVal === 'string') {
        cellVal = anonymizeName(cellVal);
      } else if (profile?.anonymizeFields?.[table.name]?.includes(f.name) && typeof cellVal === 'string') {
        cellVal = anonymizeName(cellVal);
      }

      if (profile?.resolveLinksAsForeignKeys && Array.isArray(cellVal)) {
        item[fieldKey] = cellVal.length === 1 ? cellVal[0] : cellVal;
      } else {
        item[fieldKey] = cellVal;
      }
    }

    return item;
  });
}
