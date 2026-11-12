import initSqlJs from 'sql.js';
import {
  type LarkTable,
  type LarkBaseResult,
  LarkFieldType,
  isSensitiveField,
  anonymizeName
} from '@duongsinh/lark-base-core';
import { NocoEduMapper } from './nocoedu-mapper.js';

export class BaseExporterService {
  /**
   * Exports data as a standardized JSON structure with anonymized fields
   */
  public static exportToJson(baseResult: LarkBaseResult, anonymize = true): Record<string, unknown[]> {
    const mapped = NocoEduMapper.mapToNocoEdu(baseResult, anonymize);
    const result: Record<string, unknown[]> = {};

    for (const [key, records] of Object.entries(mapped.data)) {
      result[key] = records;
    }

    return result;
  }

  /**
   * Exports a specific table or all tables as CSV string
   */
  public static exportToCsv(baseResult: LarkBaseResult, collectionName?: string, anonymize = true): string {
    const mapped = NocoEduMapper.mapToNocoEdu(baseResult, anonymize);
    const targetKey = collectionName && mapped.data[collectionName] ? collectionName : 'students';
    const records = mapped.data[targetKey] || [];

    if (records.length === 0) {
      return 'id\n';
    }

    const headers = Object.keys(records[0]);
    const lines = [headers.join(',')];

    for (const r of records) {
      const row = headers.map(h => {
        const val = r[h];
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      });
      lines.push(row.join(','));
    }

    return lines.join('\n');
  }

  /**
   * Exports all NocoEdu collections into an SQLite database binary
   */
  public static async exportToSqlite(baseResult: LarkBaseResult, anonymize = true): Promise<Uint8Array> {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    const mapped = NocoEduMapper.mapToNocoEdu(baseResult, anonymize);

    for (const colDef of mapped.collections) {
      const tblName = colDef.name;
      const records = mapped.data[tblName] || [];

      // Create table
      const colDefs = ['"id" TEXT PRIMARY KEY'];
      for (const f of colDef.fields) {
        let colType = 'TEXT';
        if (f.type === 'number' || f.type === 'integer') {
          colType = 'NUMERIC';
        } else if (f.type === 'date') {
          colType = 'TEXT';
        }
        colDefs.push(`"${f.name}" ${colType}`);
      }

      db.run(`CREATE TABLE IF NOT EXISTS "${tblName}" (${colDefs.join(', ')});`);

      // Insert records
      if (records.length > 0) {
        for (const rec of records) {
          const colNames = ['"id"'];
          const placeholders = ['?'];
          const values: Array<string | number | null | Uint8Array> = [rec.id ? String(rec.id) : ''];

          for (const f of colDef.fields) {
            colNames.push(`"${f.name}"`);
            placeholders.push('?');
            const val = rec[f.name];
            if (val === null || val === undefined) {
              values.push(null);
            } else if (typeof val === 'number') {
              values.push(val);
            } else {
              values.push(String(val));
            }
          }

          const sql = `INSERT INTO "${tblName}" (${colNames.join(', ')}) VALUES (${placeholders.join(', ')});`;
          try {
            db.run(sql, values);
          } catch {
            // Ignore single record collision
          }
        }
      }
    }

    const binary = db.export();
    db.close();
    return binary;
  }
}
