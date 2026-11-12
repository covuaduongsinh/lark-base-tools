import { describe, it, expect, beforeAll } from 'vitest';
import { createApp } from '../src/server.js';
import { buildFixture, LarkFieldType } from '@duongsinh/lark-base-core';
import { NocoEduMapper } from '../src/services/nocoedu-mapper.js';
import { parseBaseFile } from '@duongsinh/lark-base-core';

describe('Lark Base -> NocoEdu Server & ETL Pipeline', () => {
  const app = createApp();
  let sampleFixtureBase64: string;
  let sampleBuffer: Buffer;

  beforeAll(() => {
    // Build a realistic mock fixture representing the CLB Cờ Vua base
    sampleFixtureBase64 = buildFixture({
      baseName: 'CLB Cờ Vua Dương Sinh',
      tables: [
        {
          id: 'tblvjJoqGcHsoxQr',
          name: 'Level',
          fields: [
            { id: 'fldLvlName', name: 'Tên level', type: LarkFieldType.Text },
            { id: 'fldLvlCode', name: 'Mã', type: LarkFieldType.Text }
          ],
          records: [
            { fldLvlName: [{ text: 'Nhập môn', type: 'text' }], fldLvlCode: [{ text: 'INTRO', type: 'text' }] },
            { fldLvlName: [{ text: 'Sơ cấp', type: 'text' }], fldLvlCode: [{ text: 'ELEM', type: 'text' }] }
          ]
        },
        {
          id: 'tblmBDJ8bQSMqpNB',
          name: 'GiaoVien',
          fields: [
            { id: 'fldGvName', name: 'Họ và tên GV', type: LarkFieldType.Text },
            { id: 'fldGvPhone', name: 'Số điện thoại', type: LarkFieldType.Phone }
          ],
          records: [
            { fldGvName: [{ text: 'Thầy Trần Văn Bình', type: 'text' }], fldGvPhone: { fullPhoneNum: '0988776655' } }
          ]
        },
        {
          id: 'tblKvdbs97cDCMF9',
          name: 'LopHoc',
          fields: [
            { id: 'fldClassName', name: 'Tên lớp', type: LarkFieldType.Text },
            { id: 'fldClassSchedule', name: 'Lịch học', type: LarkFieldType.Text },
            { id: 'fldClassBranch', name: 'Cơ sở', type: LarkFieldType.Text }
          ],
          records: [
            {
              fldClassName: [{ text: 'Lớp Cờ Kim Liên T7', type: 'text' }],
              fldClassSchedule: [{ text: 'Thứ 7 08:30', type: 'text' }],
              fldClassBranch: [{ text: 'Cơ sở Kim Liên', type: 'text' }]
            }
          ]
        },
        {
          id: 'tblv524wVlgIsH5H',
          name: 'HocVien',
          fields: [
            { id: 'fldStudentName', name: 'Họ và tên học viên', type: LarkFieldType.Text },
            { id: 'fldParentName', name: 'Tên phụ huynh', type: LarkFieldType.Text },
            { id: 'fldParentPhone', name: 'Số ĐT PH', type: LarkFieldType.Phone },
            { id: 'fldDob', name: 'Ngày sinh', type: LarkFieldType.Text },
            { id: 'fldLichess', name: 'Tài khoản Lichess', type: LarkFieldType.Text }
          ],
          records: [
            {
              fldStudentName: [{ text: 'Nguyễn Minh Quân', type: 'text' }],
              fldParentName: [{ text: 'Nguyễn Văn Cường', type: 'text' }],
              fldParentPhone: { fullPhoneNum: '0912345678' },
              fldDob: [{ text: '2016-05-10', type: 'text' }],
              fldLichess: [{ text: 'minhquan_chess', type: 'text' }]
            }
          ]
        },
        {
          id: 'tblHp1PGPz52eZBz',
          name: 'Deal HP',
          fields: [
            { id: 'fldDealSessions', name: 'Số buổi nộp', type: LarkFieldType.Number },
            { id: 'fldDealFee', name: 'Học phí đã nộp', type: LarkFieldType.Number },
            { id: 'fldDealDate', name: 'Ngày nộp', type: LarkFieldType.Text }
          ],
          records: [
            {
              fldDealSessions: 24,
              fldDealFee: 3600000,
              fldDealDate: [{ text: '2025-01-10', type: 'text' }]
            }
          ]
        },
        // Attendance 2024
        {
          id: 'tblprrzroE2NBli5',
          name: '2024 Nhận xét mỗi buổi',
          fields: [
            { id: 'fldAttDate1', name: 'Ngày học', type: LarkFieldType.Text },
            { id: 'fldAttPresent1', name: 'Có mặt', type: LarkFieldType.SingleSelect },
            { id: 'fldAttComment1', name: 'Nhận xét', type: LarkFieldType.Text }
          ],
          records: [
            {
              fldAttDate1: [{ text: '2024-11-02', type: 'text' }],
              fldAttPresent1: '1',
              fldAttComment1: [{ text: 'Học viên Nguyễn Minh Quân tiếp thu tốt nước cờ mở', type: 'text' }]
            }
          ]
        },
        // Attendance 2025
        {
          id: 'tbluhrY4B8i63PAh',
          name: '2025 Nhận xét mỗi buổi',
          fields: [
            { id: 'fldAttDate2', name: 'Ngày học', type: LarkFieldType.Text },
            { id: 'fldAttPresent2', name: 'Có mặt', type: LarkFieldType.SingleSelect },
            { id: 'fldAttComment2', name: 'Nhận xét', type: LarkFieldType.Text }
          ],
          records: [
            {
              fldAttDate2: [{ text: '2025-01-11', type: 'text' }],
              fldAttPresent2: '0',
              fldAttComment2: [{ text: 'Vắng có phép', type: 'text' }]
            }
          ]
        },
        // Trash/Sample table
        {
          id: 'tbl009hP7msOu6bR',
          name: 'Lưu trữ - Số buổi tồn (không dùng)',
          fields: [{ id: 'fldOld', name: 'Ghi chú cũ', type: LarkFieldType.Text }],
          records: [{ fldOld: [{ text: 'Dữ liệu rác', type: 'text' }] }]
        }
      ]
    });

    sampleBuffer = Buffer.from(sampleFixtureBase64, 'utf-8');
  });

  it('GET /api/health should return ok and uptime', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.uptime).toBeGreaterThanOrEqual(0);
  });

  it('GET /api/config should return default configurations', async () => {
    const res = await app.request('/api/config');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.defaultNocobaseUrl).toBeDefined();
    expect(typeof json.authProtected).toBe('boolean');
  });

  it('POST /api/upload should parse .base file, identify merged attendances, and ignore trash tables', async () => {
    const formData = new FormData();
    const blob = new Blob([sampleBuffer], { type: 'application/octet-stream' });
    formData.append('file', blob, 'clb_test.base');

    const res = await app.request('/api/upload', {
      method: 'POST',
      body: formData
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.uploadId).toBeDefined();
    expect(json.baseName).toBe('CLB Cờ Vua Dương Sinh');
    expect(json.totalTables).toBe(8);
    expect(json.ignoredCount).toBe(1); // tbl009hP7msOu6bR ignored
    expect(json.mergedCount).toBe(2);  // 2024 and 2025 attendance merged

    // Verify table summaries
    const trashTable = json.tables.find((t: any) => t.id === 'tbl009hP7msOu6bR');
    expect(trashTable.isIgnored).toBe(true);

    const attTable = json.tables.find((t: any) => t.id === 'tblprrzroE2NBli5');
    expect(attTable.isMerged).toBe(true);
    expect(attTable.targetCollection).toBe('attendances_feedbacks');
  });

  it('NocoEduMapper should correctly map, normalize, deduplicate parents, and anonymize', () => {
    const parsed = parseBaseFile(sampleBuffer, { includeRecords: true });
    const mapped = NocoEduMapper.mapToNocoEdu(parsed, true);

    // Verify collections created
    expect(mapped.collections.length).toBe(9);
    const collectionNames = mapped.collections.map(c => c.name);
    expect(collectionNames).toContain('levels');
    expect(collectionNames).toContain('classes');
    expect(collectionNames).toContain('teachers');
    expect(collectionNames).toContain('students');
    expect(collectionNames).toContain('parents');
    expect(collectionNames).toContain('attendances_feedbacks');
    expect(collectionNames).toContain('tuition_deals');

    // Verify Parents extraction
    expect(mapped.data.parents.length).toBe(1);
    const parent = mapped.data.parents[0];
    expect(parent.phone).toContain('****'); // masked phone

    // Verify Students anonymization and parent link
    expect(mapped.data.students.length).toBe(1);
    const student = mapped.data.students[0];
    expect(student.parent_id).toBe(parent.id);
    expect(student.name).not.toBe('Nguyễn Minh Quân'); // anonymized

    // Verify Merged Attendances
    expect(mapped.data.attendances_feedbacks.length).toBe(2);
    const att1 = mapped.data.attendances_feedbacks[0];
    expect(att1.status).toBe('present'); // "1" mapped to present
    const att2 = mapped.data.attendances_feedbacks[1];
    expect(att2.status).toBe('absent_excused'); // "0" mapped to absent_excused
  });

  it('POST /api/migrate in dry-run mode should simulate complete ETL process', async () => {
    // 1. Upload first to get uploadId
    const formData = new FormData();
    const blob = new Blob([sampleBuffer], { type: 'application/octet-stream' });
    formData.append('file', blob, 'clb_test.base');

    const uploadRes = await app.request('/api/upload', {
      method: 'POST',
      body: formData
    });
    const uploadJson = await uploadRes.json();
    const uploadId = uploadJson.uploadId;

    // 2. Trigger Migration with dryRun: true
    const migrateRes = await app.request('/api/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId,
        nocobaseUrl: 'http://nocoedu:13000',
        dryRun: true,
        anonymize: true
      })
    });

    expect(migrateRes.status).toBe(200);
    const migrateJson = await migrateRes.json();
    expect(migrateJson.success).toBe(true);
    expect(migrateJson.collectionsCreated.length).toBe(9);
    expect(migrateJson.recordsInserted.attendances_feedbacks).toBe(2);
    expect(migrateJson.recordsInserted.parents).toBe(1);
    expect(migrateJson.recordsInserted.students).toBe(1);
    expect(migrateJson.logs.length).toBeGreaterThan(5);
  });

  it('GET /api/export/:uploadId should support JSON, CSV and SQLite', async () => {
    // Upload first
    const formData = new FormData();
    const blob = new Blob([sampleBuffer], { type: 'application/octet-stream' });
    formData.append('file', blob, 'clb_test.base');
    const uploadRes = await app.request('/api/upload', { method: 'POST', body: formData });
    const { uploadId } = await uploadRes.json();

    // 1. JSON Export
    const jsonRes = await app.request(`/api/export/${uploadId}?format=json`);
    expect(jsonRes.status).toBe(200);
    const exportedJson = await jsonRes.json();
    expect(exportedJson.students).toBeDefined();
    expect(exportedJson.attendances_feedbacks).toBeDefined();

    // 2. CSV Export
    const csvRes = await app.request(`/api/export/${uploadId}?format=csv&collection=students`);
    expect(csvRes.status).toBe(200);
    const csvText = await csvRes.text();
    expect(csvText).toContain('id');
    expect(csvText).toContain('name');

    // 3. SQLite Export
    const sqliteRes = await app.request(`/api/export/${uploadId}?format=sqlite`);
    expect(sqliteRes.status).toBe(200);
    const sqliteBuf = await sqliteRes.arrayBuffer();
    expect(sqliteBuf.byteLength).toBeGreaterThan(100);
  });
});
