import initSqlJs from 'sql.js';
import { type LarkTable, LarkFieldType, isSensitiveField, anonymizeName } from '@duongsinh/lark-base-core';
import { type ExportProfile } from '../profiles/types.js';

function sanitizeColumnName(name: string): string {
  const clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return clean.length > 0 ? clean : 'col';
}

function sanitizeTableName(name: string, id: string): string {
  const clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return clean.length > 0 ? clean : `tbl_${id.substring(3, 10)}`;
}

export async function exportTablesToSqlite(
  tables: LarkTable[],
  profile?: ExportProfile
): Promise<Uint8Array> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  const usedTableNames = new Set<string>();

  for (const t of tables) {
    if (profile?.excludeTables?.includes(t.name)) continue;
    if (profile?.includeTables && !profile.includeTables.includes(t.name)) continue;

    let tblName = sanitizeTableName(t.name, t.id);
    let counter = 1;
    while (usedTableNames.has(tblName)) {
      tblName = `${tblName}_${counter++}`;
    }
    usedTableNames.add(tblName);

    const activeFields = t.fields.filter(f => {
      if (profile?.excludeSensitiveFields && isSensitiveField(f.name)) {
        return false;
      }
      if (profile?.excludeFields?.[t.name]?.includes(f.name)) {
        return false;
      }
      return true;
    });

    // Column definitions
    const colDefs = ['"id" TEXT PRIMARY KEY'];
    const colNameMap = new Map<string, string>();
    const usedColNames = new Set<string>(['id']);

    for (const f of activeFields) {
      let colName = profile?.renameFields?.[t.name]?.[f.name] || sanitizeColumnName(f.name);
      let cCounter = 1;
      while (usedColNames.has(colName)) {
        colName = `${colName}_${cCounter++}`;
      }
      usedColNames.add(colName);
      colNameMap.set(f.id, colName);

      let colType = 'TEXT';
      if (f.type === LarkFieldType.Number || f.type === LarkFieldType.DateTime || f.type === LarkFieldType.CreatedAt) {
        colType = 'NUMERIC';
      } else if (f.type === LarkFieldType.Checkbox) {
        colType = 'INTEGER';
      }

      colDefs.push(`"${colName}" ${colType}`);
    }

    db.run(`CREATE TABLE "${tblName}" (${colDefs.join(', ')});`);

    // Insert records
    for (const rec of t.records) {
      const colNames = ['"id"'];
      const placeholders = ['?'];
      const values: unknown[] = [rec.id];

      for (const f of activeFields) {
        const col = colNameMap.get(f.id)!;
        colNames.push(`"${col}"`);
        placeholders.push('?');

        let cellVal = rec.cells[f.id];

        if (profile?.anonymizeAllNames && f.name.toLowerCase().includes('tên') && typeof cellVal === 'string') {
          cellVal = anonymizeName(cellVal);
        } else if (profile?.anonymizeFields?.[t.name]?.includes(f.name) && typeof cellVal === 'string') {
          cellVal = anonymizeName(cellVal);
        }

        if (cellVal === null || cellVal === undefined) {
          values.push(null);
        } else if (typeof cellVal === 'boolean') {
          values.push(cellVal ? 1 : 0);
        } else if (typeof cellVal === 'object') {
          values.push(JSON.stringify(cellVal));
        } else {
          values.push(cellVal);
        }
      }

      const sql = `INSERT INTO "${tblName}" (${colNames.join(', ')}) VALUES (${placeholders.join(', ')});`;
      db.run(sql, values as (string | number | null | Uint8Array)[]);
    }
  }

  const binaryArray = db.export();
  db.close();
  return binaryArray;
}
