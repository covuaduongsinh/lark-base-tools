import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { parseBaseFile } from '@duongsinh/lark-base-core';
import { ANONYMIZED_PROFILE } from '../profiles/anonymized.js';
import { type ExportProfile } from '../profiles/types.js';
import { exportTableToCsv } from '../exporters/csv-exporter.js';
import { exportTableToJson } from '../exporters/json-exporter.js';
import { exportTablesToSqlite } from '../exporters/sqlite-exporter.js';

export interface ExportCommandOptions {
  out: string;
  format: 'json' | 'csv' | 'sqlite';
  profile?: string;
}

export async function exportCommand(
  filePath: string,
  options: ExportCommandOptions
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    console.error(`Lỗi: Không tìm thấy file: ${filePath}`);
    process.exit(1);
  }

  const outDir = path.resolve(options.out || './export');
  fs.mkdirSync(outDir, { recursive: true });

  // Load profile
  let profile: ExportProfile = ANONYMIZED_PROFILE;
  if (options.profile) {
    if (options.profile === 'anonymized') {
      profile = ANONYMIZED_PROFILE;
    } else if (fs.existsSync(options.profile)) {
      const content = fs.readFileSync(options.profile, 'utf-8');
      profile = yaml.load(content) as ExportProfile;
    } else {
      console.warn(`Cảnh báo: Không tìm thấy file profile "${options.profile}". Sử dụng profile "anonymized" mặc định.`);
    }
  }

  console.log(`Đang phân tích và giải mã file: ${filePath}...`);
  console.log(`Sử dụng export profile: "${profile.name}" (${profile.description || ''})`);

  const result = parseBaseFile(filePath, {
    includeRecords: true,
    anonymize: profile.anonymizeAllNames
  });

  const format = (options.format || 'csv').toLowerCase();

  if (format === 'csv') {
    for (const t of result.tables) {
      if (profile.excludeTables?.includes(t.name)) continue;
      if (profile.includeTables && !profile.includeTables.includes(t.name)) continue;

      const csvContent = exportTableToCsv(t, profile);
      const safeName = t.name.replace(/[\\/:*?"<>|]/g, '_');
      const targetFile = path.join(outDir, `${safeName}.csv`);
      fs.writeFileSync(targetFile, csvContent, 'utf-8');
    }
    console.log(`✅ Xuất thành công ${result.tables.length} bảng dạng CSV tại: ${outDir}`);
  } else if (format === 'json') {
    const fullExport: Record<string, unknown> = {};
    for (const t of result.tables) {
      if (profile.excludeTables?.includes(t.name)) continue;
      if (profile.includeTables && !profile.includeTables.includes(t.name)) continue;

      const jsonRecords = exportTableToJson(t, profile);
      const safeName = t.name.replace(/[\\/:*?"<>|]/g, '_');
      const targetFile = path.join(outDir, `${safeName}.json`);
      fs.writeFileSync(targetFile, JSON.stringify(jsonRecords, null, 2), 'utf-8');
      fullExport[t.name] = jsonRecords;
    }
    const allInOne = path.join(outDir, 'all_tables.json');
    fs.writeFileSync(allInOne, JSON.stringify(fullExport, null, 2), 'utf-8');
    console.log(`✅ Xuất thành công các bảng dạng JSON tại: ${outDir}`);
  } else if (format === 'sqlite') {
    const sqliteBinary = await exportTablesToSqlite(result.tables, profile);
    const targetFile = path.join(outDir, 'lark_base.sqlite');
    fs.writeFileSync(targetFile, Buffer.from(sqliteBinary));
    console.log(`✅ Xuất thành công cơ sở dữ liệu SQLite tại: ${targetFile}`);
  } else {
    console.error(`Lỗi: Định dạng xuất "${format}" không hỗ trợ. Chỉ chấp nhận: json, csv, sqlite.`);
    process.exit(1);
  }
}
