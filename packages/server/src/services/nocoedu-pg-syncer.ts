import pg from 'pg';
import {
  type LarkBaseResult,
  type LarkTable,
  type LarkRecord,
  anonymizeName
} from '@duongsinh/lark-base-core';
import { type MigrationStepLog } from './types.js';

const { Pool } = pg;

export interface PgSyncOptions {
  databaseUrl?: string;
  dryRun?: boolean;
  anonymize?: boolean;
  userId?: string;
}

export interface PgSyncResult {
  success: boolean;
  dryRun: boolean;
  written: {
    coSo: { inserted: number; updated: number };
    lop: { inserted: number; updated: number };
    phuHuynh: { inserted: number; updated: number };
    hocVien: { inserted: number; updated: number };
    buoiHoc: { inserted: number; updated: number };
    diemDanh: { inserted: number; updated: number };
    goiHoc: { inserted: number; updated: number };
  };
  totalInserted: number;
  totalUpdated: number;
  logs: MigrationStepLog[];
  durationMs: number;
}

// Level key normalization matching NocoEdu server/edu/levels.ts
const LEVEL_MAP: Record<string, { key: string; order: number }> = {
  nm1: { key: 'tot', order: 1 },
  nm2: { key: 'tot', order: 1 },
  'nhập môn': { key: 'tot', order: 1 },
  tốt: { key: 'tot', order: 1 },
  tot: { key: 'tot', order: 1 },
  'cb mã': { key: 'ma', order: 2 },
  'tc mã': { key: 'ma', order: 2 },
  mã: { key: 'ma', order: 2 },
  ma: { key: 'ma', order: 2 },
  'cb tượng': { key: 'tuong', order: 3 },
  'tc tượng': { key: 'tuong', order: 3 },
  tượng: { key: 'tuong', order: 3 },
  tuong: { key: 'tuong', order: 3 },
  'cb xe': { key: 'xe', order: 4 },
  'tc xe': { key: 'xe', order: 4 },
  xe: { key: 'xe', order: 4 },
  'cb hậu': { key: 'hau', order: 5 },
  'tc hậu': { key: 'hau', order: 5 },
  hậu: { key: 'hau', order: 5 },
  hau: { key: 'hau', order: 5 },
  'cb vua': { key: 'vua', order: 6 },
  'tc vua': { key: 'vua', order: 6 },
  vua: { key: 'vua', order: 6 }
};

function normalizeLevel(raw: unknown): { key: string; order: number } {
  if (!raw) return { key: 'tot', order: 1 };
  const str = String(raw).normalize('NFC').toLowerCase().trim();
  if (!str) return { key: 'tot', order: 1 };
  if (LEVEL_MAP[str]) return LEVEL_MAP[str];
  if (str.includes('vua')) return { key: 'vua', order: 6 };
  if (str.includes('hậu') || str.includes('hau')) return { key: 'hau', order: 5 };
  if (str.includes('xe')) return { key: 'xe', order: 4 };
  if (str.includes('tượng') || str.includes('tuong')) return { key: 'tuong', order: 3 };
  if (str.includes('mã') || str.includes('ma')) return { key: 'ma', order: 2 };
  if (str.includes('tốt') || str.includes('tot') || str.includes('nm')) return { key: 'tot', order: 1 };
  return { key: 'tot', order: 1 };
}

function normalizeFullName(raw: string): string {
  return raw
    .normalize('NFC')
    .split(/\s+/u)
    .filter(Boolean)
    .map(word => {
      const [first = '', ...rest] = [...word.toLocaleLowerCase('vi')];
      return `${first.toLocaleUpperCase('vi')}${rest.join('')}`;
    })
    .join(' ');
}

function normalizePhone(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const text = typeof raw === 'number' ? String(Math.trunc(raw)) : String(raw).trim();
  if (!text) return null;
  const digits = text.replace(/[^\d+]/gu, '');
  let plain = digits.startsWith('+84')
    ? `0${digits.slice(3)}`
    : digits.startsWith('84') && digits.length >= 11
      ? `0${digits.slice(2)}`
      : digits;
  plain = plain.replace(/\D/gu, '');
  if (/^[35789]\d{8}$/u.test(plain)) {
    plain = `0${plain}`;
  }
  return /^0[35789]\d{8}$/u.test(plain) ? plain : null;
}

function normalizeStatus(raw: string): string | null {
  const s = raw.normalize('NFC').trim().toLowerCase();
  if (s === 'đang học') return 'dang_hoc';
  if (s === 'đã nghỉ') return 'da_nghi';
  if (s === 'tạm nghỉ') return 'tam_nghi';
  if (s === 'mới học thử' || s === 'đăng ký học thử' || s === 'chưa học thử') return 'hoc_thu';
  if (s.includes('nghỉ') || s.includes('thôi')) return 'da_nghi';
  if (s.includes('thử')) return 'hoc_thu';
  if (s.includes('đang')) return 'dang_hoc';
  return null;
}

function normalizeRelation(raw: string): string {
  const r = raw.normalize('NFC').trim().toLowerCase();
  if (r === 'mẹ' || r.includes('mẹ')) return 'me';
  if (r === 'bố' || r.includes('bố')) return 'bo';
  return 'khac';
}

function parseAttendanceStatus(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (raw === 1 || raw === '1' || raw === true) return 'co_mat';
  if (raw === 0 || raw === '0' || raw === false) return 'vang_khong_phep';
  const str = String(raw).normalize('NFC').toLowerCase().trim();
  if (str === '1' || str === 'true' || str === 'có mặt' || str === 'co mat') return 'co_mat';
  if (str === '0' || str === 'false' || str === 'vắng không phép') return 'vang_khong_phep';
  if (str === 'vắng có phép' || str === 'co phep') return 'vang_co_phep';
  return null;
}

function dateFromTimestampOrString(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const d = new Date(raw + 7 * 3_600_000);
    const year = d.getUTCFullYear();
    if (year >= 1950 && year <= 2100) {
      return d.toISOString().slice(0, 10);
    }
    return null;
  }
  const str = String(raw).trim();
  if (/^\d{10,13}$/.test(str)) {
    const ms = str.length === 10 ? Number(str) * 1000 : Number(str);
    const d = new Date(ms + 7 * 3_600_000);
    const year = d.getUTCFullYear();
    if (year >= 1950 && year <= 2100) {
      return d.toISOString().slice(0, 10);
    }
  }
  const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const dt = new Date(`${iso}T00:00:00Z`);
    if (!Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso) {
      return iso;
    }
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  return null;
}

function parseBirthYear(raw: unknown): { namSinh: number; ngaySinh: string | null } {
  const iso = dateFromTimestampOrString(raw);
  if (iso) {
    const year = parseInt(iso.slice(0, 4), 10);
    const currentYear = new Date().getUTCFullYear();
    if (year >= 1950 && year <= currentYear) {
      return { namSinh: year, ngaySinh: iso };
    }
  }
  if (raw) {
    const str = String(raw).trim();
    const yearMatch = /^(\d{4})$/.exec(str);
    if (yearMatch) {
      const year = parseInt(yearMatch[1], 10);
      if (year >= 1950 && year <= new Date().getUTCFullYear()) {
        return { namSinh: year, ngaySinh: null };
      }
    }
  }
  return { namSinh: 2018, ngaySinh: null };
}

function parseSessionTime(rawCa: unknown): { gioBatDau: string; gioKetThuc: string } | null {
  if (!rawCa) return null;
  const str = String(rawCa);
  const match = /\(\s*(\d{1,2})h(\d{2})\s*-\s*(\d{1,2})h(\d{2})\s*\)/i.exec(str);
  if (match) {
    const [, h1, m1, h2, m2] = match;
    return {
      gioBatDau: `${h1.padStart(2, '0')}:${m1}`,
      gioKetThuc: `${h2.padStart(2, '0')}:${m2}`
    };
  }
  return null;
}

function parseThu(rawThu: unknown): number | null {
  if (!rawThu) return null;
  const match = /^thứ\s*([2-7])$/iu.exec(String(rawThu).normalize('NFC').trim());
  return match?.[1] ? Number(match[1]) : null;
}

function findField(table: LarkTable, keywords: string[]) {
  // Pass 1: exact match (case-insensitive)
  for (const k of keywords) {
    const target = k.normalize('NFC').toLowerCase().trim();
    const exact = table.fields.find(f => f.name.normalize('NFC').toLowerCase().trim() === target);
    if (exact) return exact;
  }
  // Pass 2: substring match
  for (const k of keywords) {
    const target = k.normalize('NFC').toLowerCase().trim();
    const partial = table.fields.find(f => f.name.normalize('NFC').toLowerCase().trim().includes(target));
    if (partial) return partial;
  }
  return undefined;
}

function getRecordValue(rec: LarkRecord, table: LarkTable, keywords: string[]): unknown {
  const fld = findField(table, keywords);
  if (!fld) return undefined;
  return rec.cells[fld.id];
}

function getRecordText(rec: LarkRecord, table: LarkTable, keywords: string[]): string {
  const val = getRecordValue(rec, table, keywords);
  if (val === undefined || val === null) return '';
  if (Array.isArray(val)) {
    return val
      .map(v => (typeof v === 'object' && v && 'text' in v ? String((v as Record<string, unknown>).text) : String(v)))
      .join(', ')
      .trim();
  }
  if (typeof val === 'object' && val !== null) {
    if ('text' in val) return String((val as { text: unknown }).text || '').trim();
    if ('fullPhoneNum' in val) return String((val as { fullPhoneNum: unknown }).fullPhoneNum || '').trim();
  }
  return String(val).trim();
}

function getRecordLinks(rec: LarkRecord, table: LarkTable, keywords: string[]): string[] {
  const val = getRecordValue(rec, table, keywords);
  if (Array.isArray(val)) {
    const out: string[] = [];
    for (const item of val) {
      if (typeof item === 'string' && item.trim()) out.push(item.trim());
      else if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        if (typeof obj.id === 'string') out.push(obj.id);
        else if (typeof obj.recordId === 'string') out.push(obj.recordId);
      }
    }
    return out;
  }
  if (typeof val === 'string' && val.trim()) return [val.trim()];
  return [];
}

function getRecordLink(rec: LarkRecord, table: LarkTable, keywords: string[]): string | null {
  return getRecordLinks(rec, table, keywords)[0] ?? null;
}

export class NocoEduPgSyncer {
  private pool: pg.Pool;

  constructor(connectionString?: string) {
    const connStr =
      connectionString ||
      process.env.NOCOEDU_DATABASE_URL ||
      process.env.DATABASE_URL ||
      'postgres://nocoedu:0962957d6d28e7e4391305fdea2a8726@compose-synthesize-online-firewall-897jlk-db-1:5432/nocoedu';

    this.pool = new Pool({
      connectionString: connStr,
      connectionTimeoutMillis: 10000
    });
  }

  public async sync(
    baseResult: LarkBaseResult,
    options: PgSyncOptions = {},
    logger?: (log: MigrationStepLog) => void
  ): Promise<PgSyncResult> {
    const startTime = Date.now();
    const logs: MigrationStepLog[] = [];
    const addLog = (log: MigrationStepLog) => {
      logs.push(log);
      logger?.(log);
    };

    const dryRun = options.dryRun ?? false;
    const anonymize = options.anonymize ?? false;
    const userId = options.userId || 'lark-base-tools';

    addLog({
      step: 'PostgreSQL Init',
      status: 'in_progress',
      message: `Đang kết nối PostgreSQL NocoEdu (dryRun=${dryRun}, anonymize=${anonymize})...`,
      timestamp: new Date().toISOString()
    });

    const client = await this.pool.connect();

    const written = {
      coSo: { inserted: 0, updated: 0 },
      lop: { inserted: 0, updated: 0 },
      phuHuynh: { inserted: 0, updated: 0 },
      hocVien: { inserted: 0, updated: 0 },
      buoiHoc: { inserted: 0, updated: 0 },
      diemDanh: { inserted: 0, updated: 0 },
      goiHoc: { inserted: 0, updated: 0 }
    };

    try {
      await client.query('BEGIN');

      // Clean up any invalid/orphan artifacts left by earlier un-prefixed syncs before upserting
      await client.query(`DELETE FROM edu_buoi_hoc WHERE external_id IS NULL OR external_id = ''`);
      await client.query(`DELETE FROM edu_phu_huynh WHERE so_dien_thoai = '0900000000'`);
      await client.query(
        `DELETE FROM edu_goi_hoc WHERE external_id IS NOT NULL AND external_id NOT LIKE 'lark:%'`
      );

      // Index tables by id & name
      const tablesById = new Map<string, LarkTable>();
      for (const t of baseResult.tables) {
        tablesById.set(t.id, t);
      }

      const findTable = (id: string, keyword: string): LarkTable | undefined => {
        if (tablesById.has(id)) return tablesById.get(id);
        return baseResult.tables.find(t => t.name.toLowerCase().includes(keyword.toLowerCase()));
      };

      const tableLevel = findTable('tblvjJoqGcHsoxQr', 'level');
      const tableLop = findTable('tblKvdbs97cDCMF9', 'lớp');
      const tableHocVien = findTable('tblv524wVlgIsH5H', 'học viên');
      const tablePhuHuynh = findTable('tblZUIXmpdt13j4x', 'contact') || findTable('tblZUIXmpdt13j4x', 'phụ huynh');
      const tableDealHp = findTable('tblHp1PGPz52eZBz', 'deal hp') || findTable('tblHp1PGPz52eZBz', 'học phí');

      // Build Level Map: Lark recordId -> level name (e.g. 'NM1', 'CB Mã')
      const levelNamesById = new Map<string, string>();
      if (tableLevel) {
        for (const rec of tableLevel.records) {
          const name = getRecordText(rec, tableLevel, ['tên viết tắt level', 'tên', 'level']);
          if (name) levelNamesById.set(rec.id, name);
        }
      }

      // Find attendance tables (2024, 2025, 2026) in chronological order
      const attendanceTables = baseResult.tables
        .filter(
          t =>
            t.id === 'tblprrzroE2NBli5' ||
            t.id === 'tbluhrY4B8i63PAh' ||
            t.id === 'tbl9TTf0m2EhWV3g' ||
            t.name.toLowerCase().includes('nhận xét mỗi buổi')
        )
        .sort((a, b) => a.name.localeCompare(b.name));

      // 0. Ensure Branches (edu_co_so)
      const branchIdMap = new Map<string, number>(); // 'kl' | 'vp' -> edu_co_so.id
      const coSoRes = await client.query('SELECT id, ma, ten, external_id FROM edu_co_so ORDER BY id ASC');
      for (const row of coSoRes.rows) {
        const maLower = String(row.ma).toLowerCase();
        const tenLower = String(row.ten).normalize('NFC').toLowerCase();
        branchIdMap.set(maLower, row.id);
        branchIdMap.set(tenLower, row.id);
        if (tenLower.includes('kim liên')) branchIdMap.set('kl', row.id);
        if (tenLower.includes('vĩnh phúc')) branchIdMap.set('vp', row.id);
      }

      const resolveBranchId = (rawBranch: string): number | null => {
        const norm = rawBranch.normalize('NFC').toLowerCase().trim();
        if (norm.includes('vĩnh phúc') || norm === 'vp' || norm.includes('cơ sở 2')) {
          return branchIdMap.get('vp') || 2;
        }
        if (norm.includes('kim liên') || norm === 'kl' || norm.includes('cơ sở 1')) {
          return branchIdMap.get('kl') || 1;
        }
        return null;
      };

      // 1. Sync Classes (edu_lop & edu_lop_lich)
      const classIdMap = new Map<string, number>(); // Lark recordId / external_id -> edu_lop.id
      const classScheduleMap = new Map<string, { thu: number; gioBatDau: string; gioKetThuc: string }>();

      const existingLopRes = await client.query('SELECT id, ma, external_id FROM edu_lop WHERE external_id IS NOT NULL');
      for (const row of existingLopRes.rows) {
        classIdMap.set(row.external_id, row.id);
      }

      if (tableLop) {
        addLog({
          step: 'Sync Lớp Học',
          status: 'in_progress',
          message: `Đang đồng bộ ${tableLop.recordCount} lớp học vào edu_lop & edu_lop_lich...`,
          timestamp: new Date().toISOString()
        });

        for (const rec of tableLop.records) {
          const ten = normalizeFullName(getRecordText(rec, tableLop, ['tên lớp', 'lớp', 'name'])).toUpperCase() || `Lớp ${rec.id}`;
          const coSoText = getRecordText(rec, tableLop, ['cơ sở', 'branch']);
          const coSoId = resolveBranchId(coSoText);
          if (!coSoId) continue;

          const existingId = classIdMap.get(rec.id);
          const tempMa = existingId ? `L${String(existingId).padStart(5, '0')}` : `TMP-${rec.id.slice(-8)}`;

          const res = await client.query(
            `INSERT INTO edu_lop (ma, ten, co_so_id, level_key, level_order, trang_thai, external_id)
             VALUES ($1, $2, $3, 'tot', 1, 'dang_mo', $4)
             ON CONFLICT (external_id) DO UPDATE SET
               ten = EXCLUDED.ten,
               co_so_id = EXCLUDED.co_so_id
             RETURNING id, (xmax = 0) AS inserted`,
            [tempMa, ten, coSoId, rec.id]
          );

          const row = res.rows[0];
          const canonicalMa = `L${String(row.id).padStart(5, '0')}`;
          await client.query(`UPDATE edu_lop SET ma = $1 WHERE id = $2 AND ma <> $1`, [canonicalMa, row.id]);

          classIdMap.set(rec.id, row.id);
          if (row.inserted) written.lop.inserted++;
          else written.lop.updated++;

          const thu = parseThu(getRecordText(rec, tableLop, ['thứ']));
          const ca = parseSessionTime(getRecordText(rec, tableLop, ['ca dạy', 'ca học', 'ca']));
          if (thu !== null && ca !== null) {
            classScheduleMap.set(rec.id, { thu, ...ca });
            const lichExtId = `${rec.id}:lich`;
            await client.query(
              `INSERT INTO edu_lop_lich (lop_id, thu, gio_bat_dau, gio_ket_thuc, external_id)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (external_id) DO UPDATE SET
                 lop_id = EXCLUDED.lop_id,
                 thu = EXCLUDED.thu,
                 gio_bat_dau = EXCLUDED.gio_bat_dau,
                 gio_ket_thuc = EXCLUDED.gio_ket_thuc`,
              [row.id, thu, ca.gioBatDau, ca.gioKetThuc, lichExtId]
            );
          }
        }
      }

      // Ensure fallback classes ('lark:lop:kem-kl', 'lark:lop:kem-vp') in schedule map if present in DB
      const existingLichRes = await client.query(
        `SELECT l.external_id as lop_ext, ll.thu, ll.gio_bat_dau, ll.gio_ket_thuc
         FROM edu_lop_lich ll
         JOIN edu_lop l ON l.id = ll.lop_id
         WHERE l.external_id IS NOT NULL`
      );
      for (const row of existingLichRes.rows) {
        if (!classScheduleMap.has(row.lop_ext)) {
          classScheduleMap.set(row.lop_ext, {
            thu: Number(row.thu),
            gioBatDau: String(row.gio_bat_dau),
            gioKetThuc: String(row.gio_ket_thuc)
          });
        }
      }

      // Map student branch for fallback attendance classes
      const studentBranchMap = new Map<string, string>();
      if (tableHocVien) {
        for (const rec of tableHocVien.records) {
          studentBranchMap.set(rec.id, getRecordText(rec, tableHocVien, ['cơ sở']).normalize('NFC').toLowerCase());
        }
      }

      // 2. Pre-analyze Attendance rows in strict date order (as in NocoEdu ke-hoach.ts)
      interface RawAttRow {
        id: string;
        studentKey: string;
        lopKey: string;
        ngay: string;
        rec: LarkRecord;
        table: LarkTable;
      }

      const rawAttendance: RawAttRow[] = [];
      for (const attTable of attendanceTables) {
        for (const rec of attTable.records) {
          const studentKey = getRecordLink(rec, attTable, ['tên hs', 'học viên']);
          if (!studentKey) continue;

          let lopKey = getRecordLink(rec, attTable, ['lớp', 'lớp học']);
          if (!lopKey) {
            const sBranch = studentBranchMap.get(studentKey) || '';
            const isVp = sBranch.includes('vĩnh phúc') || sBranch.includes('vp');
            lopKey = isVp ? 'lark:lop:kem-vp' : 'lark:lop:kem-kl';
          }

          const rawDayFormat = getRecordValue(rec, attTable, ['ngày học - day format']);
          const rawDayText = getRecordValue(rec, attTable, ['ngày học']);
          const ngay = dateFromTimestampOrString(rawDayFormat) || dateFromTimestampOrString(rawDayText);
          if (!ngay) continue;

          rawAttendance.push({ id: rec.id, studentKey, lopKey, ngay, rec, table: attTable });
        }
      }

      rawAttendance.sort((a, b) => (a.ngay === b.ngay ? a.id.localeCompare(b.id) : a.ngay.localeCompare(b.ngay)));

      const latestClassOfStudent = new Map<string, number>();
      for (const item of rawAttendance) {
        const lopId = classIdMap.get(item.lopKey);
        if (lopId) {
          latestClassOfStudent.set(item.studentKey, lopId);
        }
      }

      // 3. Sync Parents (edu_phu_huynh) - only contacts linked to children with valid VN mobile
      const contactLinksOfStudent = new Map<
        string,
        Array<{ phuHuynhId: number; quanHe: string; via: number; order: number }>
      >();
      const parentByPhone = new Map<string, number>();

      const existingParentsRes = await client.query('SELECT id, so_dien_thoai, external_id FROM edu_phu_huynh');
      for (const row of existingParentsRes.rows) {
        parentByPhone.set(String(row.so_dien_thoai), Number(row.id));
      }

      if (tablePhuHuynh) {
        addLog({
          step: 'Sync Phụ Huynh',
          status: 'in_progress',
          message: `Đang đồng bộ phụ huynh từ bảng Contact (${tablePhuHuynh.recordCount} dòng)...`,
          timestamp: new Date().toISOString()
        });

        for (const [order, rec] of tablePhuHuynh.records.entries()) {
          const con1 = getRecordLinks(rec, tablePhuHuynh, ['tên con số 1']);
          const con2 = getRecordLinks(rec, tablePhuHuynh, ['tên con số 2']);
          if (con1.length === 0 && con2.length === 0) continue;

          let hoTen = normalizeFullName(getRecordText(rec, tablePhuHuynh, ['họ và tên ph contact', 'họ tên']));
          if (!hoTen) continue;
          if (anonymize) hoTen = anonymizeName(hoTen);

          const rawPhone = getRecordValue(rec, tablePhuHuynh, ['số đt', 'số điện thoại']);
          const phone = normalizePhone(rawPhone);
          if (!phone) continue;

          const rawZalo = getRecordValue(rec, tablePhuHuynh, ['số zalo']);
          const zalo = normalizePhone(rawZalo);
          const rawEmail = getRecordText(rec, tablePhuHuynh, ['email']).toLowerCase();
          const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(rawEmail) ? rawEmail : null;
          const mqhText = getRecordText(rec, tablePhuHuynh, ['mqh với hs']);
          const quanHe = mqhText ? normalizeRelation(mqhText) : '';

          let parentId = parentByPhone.get(phone);
          const extId = `lark:contact:${rec.id}`;

          if (parentId) {
            await client.query(
              `UPDATE edu_phu_huynh
               SET ho_ten = $1,
                   email = COALESCE($2, email),
                   zalo = COALESCE($3, zalo),
                   external_id = COALESCE(external_id, $4)
               WHERE id = $5`,
              [hoTen, email, zalo, extId, parentId]
            );
            written.phuHuynh.updated++;
          } else {
            const tempMa = `TMP-${rec.id.slice(-8)}`;
            const res = await client.query(
              `INSERT INTO edu_phu_huynh (ma, ho_ten, so_dien_thoai, email, zalo, external_id)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (external_id) DO UPDATE SET
                 ho_ten = EXCLUDED.ho_ten,
                 so_dien_thoai = EXCLUDED.so_dien_thoai,
                 email = COALESCE(EXCLUDED.email, edu_phu_huynh.email),
                 zalo = COALESCE(EXCLUDED.zalo, edu_phu_huynh.zalo)
               RETURNING id, (xmax = 0) AS inserted`,
              [tempMa, hoTen, phone, email, zalo, extId]
            );
            parentId = Number(res.rows[0].id);
            const canonicalMa = `PH${String(parentId).padStart(5, '0')}`;
            await client.query(`UPDATE edu_phu_huynh SET ma = $1 WHERE id = $2 AND ma <> $1`, [canonicalMa, parentId]);
            parentByPhone.set(phone, parentId);
            if (res.rows[0].inserted) written.phuHuynh.inserted++;
            else written.phuHuynh.updated++;
          }

          for (const sId of con1) {
            const list = contactLinksOfStudent.get(sId) || [];
            list.push({ phuHuynhId: parentId, quanHe, via: 1, order });
            contactLinksOfStudent.set(sId, list);
          }
          for (const sId of con2) {
            const list = contactLinksOfStudent.get(sId) || [];
            list.push({ phuHuynhId: parentId, quanHe, via: 2, order });
            contactLinksOfStudent.set(sId, list);
          }
        }
      }

      // 4. Sync Students (edu_hoc_vien)
      const studentIdMap = new Map<string, number>(); // Lark recordId -> edu_hoc_vien.id
      const validStudentKeys = new Set<string>();

      if (tableHocVien) {
        addLog({
          step: 'Sync Học Viên',
          status: 'in_progress',
          message: `Đang đồng bộ và chuẩn hóa ${tableHocVien.recordCount} học viên vào edu_hoc_vien...`,
          timestamp: new Date().toISOString()
        });

        for (const rec of tableHocVien.records) {
          let hoTen = normalizeFullName(getRecordText(rec, tableHocVien, ['học viên', 'họ và tên', 'họ tên']));
          const coSoText = getRecordText(rec, tableHocVien, ['cơ sở']);
          const coSoId = resolveBranchId(coSoText);
          const rawTrangThai = getRecordText(rec, tableHocVien, ['tình trạng học']);
          const trangThai = normalizeStatus(rawTrangThai);

          // If student is missing name, branch, or valid status (like the 5 invalid rows in Lark), remove if accidentally inserted earlier and skip
          if (!hoTen || !coSoId || !trangThai) {
            await client.query(
              `DELETE FROM edu_hoc_vien WHERE external_id = $1 AND id > 174`,
              [rec.id]
            );
            continue;
          }

          if (anonymize) hoTen = anonymizeName(hoTen);

          const rawBirth = getRecordValue(rec, tableHocVien, ['ngày sinh']);
          const birthInfo = parseBirthYear(rawBirth);

          // Resolve level from Level table link or fallback to 'Các trình độ đã học tại CLB'
          const curLevelLink = getRecordLink(rec, tableHocVien, ['trình độ hiện tại']);
          let levelName = curLevelLink ? levelNamesById.get(curLevelLink) || '' : '';
          if (!levelName) {
            const pastLinks = getRecordLinks(rec, tableHocVien, ['các trình độ đã học tại clb']);
            for (let i = pastLinks.length - 1; i >= 0; i--) {
              const pName = levelNamesById.get(pastLinks[i]);
              if (pName) {
                levelName = pName;
                break;
              }
            }
          }
          const levelInfo = normalizeLevel(levelName);

          const lopId = latestClassOfStudent.get(rec.id) || null;
          const externalCode = getRecordText(rec, tableHocVien, ['id học viên']).slice(0, 32) || null;
          const tempMa = `TMP-${rec.id.slice(-8)}`;

          const res = await client.query(
            `INSERT INTO edu_hoc_vien (
               ma, ho_ten, nam_sinh, ngay_sinh, level_key, level_order, co_so_id, lop_id,
               trang_thai, so_buoi_con_lai, external_id, external_code
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11)
             ON CONFLICT (external_id) DO UPDATE SET
               ho_ten = EXCLUDED.ho_ten,
               nam_sinh = EXCLUDED.nam_sinh,
               ngay_sinh = EXCLUDED.ngay_sinh,
               level_key = EXCLUDED.level_key,
               level_order = EXCLUDED.level_order,
               co_so_id = EXCLUDED.co_so_id,
               lop_id = EXCLUDED.lop_id,
               trang_thai = EXCLUDED.trang_thai,
               external_code = COALESCE(edu_hoc_vien.external_code, EXCLUDED.external_code)
             RETURNING id, (xmax = 0) AS inserted`,
            [
              tempMa,
              hoTen,
              birthInfo.namSinh,
              birthInfo.ngaySinh,
              levelInfo.key,
              levelInfo.order,
              coSoId,
              lopId,
              trangThai,
              rec.id,
              externalCode
            ]
          );

          const row = res.rows[0];
          const studentId = Number(row.id);
          const canonicalMa = `HS${String(studentId).padStart(5, '0')}`;
          await client.query(`UPDATE edu_hoc_vien SET ma = $1 WHERE id = $2 AND ma <> $1`, [canonicalMa, studentId]);

          studentIdMap.set(rec.id, studentId);
          validStudentKeys.add(rec.id);
          if (row.inserted) written.hocVien.inserted++;
          else written.hocVien.updated++;

          // Ensure parent-student links in edu_hoc_vien_phu_huynh
          const pLinks = contactLinksOfStudent.get(rec.id) || [];
          pLinks.sort((a, b) => a.via - b.via || a.order - b.order);
          const fallbackRel = normalizeRelation(getRecordText(rec, tableHocVien, ['quan hệ']));
          const seenParents = new Set<number>();

          for (const pl of pLinks) {
            if (seenParents.has(pl.phuHuynhId)) continue;
            seenParents.add(pl.phuHuynhId);
            const rel = pl.quanHe || fallbackRel || 'khac';
            const isMain = seenParents.size === 1;
            await client.query(
              `INSERT INTO edu_hoc_vien_phu_huynh (hoc_vien_id, phu_huynh_id, quan_he, lien_he_chinh)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (hoc_vien_id, phu_huynh_id) DO NOTHING`,
              [studentId, pl.phuHuynhId, rel, isMain]
            );
          }
        }
      }

      // Cache all existing students
      const existingStudentsRes = await client.query(
        'SELECT id, external_id FROM edu_hoc_vien WHERE external_id IS NOT NULL'
      );
      for (const row of existingStudentsRes.rows) {
        studentIdMap.set(row.external_id, Number(row.id));
      }

      // 5. Sync Attendance & Sessions (edu_buoi_hoc & edu_diem_danh)
      addLog({
        step: 'Sync Điểm Danh',
        status: 'in_progress',
        message: `Đang đồng bộ ${rawAttendance.length} lượt điểm danh hợp lệ từ ${attendanceTables.length} bảng (2024-2026)...`,
        timestamp: new Date().toISOString()
      });

      const existingSessions = await client.query(
        'SELECT id, lop_id, ngay, gio_bat_dau, external_id FROM edu_buoi_hoc'
      );
      const sessionIdMap = new Map<string, number>();
      for (const row of existingSessions.rows) {
        sessionIdMap.set(`${row.lop_id}|${row.ngay}|${row.gio_bat_dau}`, Number(row.id));
        if (row.external_id) {
          sessionIdMap.set(row.external_id, Number(row.id));
        }
      }

      const seenAttendancePairs = new Set<string>();

      for (const item of rawAttendance) {
        const studentId = studentIdMap.get(item.studentKey);
        if (!studentId || !validStudentKeys.has(item.studentKey)) continue;

        const lopId = classIdMap.get(item.lopKey);
        if (!lopId) continue;

        const rawStatus = getRecordValue(item.rec, item.table, ['có mặt']);
        const status = parseAttendanceStatus(rawStatus);
        if (!status) continue;

        const pairKey = `${item.lopKey}|${item.ngay}|${item.studentKey}`;
        if (seenAttendancePairs.has(pairKey)) continue;
        seenAttendancePairs.add(pairKey);

        const sched = classScheduleMap.get(item.lopKey) || {
          thu: 2,
          gioBatDau: '18:00',
          gioKetThuc: '19:30'
        };

        const buoiExternalKey = `lark:buoi:${item.lopKey}:${item.ngay}`;
        const sessionKey = `${lopId}|${item.ngay}|${sched.gioBatDau}`;

        let buoiHocId = sessionIdMap.get(buoiExternalKey) || sessionIdMap.get(sessionKey);

        const keHoachDay = getRecordText(item.rec, item.table, ['kế hoạch dạy']) || null;
        const kienThucMoi = getRecordText(item.rec, item.table, ['kiến thức / lý thuyết mới']) || null;
        const giaoBtvn = getRecordText(item.rec, item.table, ['giao btvn']) || null;
        const keHoachBuoiSau = getRecordText(item.rec, item.table, ['kh buổi sau']) || null;

        if (!buoiHocId) {
          const sRes = await client.query(
            `INSERT INTO edu_buoi_hoc (
               lop_id, ngay, gio_bat_dau, gio_ket_thuc, loai, trang_thai,
               ke_hoach_day, kien_thuc_moi, giao_btvn, ke_hoach_buoi_sau, external_id
             )
             VALUES ($1, $2, $3, $4, 'thuong', 'da_diem_danh', $5, $6, $7, $8, $9)
             ON CONFLICT (lop_id, ngay, gio_bat_dau) DO UPDATE SET
               gio_ket_thuc = EXCLUDED.gio_ket_thuc,
               external_id = COALESCE(edu_buoi_hoc.external_id, EXCLUDED.external_id)
             RETURNING id, (xmax = 0) AS inserted`,
            [
              lopId,
              item.ngay,
              sched.gioBatDau,
              sched.gioKetThuc,
              keHoachDay,
              kienThucMoi,
              giaoBtvn,
              keHoachBuoiSau,
              buoiExternalKey
            ]
          );
          buoiHocId = Number(sRes.rows[0].id);
          sessionIdMap.set(buoiExternalKey, buoiHocId);
          sessionIdMap.set(sessionKey, buoiHocId);
          if (sRes.rows[0].inserted) written.buoiHoc.inserted++;
          else written.buoiHoc.updated++;
        }

        const rawBtvn = getRecordValue(item.rec, item.table, ['làm btvn']);
        const daLamBtvn = rawBtvn === 1 || rawBtvn === '1' || rawBtvn === true;

        const rawNhanXet = getRecordText(item.rec, item.table, ['nhận xét']);
        const nhanXetStr = rawNhanXet ? rawNhanXet.slice(0, 500) : null;

        const rawYThuc = getRecordText(item.rec, item.table, ['ý thức']);
        const yThucNum = /^\d{1,2}$/.test(rawYThuc) ? Number(rawYThuc) : null;
        const yThucDiem = yThucNum !== null && yThucNum <= 10 ? yThucNum : null;

        const attRes = await client.query(
          `INSERT INTO edu_diem_danh (
             buoi_hoc_id, hoc_vien_id, trang_thai, da_lam_btvn, nhan_xet, external_id, y_thuc_diem, tinh_vao_so_du
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)
           ON CONFLICT (external_id) DO UPDATE SET
             trang_thai = EXCLUDED.trang_thai,
             da_lam_btvn = EXCLUDED.da_lam_btvn,
             nhan_xet = EXCLUDED.nhan_xet,
             y_thuc_diem = EXCLUDED.y_thuc_diem,
             buoi_hoc_id = EXCLUDED.buoi_hoc_id
           RETURNING id, (xmax = 0) AS inserted`,
          [buoiHocId, studentId, status, daLamBtvn, nhanXetStr, item.id, yThucDiem]
        );

        if (attRes.rows[0].inserted) written.diemDanh.inserted++;
        else written.diemDanh.updated++;
      }

      // 6. Sync Tuition Packages (edu_goi_hoc) with canonical 'lark:deal:<id>' and DEAL_RULES
      if (tableDealHp) {
        addLog({
          step: 'Sync Gói Học',
          status: 'in_progress',
          message: `Đang đồng bộ gói học hợp lệ từ bảng Deal HP (${tableDealHp.recordCount} dòng)...`,
          timestamp: new Date().toISOString()
        });

        const existingSoduStudents = new Set<number>();
        const soduRes = await client.query(
          `SELECT hoc_vien_id FROM edu_goi_hoc WHERE external_id LIKE 'lark:sodu:%'`
        );
        for (const r of soduRes.rows) {
          existingSoduStudents.add(Number(r.hoc_vien_id));
        }

        // Students whose attendance was already recorded under opening balance without deduction (diemDanhCuKhongTru)
        const existingHistoryStudents = new Set<number>();
        const histRes = await client.query(
          `SELECT DISTINCT hoc_vien_id FROM edu_diem_danh WHERE external_id IS NOT NULL AND tinh_vao_so_du = false`
        );
        for (const r of histRes.rows) {
          existingHistoryStudents.add(Number(r.hoc_vien_id));
        }

        const existingDealStudents = new Set<number>();
        const dealRes = await client.query(
          `SELECT DISTINCT hoc_vien_id FROM edu_goi_hoc WHERE external_id LIKE 'lark:deal:%' AND id IN (SELECT goi_hoc_id FROM edu_so_du_nhat_ky WHERE goi_hoc_id IS NOT NULL)`
        );
        for (const r of dealRes.rows) {
          existingDealStudents.add(Number(r.hoc_vien_id));
        }

        // Remove any unlogged deal packages that belong to history students
        await client.query(`
          DELETE FROM edu_goi_hoc
          WHERE external_id LIKE 'lark:deal:%'
            AND id NOT IN (SELECT goi_hoc_id FROM edu_so_du_nhat_ky WHERE goi_hoc_id IS NOT NULL)
            AND hoc_vien_id IN (SELECT DISTINCT hoc_vien_id FROM edu_diem_danh WHERE external_id IS NOT NULL AND tinh_vao_so_du = false)
        `);

        for (const rec of tableDealHp.records) {
          const studentKey = getRecordLink(rec, tableDealHp, ['học viên']);
          const studentId = studentKey ? studentIdMap.get(studentKey) : null;
          if (!studentId || !studentKey || !validStudentKeys.has(studentKey)) continue;

          // Skip if student already holds an opening balance package (lark:sodu:*) or history attendance without deal packages
          if (existingSoduStudents.has(studentId)) continue;
          if (existingHistoryStudents.has(studentId) && !existingDealStudents.has(studentId)) continue;

          const paidVal = getRecordValue(rec, tableDealHp, ['đã nộp']);
          const paid = Number(paidVal || 0) > 0;
          if (!paid) continue;

          const rawSoBuoi = getRecordValue(rec, tableDealHp, ['số buổi nộp']);
          const sessionsPaid = rawSoBuoi !== null && rawSoBuoi !== undefined && rawSoBuoi !== '' ? Number(rawSoBuoi) : NaN;
          if (!Number.isInteger(sessionsPaid)) continue;

          const rawUnrecorded = getRecordValue(rec, tableDealHp, ['số buổi đã học chưa thống kê']);
          const unrecorded = Number(rawUnrecorded || 0) || 0;
          const soBuoi = Math.max(0, sessionsPaid - unrecorded);
          if (soBuoi <= 0) continue;

          const rawNgayNop = getRecordValue(rec, tableDealHp, ['ngày nộp hp']);
          const rawNgayBatDau = getRecordValue(rec, tableDealHp, ['ngày bắt đầu']);
          const ngayMua = dateFromTimestampOrString(rawNgayNop) || dateFromTimestampOrString(rawNgayBatDau);
          if (!ngayMua) continue;

          const dealExtId = `lark:deal:${rec.id}`;
          const res = await client.query(
            `INSERT INTO edu_goi_hoc (
               hoc_vien_id, so_buoi, don_gia, thanh_tien, ngay_mua, trang_thai, nguoi_tao_id, external_id, loai, ghi_chu
             )
             VALUES ($1, $2, 0, 0, $3, 'hieu_luc', $4, $5, 'mua', 'chuyen_tu_lark')
             ON CONFLICT (external_id) DO UPDATE SET
               so_buoi = EXCLUDED.so_buoi,
               ngay_mua = EXCLUDED.ngay_mua
             RETURNING id, (xmax = 0) AS inserted`,
            [studentId, soBuoi, ngayMua, userId, dealExtId]
          );

          if (res.rows[0].inserted) written.goiHoc.inserted++;
          else written.goiHoc.updated++;
        }
      }

      // 7. Remove parents that have no linked valid students (matching ke-hoach.ts usedParents filter)
      await client.query(`
        DELETE FROM edu_phu_huynh
        WHERE external_id LIKE 'lark:%'
          AND id NOT IN (SELECT phu_huynh_id FROM edu_hoc_vien_phu_huynh)
      `);

      // 8. Reconcile student balances (so_buoi_con_lai) from edu_so_du_nhat_ky ledger
      await client.query(`
        UPDATE edu_hoc_vien h
        SET so_buoi_con_lai = COALESCE(
          (SELECT k.so_du_sau FROM edu_so_du_nhat_ky k WHERE k.hoc_vien_id = h.id ORDER BY k.id DESC LIMIT 1),
          0
        )
      `);

      let totalInserted = 0;
      let totalUpdated = 0;
      for (const counts of Object.values(written)) {
        totalInserted += counts.inserted;
        totalUpdated += counts.updated;
      }

      if (!dryRun) {
        const endTime = new Date();
        const summaryJson = {
          mode: 'commit',
          written: {
            coSo: written.coSo.inserted + written.coSo.updated,
            lop: written.lop.inserted + written.lop.updated,
            phuHuynh: written.phuHuynh.inserted + written.phuHuynh.updated,
            hocVien: written.hocVien.inserted + written.hocVien.updated,
            buoiHoc: written.buoiHoc.inserted + written.buoiHoc.updated,
            diemDanh: written.diemDanh.inserted + written.diemDanh.updated,
            goiHoc: written.goiHoc.inserted + written.goiHoc.updated
          },
          details: {
            inserted: totalInserted,
            updated: totalUpdated
          }
        };

        await client.query(
          `INSERT INTO edu_nhap_lark_nhat_ky (bat_dau_luc, ket_thuc_luc, nguoi_chay_id, trang_thai, tong_ket)
           VALUES ($1, $2, $3, 'thanh_cong', $4)`,
          [new Date(startTime), endTime, userId, JSON.stringify(summaryJson)]
        );

        await client.query('COMMIT');
        addLog({
          step: 'Transaction Commit',
          status: 'completed',
          message: `Đã commit thành công vào PostgreSQL. Thêm mới: ${totalInserted}, Cập nhật: ${totalUpdated}.`,
          timestamp: new Date().toISOString()
        });
      } else {
        await client.query('ROLLBACK');
        addLog({
          step: 'Dry-Run Rollback',
          status: 'completed',
          message: `[DRY-RUN] Đã kiểm tra mô phỏng hoàn tất và rollback an toàn. Sẽ thêm mới: ${totalInserted}, Sẽ cập nhật: ${totalUpdated}.`,
          timestamp: new Date().toISOString()
        });
      }

      const durationMs = Date.now() - startTime;
      return {
        success: true,
        dryRun,
        written,
        totalInserted,
        totalUpdated,
        logs,
        durationMs
      };
    } catch (err: unknown) {
      await client.query('ROLLBACK');
      const msg = err instanceof Error ? err.message : String(err);
      addLog({
        step: 'Database Error',
        status: 'failed',
        message: `Lỗi thao tác CSDL PostgreSQL: ${msg}`,
        timestamp: new Date().toISOString()
      });
      throw err;
    } finally {
      client.release();
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}
