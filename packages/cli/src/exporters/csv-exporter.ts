import { type LarkTable, isSensitiveField, anonymizeName } from '@duongsinh/lark-base-core';
import { type ExportProfile } from '../profiles/types.js';

export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  let str: string;
  if (typeof val === 'object') {
    str = JSON.stringify(val);
  } else {
    str = String(val);
  }

  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportTableToCsv(
  table: LarkTable,
  profile?: ExportProfile
): string {
  // Determine fields to include
  const activeFields = table.fields.filter(f => {
    if (profile?.excludeSensitiveFields && isSensitiveField(f.name)) {
      return false;
    }
    if (profile?.excludeFields?.[table.name]?.includes(f.name)) {
      return false;
    }
    return true;
  });

  // Headers (apply renaming if configured)
  const headers = ['id', ...activeFields.map(f => {
    const renamed = profile?.renameFields?.[table.name]?.[f.name];
    return renamed || f.name;
  })];

  const rows: string[] = [
    headers.map(escapeCsvCell).join(',')
  ];

  for (const rec of table.records) {
    const rowValues: string[] = [escapeCsvCell(rec.id)];
    for (const f of activeFields) {
      let cellVal = rec.cells[f.id];

      // Handle anonymization
      if (profile?.anonymizeAllNames && f.name.toLowerCase().includes('tên') && typeof cellVal === 'string') {
        cellVal = anonymizeName(cellVal);
      } else if (profile?.anonymizeFields?.[table.name]?.includes(f.name) && typeof cellVal === 'string') {
        cellVal = anonymizeName(cellVal);
      }

      // Handle link resolution as foreign keys
      if (profile?.resolveLinksAsForeignKeys && Array.isArray(cellVal)) {
        cellVal = cellVal.join(',');
      }

      rowValues.push(escapeCsvCell(cellVal));
    }
    rows.push(rowValues.join(','));
  }

  // Prepend UTF-8 BOM so Excel opens Vietnamese characters correctly
  return '\uFEFF' + rows.join('\r\n');
}
