import { describe, it, expect } from 'vitest';
import {
  parseBaseFile,
  buildFixture,
  LarkFieldType,
  toReadableFormula,
  isSensitiveField,
  anonymizeName
} from '../src/index.js';

describe('Lark Base Core Parser & Decoder', () => {
  it('should generate fixture and parse correctly', () => {
    const fixtureJson = buildFixture({
      baseName: 'Dương Sinh Chess Club'
    });

    const result = parseBaseFile(fixtureJson);

    expect(result.base.name).toBe('Dương Sinh Chess Club');
    expect(result.tables.length).toBe(2);

    const classTable = result.tables.find(t => t.name === 'LopHoc');
    expect(classTable).toBeDefined();
    expect(classTable?.recordCount).toBe(2);
    expect(classTable?.records[0]?.cells['fldClassName']).toBe('Lớp Cờ 1');
    expect(classTable?.records[0]?.cells['fldBranch']).toBe('Kim Liên');

    const studentTable = result.tables.find(t => t.name === 'HocVien');
    expect(studentTable).toBeDefined();
    expect(studentTable?.recordCount).toBe(1);
    expect(studentTable?.records[0]?.cells['fldName']).toBe('Nguyễn Văn An');
    expect(studentTable?.records[0]?.cells['fldPhone']).toBe('0901234567');
    expect(studentTable?.records[0]?.cells['fldEmail']).toBe('parent@example.com');
    expect(studentTable?.records[0]?.cells['fldCccd']).toBe(123456789012);
    expect(studentTable?.records[0]?.cells['fldClassLink']).toEqual(['recClass1']);
    expect(studentTable?.records[0]?.cells['fldAutoId']).toBe('HV001');

    // Automations and dashboards
    expect(result.automations.length).toBe(1);
    expect(result.automations[0]?.name).toBe('Gửi thông báo điểm danh');
    expect(result.dashboards.length).toBe(1);
    expect(result.dashboards[0]?.name).toBe('Thống kê sĩ số');
    expect(result.roles.length).toBe(2);
  });

  it('should detect sensitive fields properly', () => {
    expect(isSensitiveField('Số điện thoại')).toBe(true);
    expect(isSensitiveField('SDT PH')).toBe(true);
    expect(isSensitiveField('email cá nhân')).toBe(true);
    expect(isSensitiveField('Mã định danh (CCCD)')).toBe(true);
    expect(isSensitiveField('Địa chỉ nơi ở')).toBe(true);
    expect(isSensitiveField('Ảnh tương tác ban đầu')).toBe(true);
    expect(isSensitiveField('Ảnh chụp bill')).toBe(true);
    expect(isSensitiveField('Tên lớp')).toBe(false);
    expect(isSensitiveField('Level')).toBe(false);
  });

  it('should anonymize personal names and redact sensitive fields', () => {
    expect(anonymizeName('Nguyễn Văn An')).toBe('N. V. An');
    expect(anonymizeName('Trần Thị B')).toBe('T. T. B');

    const fixtureJson = buildFixture();
    const result = parseBaseFile(fixtureJson, { anonymize: true });
    const studentTable = result.tables.find(t => t.name === 'HocVien');
    expect(studentTable?.records[0]?.cells['fldName']).toBe('N. V. An');
    expect(studentTable?.records[0]?.cells['fldPhone']).toBe('[REDACTED]');
    expect(studentTable?.records[0]?.cells['fldEmail']).toBe('[REDACTED]');
    expect(studentTable?.records[0]?.cells['fldCccd']).toBe('[REDACTED]');
  });

  it('should translate bitable formulas to readable format', () => {
    const rawFormula = 'bitable::$table[tbl1].$field[fldA] + bitable::$table[tbl1].$field[fldB]';
    const readable = toReadableFormula(rawFormula, 'tbl1', {
      tableNameMap: { tbl1: 'Deal HP' },
      fieldNameMap: { tbl1: { fldA: 'Học phí gốc', fldB: 'Phụ phí' } }
    });
    expect(readable).toBe('[Deal HP].[Học phí gốc] + [Deal HP].[Phụ phí]');
  });
});
