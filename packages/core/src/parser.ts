import zlib from 'zlib';
import fs from 'fs';
import {
  type LarkBaseResult,
  type LarkTable,
  type LarkField,
  type LarkRecord,
  type LarkView,
  type LarkAutomation,
  type LarkDashboard,
  type LarkRole,
  type ParseOptions
} from './types.js';
import { getFieldTypeName } from './field-types.js';
import { decodeCellValue } from './decoder.js';
import { toReadableFormula, type FormulaContext } from './formula.js';
import { isSensitiveField, anonymizeName } from './sensitive.js';

interface RawOuterBase {
  gzipSnapshot?: string;
  gzipExtraInfo?: string;
  gzipBaseRole?: string;
  gzipAccessConfig?: string;
  gzipDashboard?: string;
  gzipAutomation?: string;
  sign?: string;
  gzipFormConfigs?: string;
  [key: string]: unknown;
}

interface RawSnapshotElement {
  schema?: {
    base?: { id: string | number; name: string };
    tableMap?: Record<string, { id: string; name: string }>;
    data?: {
      table?: {
        meta?: { id: string; name?: string; recordsNum?: number };
        name?: string;
        id?: string;
        primaryKey?: string;
        fieldMap?: Record<string, {
          name: string;
          type: number;
          property?: Record<string, unknown>;
        }>;
        viewMap?: Record<string, {
          id: string;
          name: string;
          type: number | string;
          property?: Record<string, unknown>;
        }>;
        views?: Array<{ id: string; name: string; type: number | string }>;
      };
      recordMap?: Record<string, Record<string, { value?: unknown; modifiedTime?: number }>>;
    };
  };
}

export function decompressGzipBase64<T = unknown>(b64Str: string): T | null {
  if (!b64Str) return null;
  try {
    const buf = Buffer.from(b64Str, 'base64');
    const unzipped = zlib.gunzipSync(buf);
    return JSON.parse(unzipped.toString('utf-8')) as T;
  } catch (err) {
    console.error('Failed to gunzip/parse base64 block:', err);
    return null;
  }
}

export function compressGzipBase64(data: unknown): string {
  const jsonStr = JSON.stringify(data);
  const zipped = zlib.gzipSync(Buffer.from(jsonStr, 'utf-8'));
  return zipped.toString('base64');
}

/**
 * Parse a .base file content from Buffer or file path
 */
export function parseBaseFile(
  input: Buffer | Uint8Array | string,
  options: ParseOptions = {}
): LarkBaseResult {
  let jsonString: string;

  if (typeof input === 'string') {
    // Check if it's a file path or direct JSON string
    if (input.startsWith('{') || input.startsWith('[')) {
      jsonString = input;
    } else {
      jsonString = fs.readFileSync(input, 'utf-8');
    }
  } else {
    jsonString = Buffer.from(input).toString('utf-8');
  }

  const outer = JSON.parse(jsonString) as RawOuterBase;

  // 1. Unzip snapshot
  const snapshot = outer.gzipSnapshot
    ? decompressGzipBase64<RawSnapshotElement[]>(outer.gzipSnapshot)
    : [];

  const baseMeta = snapshot?.[0]?.schema?.base || { id: '', name: 'Untitled Base' };
  const tableMap = snapshot?.[0]?.schema?.tableMap || {};

  // Build name resolution context for formulas
  const tableNameMap: Record<string, string> = {};
  for (const [id, t] of Object.entries(tableMap)) {
    tableNameMap[id] = t.name || id;
  }

  const fieldNameMap: Record<string, Record<string, string>> = {};
  const optionNameMap: Record<string, Record<string, string>> = {};

  if (Array.isArray(snapshot)) {
    for (const el of snapshot) {
      const tbl = el?.schema?.data?.table;
      if (!tbl) continue;
      const tid = tbl.meta?.id || tbl.id;
      if (!tid) continue;
      
      fieldNameMap[tid] = fieldNameMap[tid] || {};
      for (const [fid, f] of Object.entries(tbl.fieldMap || {})) {
        fieldNameMap[tid][fid] = f.name;
        if (f.property && Array.isArray(f.property.options)) {
          optionNameMap[fid] = {};
          for (const opt of f.property.options as Array<{ id: string; name: string }>) {
            if (opt?.id) {
              optionNameMap[fid][opt.id] = opt.name || opt.id;
            }
          }
        }
      }
    }
  }

  const formulaContext: FormulaContext = {
    tableNameMap,
    fieldNameMap,
    optionNameMap
  };

  // 2. Parse Tables & Records
  const tables: LarkTable[] = [];
  const seenTableIds = new Set<string>();

  if (Array.isArray(snapshot)) {
    for (const el of snapshot) {
      const tbl = el?.schema?.data?.table;
      if (!tbl) continue;
      const tid = tbl.meta?.id || tbl.id;
      if (!tid || seenTableIds.has(tid)) continue;
      seenTableIds.add(tid);

      // Check filter options
      if (options.tableIds && !options.tableIds.includes(tid)) {
        continue;
      }

      const tname = tableMap[tid]?.name || tbl.meta?.name || tbl.name || tid;
      const primaryKey = tbl.primaryKey;
      const fieldMap = tbl.fieldMap || {};

      const fields: LarkField[] = [];
      for (const [fid, f] of Object.entries(fieldMap)) {
        const typeName = getFieldTypeName(f.type);
        const prop = f.property || {};

        let readableFormula: string | undefined;
        let rawFormula: string | undefined;
        if (prop.formula && typeof prop.formula === 'string') {
          rawFormula = prop.formula;
          readableFormula = toReadableFormula(prop.formula, tid, formulaContext);
        }

        const fieldItem: LarkField = {
          id: fid,
          name: f.name,
          type: f.type,
          typeName,
          property: prop,
          formula: rawFormula,
          readableFormula,
          linkTableId: (prop.tableId as string) || undefined,
          options: Array.isArray(prop.options) ? (prop.options as LarkField['options']) : undefined
        };

        if (f.type === 19) {
          // Lookup
          const filterInfo = prop.filterInfo as { targetTable?: string } | undefined;
          fieldItem.lookup = {
            targetTableId: filterInfo?.targetTable,
            targetFieldId: prop.targetField as string,
            rollup: prop.rollup as number,
            rawFormula,
            readableFormula
          };
        }

        fields.push(fieldItem);
      }

      // Views
      const views: LarkView[] = [];
      if (tbl.viewMap) {
        for (const [vid, v] of Object.entries(tbl.viewMap)) {
          views.push({
            id: vid,
            name: v.name,
            type: v.type,
            property: v.property
          });
        }
      } else if (Array.isArray(tbl.views)) {
        for (const v of tbl.views) {
          views.push({
            id: v.id,
            name: v.name,
            type: v.type
          });
        }
      }

      // Records
      const records: LarkRecord[] = [];
      const rawRecMap = el?.schema?.data?.recordMap || {};
      const recordIds = Object.keys(rawRecMap);

      if (options.includeRecords !== false) {
        for (const rid of recordIds) {
          const rawRec = rawRecMap[rid] || {};
          const cells: Record<string, unknown> = {};

          let createdAt: number | undefined;
          let modifiedAt: number | undefined;

          for (const f of fields) {
            const rawCell = rawRec[f.id];
            if (rawCell) {
              if (rawCell.modifiedTime) modifiedAt = rawCell.modifiedTime;
              let decoded = decodeCellValue(f.type, rawCell, f.property);

              // If anonymize option is enabled
              if (options.anonymize) {
                if (isSensitiveField(f.name)) {
                  decoded = '[REDACTED]';
                } else if (f.name.toLowerCase().includes('tên') && typeof decoded === 'string') {
                  decoded = anonymizeName(decoded);
                }
              }

              cells[f.id] = decoded;
            } else {
              cells[f.id] = null;
            }
          }

          records.push({
            id: rid,
            cells,
            createdAt,
            modifiedAt
          });
        }
      }

      tables.push({
        id: tid,
        name: tname,
        primaryKey,
        fields,
        views,
        records,
        recordCount: recordIds.length
      });
    }
  }

  // 3. Automations
  const automations: LarkAutomation[] = [];
  if (outer.gzipAutomation) {
    const rawAuto = decompressGzipBase64<unknown[] | Record<string, unknown>>(outer.gzipAutomation);
    const autoList = Array.isArray(rawAuto) ? rawAuto : (rawAuto ? Object.values(rawAuto) : []);
    for (const a of autoList) {
      if (!a || typeof a !== 'object') continue;
      const item = a as Record<string, unknown>;
      const extra = typeof item.WorkflowExtra === 'string'
        ? JSON.parse(item.WorkflowExtra)
        : item.WorkflowExtra;
      const title = (extra as { title?: string; name?: string })?.title ||
                    (extra as { title?: string; name?: string })?.name ||
                    `Automation ${item.id || ''}`;
      automations.push({
        id: (item.id as string | number) || '',
        name: String(title),
        triggerName: (item.trigger_name as string) || undefined,
        status: Number(item.status || 0),
        createdTime: Number(item.created_time || 0),
        updatedTime: Number(item.updated_time || 0),
        raw: item
      });
    }
  }

  // 4. Dashboards
  const dashboards: LarkDashboard[] = [];
  if (outer.gzipDashboard) {
    const rawDash = decompressGzipBase64<unknown[] | Record<string, unknown>>(outer.gzipDashboard);
    const dashList = Array.isArray(rawDash) ? rawDash : (rawDash ? Object.values(rawDash) : []);
    for (const d of dashList) {
      if (!d || typeof d !== 'object') continue;
      const item = d as Record<string, unknown>;
      dashboards.push({
        id: (item.id as string | number) || '',
        name: String(item.name || item.title || 'Dashboard'),
        raw: item
      });
    }
  }

  // 5. Roles
  const roles: LarkRole[] = [];
  if (outer.gzipBaseRole) {
    const rawRoles = decompressGzipBase64<Record<string, unknown>>(outer.gzipBaseRole);
    if (rawRoles && typeof rawRoles === 'object') {
      for (const [rid, r] of Object.entries(rawRoles)) {
        roles.push({
          id: rid,
          name: (r as { name?: string })?.name || rid,
          raw: r as Record<string, unknown>
        });
      }
    }
  }

  return {
    base: baseMeta,
    tables,
    automations,
    dashboards,
    roles
  };
}
