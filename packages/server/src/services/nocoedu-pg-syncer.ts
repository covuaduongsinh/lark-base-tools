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

// Level key normalization
const LEVEL_MAP: Record<string, { key: string; order: number }> = {
  co: { key: 'co', order: 0 },
  tot: { key: 'tot', order: 1 },
  ma: { key: 'ma', order: 2 },
  tuong: { key: 'tuong', order: 3 },
  xe: { key: 'xe', order: 4 },
  hau: { key: 'hau', order: 5 },
  vua: { key: 'vua', order: 6 }
};

function normalizeLevel(raw: unknown): { key: string; order: number } {
  if (!raw) return { key: 'tot', order: 1 };
  const str = String(raw).toLowerCase().trim();
  for (const [k, v] of Object.entries(LEVEL_MAP)) {
    if (str.includes(k)) return v;
  }
  return { key: 'tot', order: 1 };
}

function parseAttendanceStatus(raw: unknown): string {
  if (raw === undefined || raw === null || raw === '') return 'co_mat';
  if (raw === 1 || raw === '1' || raw === true) return 'co_mat';
  if (raw === 0 || raw === '0' || raw === false) return 'vang_co_phep';
  const str = String(raw).toLowerCase().trim();
  if (str.includes('không phép') || str.includes('khong phep')) return 'vang_khong_phep';
  if (str.includes('có phép') || str.includes('co phep') || str.includes('vắng') || str.includes('vang')) return 'vang_co_phep';
  if (str.includes('có mặt') || str.includes('co mat') || str.includes('đủ') || str.includes('present')) return 'co_mat';
  return 'co_mat';
}

function parseBirthYear(raw: unknown): { namSinh: number; ngaySinh?: string } {
  if (!raw) return { namSinh: 2018 };
  const str = String(raw).trim();
  const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const isoDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    return { namSinh: parseInt(y, 10), ngaySinh: isoDate };
  }
  const yearMatch = /(\d{4})/.exec(str);
  if (yearMatch) {
    return { namSinh: parseInt(yearMatch[1], 10) };
  }
  return { namSinh: 2018 };
}

function parseSessionTime(rawCa: unknown): { gioBatDau: string; gioKetThuc: string } {
  if (!rawCa) return { gioBatDau: '18:00', gioKetThuc: '19:30' };
  const str = String(rawCa);
  const match = /\(\s*(\d{1,2})h(\d{2})\s*-\s*(\d{1,2})h(\d{2})\s*\)/i.exec(str);
  if (match) {
    const [, h1, m1, h2, m2] = match;
    return {
      gioBatDau: `${h1.padStart(2, '0')}:${m1}`,
      gioKetThuc: `${h2.padStart(2, '0')}:${m2}`
    };
  }
  return { gioBatDau: '18:00', gioKetThuc: '19:30' };
}

function parseDateToIso(rawDate: unknown): string {
  if (!rawDate) return new Date().toISOString().slice(0, 10);
  const str = String(rawDate).trim();
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function findField(table: LarkTable, keywords: string[]) {
  return table.fields.find(f => {
    const fName = f.name.toLowerCase().trim();
    return keywords.some(k => fName.includes(k.toLowerCase().trim()));
  });
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
    return val.map(v => (typeof v === 'object' && v && 'text' in v ? String((v as Record<string, unknown>).text) : String(v))).join(', ');
  }
  return String(val).trim();
}

function getRecordLink(rec: LarkRecord, table: LarkTable, keywords: string[]): string | null {
  const val = getRecordValue(rec, table, keywords);
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0];
    if (typeof first === 'string') return first;
    if (typeof first === 'object' && first && 'id' in first) return String((first as Record<string, unknown>).id);
    if (typeof first === 'object' && first && 'recordId' in first) return String((first as Record<string, unknown>).recordId);
  }
  if (typeof val === 'string') return val;
  return null;
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

      // Index tables by id & name
      const tablesById = new Map<string, LarkTable>();
      for (const t of baseResult.tables) {
        tablesById.set(t.id, t);
      }

      // Find specific tables
      const findTable = (id: string, keyword: string): LarkTable | undefined => {
        if (tablesById.has(id)) return tablesById.get(id);
        return baseResult.tables.find(t => t.name.toLowerCase().includes(keyword.toLowerCase()));
      };

      const tableLop = findTable('tblKvdbs97cDCMF9', 'lớp');
      const tableHocVien = findTable('tblv524wVlgIsH5H', 'học viên');
      const tablePhuHuynh = findTable('tblZUIXmpdt13j4x', 'phụ huynh') || findTable('tblZUIXmpdt13j4x', 'contact');
      const tableDealHp = findTable('tblHp1PGPz52eZBz', 'deal hp') || findTable('tblHp1PGPz52eZBz', 'học phí');

      // Find attendance tables (2024, 2025, 2026)
      const attendanceTables = baseResult.tables.filter(t =>
        t.id === 'tblprrzroE2NBli5' ||
        t.id === 'tbluhrY4B8i63PAh' ||
        t.id === 'tbl9TTf0m2EhWV3g' ||
        t.name.toLowerCase().includes('nhận xét mỗi buổi') ||
        t.name.toLowerCase().includes('điểm danh')
      );

      // Cache existing branches & classes
      const coSoRes = await client.query('SELECT id, ma, ten FROM edu_co_so ORDER BY id ASC');
      const branchIdMap = new Map<string, number>();
      for (const row of coSoRes.rows) {
        branchIdMap.set(String(row.id), row.id);
        branchIdMap.set(row.ten.toLowerCase(), row.id);
      }
      const defaultBranchId = coSoRes.rows[0]?.id || 1;

      // 1. Sync Classes (edu_lop)
      const classIdMap = new Map<string, number>(); // Lark recordId -> edu_lop.id
      if (tableLop) {
        addLog({
          step: 'Sync Lớp Học',
          status: 'in_progress',
          message: `Đang đồng bộ ${tableLop.recordCount} lớp học vào edu_lop...`,
          timestamp: new Date().toISOString()
        });

        for (const rec of tableLop.records) {
          const ten = getRecordText(rec, tableLop, ['tên lớp', 'lớp', 'name']) || `Lớp ${rec.id}`;
          const ma = getRecordText(rec, tableLop, ['mã lớp', 'code']) || `LH-${rec.id.slice(-6)}`;
          const levelInfo = normalizeLevel(getRecordText(rec, tableLop, ['level', 'cấp độ']));
          
          let coSoId = defaultBranchId;
          const coSoField = getRecordText(rec, tableLop, ['cơ sở', 'branch']);
          if (coSoField.includes('2')) coSoId = branchIdMap.get('cơ sở 2') || 2;
          else if (coSoField.includes('1')) coSoId = branchIdMap.get('cơ sở 1') || 1;

          const res = await client.query(
            `INSERT INTO edu_lop (ma, ten, co_so_id, level_key, level_order, trang_thai, external_id)
             VALUES ($1, $2, $3, $4, $5, 'dang_mo', $6)
             ON CONFLICT (external_id) DO UPDATE SET
               ten = EXCLUDED.ten,
               co_so_id = EXCLUDED.co_so_id,
               level_key = EXCLUDED.level_key,
               level_order = EXCLUDED.level_order
             RETURNING id, (xmax = 0) AS inserted`,
            [ma, ten, coSoId, levelInfo.key, levelInfo.order, rec.id]
          );

          const row = res.rows[0];
          classIdMap.set(rec.id, row.id);
          if (row.inserted) written.lop.inserted++;
          else written.lop.updated++;
        }
      }

      // Also load all existing edu_lop to classIdMap for fallback
      const existingLop = await client.query('SELECT id, external_id FROM edu_lop WHERE external_id IS NOT NULL');
      for (const row of existingLop.rows) {
        classIdMap.set(row.external_id, row.id);
      }

      // Default fallback class for attendance
      const defaultLopId = classIdMap.values().next().value || 1;

      // 2. Pre-analyze Attendance to deduce each student's current active class (latest session)
      const latestClassOfStudent = new Map<string, number>(); // Lark studentId -> edu_lop.id
      const latestDateOfStudent = new Map<string, string>(); // Lark studentId -> ISO date

      for (const attTable of attendanceTables) {
        for (const rec of attTable.records) {
          const studentLink = getRecordLink(rec, attTable, [
            'tên hs',
            'ten hs',
            'học viên',
            'hoc vien',
            'hocvien',
            'student',
            'tên học sinh'
          ]);
          if (!studentLink) continue;

          const lopLink = getRecordLink(rec, attTable, ['lớp', 'lớp học', 'class', 'lop']);
          const rawDate = getRecordValue(rec, attTable, [
            'ngày học - day format',
            'ngày học',
            'ngay hoc',
            'ngày',
            'date'
          ]);
          const ngay = parseDateToIso(rawDate);

          const curDate = latestDateOfStudent.get(studentLink);
          if (!curDate || ngay >= curDate) {
            latestDateOfStudent.set(studentLink, ngay);
            if (lopLink && classIdMap.has(lopLink)) {
              latestClassOfStudent.set(studentLink, classIdMap.get(lopLink)!);
            }
          }
        }
      }

      // 3. Sync Parents (edu_phu_huynh)
      const parentIdMap = new Map<string, number>(); // Lark recordId -> edu_phu_huynh.id
      if (tablePhuHuynh) {
        addLog({
          step: 'Sync Phụ Huynh',
          status: 'in_progress',
          message: `Đang đồng bộ ${tablePhuHuynh.recordCount} phụ huynh vào edu_phu_huynh...`,
          timestamp: new Date().toISOString()
        });

        for (const rec of tablePhuHuynh.records) {
          let hoTen = getRecordText(rec, tablePhuHuynh, ['họ và tên ph contact', 'họ tên', 'tên', 'name']) || 'Phụ huynh';
          if (anonymize) hoTen = anonymizeName(hoTen);
          const sdt = getRecordText(rec, tablePhuHuynh, ['số đt', 'số điện thoại', 'sđt', 'phone']) || '0900000000';
          const emailVal = getRecordText(rec, tablePhuHuynh, ['email']);
          const email = emailVal || null;
          const ma = `PH-${rec.id.slice(-6)}`;

          const res = await client.query(
            `INSERT INTO edu_phu_huynh (ma, ho_ten, so_dien_thoai, email, external_id)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (external_id) DO UPDATE SET
               ho_ten = EXCLUDED.ho_ten,
               so_dien_thoai = EXCLUDED.so_dien_thoai,
               email = COALESCE(EXCLUDED.email, edu_phu_huynh.email)
             RETURNING id, (xmax = 0) AS inserted`,
            [ma, hoTen, sdt, email, rec.id]
          );

          const row = res.rows[0];
          parentIdMap.set(rec.id, row.id);
          if (row.inserted) written.phuHuynh.inserted++;
          else written.phuHuynh.updated++;
        }
      }

      // 4. Sync Students (edu_hoc_vien)
      const studentIdMap = new Map<string, number>(); // Lark recordId -> edu_hoc_vien.id
      if (tableHocVien) {
        addLog({
          step: 'Sync Học Viên',
          status: 'in_progress',
          message: `Đang đồng bộ ${tableHocVien.recordCount} học viên vào edu_hoc_vien...`,
          timestamp: new Date().toISOString()
        });

        for (const rec of tableHocVien.records) {
          // In Lark Base, the student name column is 'Học viên'
          let hoTen = getRecordText(rec, tableHocVien, ['học viên', 'họ và tên', 'họ tên', 'tên học viên', 'name']);
          if (anonymize) hoTen = anonymizeName(hoTen);
          if (!hoTen) hoTen = 'Học viên';
          
          const rawBirth = getRecordValue(rec, tableHocVien, ['ngày sinh', 'năm sinh', 'dob']);
          const birthInfo = parseBirthYear(rawBirth);
          const levelInfo = normalizeLevel(getRecordText(rec, tableHocVien, ['trình độ hiện tại', 'level', 'cấp độ']));
          
          let coSoId = defaultBranchId;
          const coSoField = getRecordText(rec, tableHocVien, ['cơ sở', 'branch']);
          if (coSoField.includes('2')) coSoId = branchIdMap.get('cơ sở 2') || 2;
          else if (coSoField.includes('1')) coSoId = branchIdMap.get('cơ sở 1') || 1;

          // Determine student class from their most recent attendance session
          let lopId: number | null = latestClassOfStudent.get(rec.id) || null;
          if (!lopId) {
            const lopLink = getRecordLink(rec, tableHocVien, ['lớp', 'lớp học', 'class']);
            if (lopLink) lopId = classIdMap.get(lopLink) || null;
          }

          const rawSoBuoi = getRecordValue(rec, tableHocVien, ['số buổi tồn update', 'số buổi còn lại', 'tồn']);
          const soBuoiConLai = parseInt(String(rawSoBuoi || 0), 10) || 0;
          const maText = getRecordText(rec, tableHocVien, ['id học viên', 'mã hv', 'mã', 'code']);
          const ma = maText || `HS${String(rec.id).replace(/\D/g, '').slice(-5)}` || `HS-${rec.id.slice(-6)}`;
          const trangThai = getRecordText(rec, tableHocVien, ['tình trạng học', 'trạng thái', 'status']).toLowerCase().includes('thôi') ? 'thoi_hoc' : 'dang_hoc';

          const res = await client.query(
            `INSERT INTO edu_hoc_vien (
               ma, ho_ten, nam_sinh, level_key, level_order, co_so_id, lop_id,
               trang_thai, so_buoi_con_lai, external_id, external_code, ngay_sinh
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (external_id) DO UPDATE SET
               ho_ten = EXCLUDED.ho_ten,
               nam_sinh = EXCLUDED.nam_sinh,
               level_key = EXCLUDED.level_key,
               level_order = EXCLUDED.level_order,
               co_so_id = EXCLUDED.co_so_id,
               lop_id = COALESCE(EXCLUDED.lop_id, edu_hoc_vien.lop_id),
               trang_thai = EXCLUDED.trang_thai,
               so_buoi_con_lai = EXCLUDED.so_buoi_con_lai,
               ngay_sinh = COALESCE(EXCLUDED.ngay_sinh, edu_hoc_vien.ngay_sinh)
             RETURNING id, (xmax = 0) AS inserted`,
            [
              ma,
              hoTen,
              birthInfo.namSinh,
              levelInfo.key,
              levelInfo.order,
              coSoId,
              lopId,
              trangThai,
              soBuoiConLai,
              rec.id,
              ma,
              birthInfo.ngaySinh || null
            ]
          );

          const row = res.rows[0];
          studentIdMap.set(rec.id, row.id);
          if (row.inserted) written.hocVien.inserted++;
          else written.hocVien.updated++;
        }
      }

      // Also cache existing students to studentIdMap
      const existingStudents = await client.query('SELECT id, external_id FROM edu_hoc_vien WHERE external_id IS NOT NULL');
      for (const row of existingStudents.rows) {
        studentIdMap.set(row.external_id, row.id);
      }

      // 5. Sync Attendance & Sessions (edu_buoi_hoc & edu_diem_danh)
      let totalAttendanceRecords = 0;
      for (const attTable of attendanceTables) {
        totalAttendanceRecords += attTable.recordCount;
      }

      addLog({
        step: 'Sync Điểm Danh',
        status: 'in_progress',
        message: `Đang đồng bộ ${totalAttendanceRecords} lượt điểm danh từ ${attendanceTables.length} bảng (2024-2026)...`,
        timestamp: new Date().toISOString()
      });

      // Cache existing sessions by external_id and by `${lopId}|${ngay}|${gioBatDau}`
      const existingSessions = await client.query('SELECT id, lop_id, ngay, gio_bat_dau, external_id FROM edu_buoi_hoc');
      const sessionIdMap = new Map<string, number>();
      for (const row of existingSessions.rows) {
        sessionIdMap.set(`${row.lop_id}|${row.ngay}|${row.gio_bat_dau}`, row.id);
        if (row.external_id) {
          sessionIdMap.set(row.external_id, row.id);
        }
      }

      for (const attTable of attendanceTables) {
        for (const rec of attTable.records) {
          // Link to Student (Lark column is usually 'Tên HS' or 'Học viên')
          const studentLink = getRecordLink(rec, attTable, [
            'tên hs',
            'ten hs',
            'học viên',
            'hoc vien',
            'hocvien',
            'student',
            'tên học sinh'
          ]);
          const studentId = studentLink ? studentIdMap.get(studentLink) : null;

          if (!studentId) {
            continue; // Skip attendance if no associated student exists
          }

          // Link to Class
          let lopId = defaultLopId;
          const lopLink = getRecordLink(rec, attTable, ['lớp', 'lớp học', 'class', 'lop']);
          if (lopLink && classIdMap.has(lopLink)) {
            lopId = classIdMap.get(lopLink) || defaultLopId;
          }

          // Date & Time
          const rawDate = getRecordValue(rec, attTable, [
            'ngày học - day format',
            'ngày học',
            'ngay hoc',
            'ngày',
            'date'
          ]);
          const ngay = parseDateToIso(rawDate);
          const rawCa = getRecordValue(rec, attTable, ['ca học', 'ca dạy', 'ca', 'shift']);
          const timeInfo = parseSessionTime(rawCa);

          // Canonical Lark Session externalId: `lark:buoi:${lopLink}:${ngay}`
          const buoiExternalKey = lopLink ? `lark:buoi:${lopLink}:${ngay}` : `lark:buoi:${lopId}:${ngay}`;
          const sessionKey = `${lopId}|${ngay}|${timeInfo.gioBatDau}`;

          let buoiHocId = sessionIdMap.get(buoiExternalKey) || sessionIdMap.get(sessionKey);

          if (!buoiHocId) {
            const sRes = await client.query(
              `INSERT INTO edu_buoi_hoc (lop_id, ngay, gio_bat_dau, gio_ket_thuc, loai, trang_thai, external_id)
               VALUES ($1, $2, $3, $4, 'thuong', 'hoan_thanh', $5)
               ON CONFLICT (lop_id, ngay, gio_bat_dau) DO UPDATE SET
                 gio_ket_thuc = EXCLUDED.gio_ket_thuc,
                 external_id = COALESCE(edu_buoi_hoc.external_id, EXCLUDED.external_id)
               RETURNING id, (xmax = 0) AS inserted`,
              [lopId, ngay, timeInfo.gioBatDau, timeInfo.gioKetThuc, buoiExternalKey]
            );
            buoiHocId = sRes.rows[0].id as number;
            sessionIdMap.set(buoiExternalKey, buoiHocId);
            sessionIdMap.set(sessionKey, buoiHocId);
            if (sRes.rows[0].inserted) written.buoiHoc.inserted++;
            else written.buoiHoc.updated++;
          }

          // Attendance details: status
          const rawStatus = getRecordValue(rec, attTable, ['có mặt', 'co mat', 'điểm danh', 'trạng thái']);
          const status = parseAttendanceStatus(rawStatus);

          // Homework: Lark column 'Làm BTVN' (1 = done, 0 = not done)
          const rawBtvn = getRecordValue(rec, attTable, ['làm btvn', 'lam btvn', 'btvn', 'bài tập']);
          const daLamBtvn = rawBtvn === 1 || rawBtvn === '1' || rawBtvn === true;

          // Short feedback / comment: Lark column 'Nhận xét'
          const rawNhanXet = getRecordValue(rec, attTable, ['nhận xét', 'nhan xet', 'nhận xét buổi học', 'feedback', 'nhận xét ngắn']);
          const nhanXetStr = rawNhanXet ? String(rawNhanXet).slice(0, 500) : null;

          // Mindfulness score: Lark column 'Ý thức'
          const rawYThuc = getRecordValue(rec, attTable, ['điểm ý thức', 'ý thức', 'y thuc']);
          const yThucDiem = parseInt(String(rawYThuc || 0), 10) || null;

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
            [buoiHocId, studentId, status, daLamBtvn, nhanXetStr, rec.id, yThucDiem]
          );

          if (attRes.rows[0].inserted) written.diemDanh.inserted++;
          else written.diemDanh.updated++;
        }
      }

      addLog({
        step: 'Sync Điểm Danh Hoàn Tất',
        status: 'completed',
        message: `Đã xử lý điểm danh: Thêm mới ${written.diemDanh.inserted}, Cập nhật ${written.diemDanh.updated}, Buổi học tạo mới ${written.buoiHoc.inserted}.`,
        timestamp: new Date().toISOString()
      });

      // 6. Sync Tuition Packages (edu_goi_hoc)
      if (tableDealHp) {
        addLog({
          step: 'Sync Gói Học',
          status: 'in_progress',
          message: `Đang đồng bộ ${tableDealHp.recordCount} gói học từ bảng Deal HP...`,
          timestamp: new Date().toISOString()
        });

        for (const rec of tableDealHp.records) {
          const studentLink = getRecordLink(rec, tableDealHp, ['học viên', 'hocvien', 'student']);
          const studentId = studentLink ? studentIdMap.get(studentLink) : null;

          if (!studentId) continue;

          const rawSoBuoi = getRecordValue(rec, tableDealHp, ['số buổi nộp', 'số buổi', 'buổi']);
          const soBuoi = parseInt(String(rawSoBuoi || 10), 10) || 10;
          const rawTien = getRecordText(rec, tableDealHp, ['tổng tiền', 'thành tiền', 'số tiền']);
          const thanhTien = parseInt(rawTien.replace(/\D/g, ''), 10) || 0;
          const donGia = soBuoi > 0 ? Math.round(thanhTien / soBuoi) : 0;
          const rawNgayMua = getRecordValue(rec, tableDealHp, ['ngày nộp hp', 'ngày bắt đầu', 'ngày nộp', 'date']);
          const ngayMua = parseDateToIso(rawNgayMua);

          const res = await client.query(
            `INSERT INTO edu_goi_hoc (
               hoc_vien_id, so_buoi, don_gia, thanh_tien, ngay_mua, trang_thai, nguoi_tao_id, external_id, loai
             )
             VALUES ($1, $2, $3, $4, $5, 'hieu_luc', $6, $7, 'mua')
             ON CONFLICT (external_id) DO UPDATE SET
               so_buoi = EXCLUDED.so_buoi,
               don_gia = EXCLUDED.don_gia,
               thanh_tien = EXCLUDED.thanh_tien,
               ngay_mua = EXCLUDED.ngay_mua
             RETURNING id, (xmax = 0) AS inserted`,
            [studentId, soBuoi, donGia, thanhTien, ngayMua, userId, rec.id]
          );

          if (res.rows[0].inserted) written.goiHoc.inserted++;
          else written.goiHoc.updated++;
        }
      }

      // Compute totals
      let totalInserted = 0;
      let totalUpdated = 0;
      for (const counts of Object.values(written)) {
        totalInserted += counts.inserted;
        totalUpdated += counts.updated;
      }

      // Record Audit Log in edu_nhap_lark_nhat_ky
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
