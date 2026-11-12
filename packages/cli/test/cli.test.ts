import { describe, it, expect } from 'vitest';
import { buildFixture, parseBaseFile, LarkFieldType } from '@duongsinh/lark-base-core';
import { generateMermaidErDiagram } from '../src/generators/mermaid.js';
import { generateRulesMarkdown } from '../src/generators/rules.js';
import { generateAutomationsMarkdown } from '../src/generators/automations.js';
import { exportTableToCsv } from '../src/exporters/csv-exporter.js';
import { exportTableToJson } from '../src/exporters/json-exporter.js';
import { exportTablesToSqlite } from '../src/exporters/sqlite-exporter.js';
import { ANONYMIZED_PROFILE } from '../src/profiles/anonymized.js';

describe('CLI Generators and Exporters', () => {
  const fixtureJson = buildFixture();
  const parsed = parseBaseFile(fixtureJson);

  it('should generate valid Mermaid ERD diagram', () => {
    const erd = generateMermaidErDiagram(parsed.tables);
    expect(erd).toContain('```mermaid');
    expect(erd).toContain('erDiagram');
    expect(erd).toContain('HocVien }o--|| LopHoc :');
  });

  it('should generate business rules markdown', () => {
    const rules = generateRulesMarkdown(parsed.tables);
    expect(rules).toContain('# Bảng Quy Tắc Tính Toán và Tra Cứu');
  });

  it('should generate automations markdown', () => {
    const autoMd = generateAutomationsMarkdown(parsed.automations);
    expect(autoMd).toContain('Gửi thông báo điểm danh');
    expect(autoMd).toContain('setRecord');
  });

  it('should export table to CSV with UTF-8 BOM and exclude sensitive fields', () => {
    const studentTable = parsed.tables.find(t => t.name === 'HocVien')!;
    const csv = exportTableToCsv(studentTable, ANONYMIZED_PROFILE);

    // Starts with UTF-8 BOM
    expect(csv.startsWith('\uFEFF')).toBe(true);

    // Does NOT contain sensitive columns
    expect(csv).not.toContain('Email phụ huynh');
    expect(csv).not.toContain('parent@example.com');
    expect(csv).not.toContain('0901234567');
    expect(csv).not.toContain('123456789012');

    // Contains anonymized name
    expect(csv).toContain('N. V. An');
  });

  it('should export table to JSON excluding sensitive fields', () => {
    const studentTable = parsed.tables.find(t => t.name === 'HocVien')!;
    const jsonRecords = exportTableToJson(studentTable, ANONYMIZED_PROFILE);

    expect(jsonRecords.length).toBe(1);
    const first = jsonRecords[0]!;
    expect(first['Họ và tên']).toBe('N. V. An');
    expect(first['Số điện thoại']).toBeUndefined();
    expect(first['Email phụ huynh']).toBeUndefined();
    expect(first['Mã định danh (CCCD)']).toBeUndefined();
  });

  it('should export tables to SQLite database binary', async () => {
    const sqliteBytes = await exportTablesToSqlite(parsed.tables, ANONYMIZED_PROFILE);
    expect(sqliteBytes).toBeInstanceOf(Uint8Array);
    expect(sqliteBytes.length).toBeGreaterThan(0);

    // SQLite header starts with 'SQLite format 3\0'
    const header = Buffer.from(sqliteBytes.subarray(0, 16)).toString('utf-8');
    expect(header).toContain('SQLite format 3');
  });
});
