import fs from 'fs';
import { parseBaseFile } from '@duongsinh/lark-base-core';

export async function diffCommand(fileA: string, fileB: string): Promise<void> {
  if (!fs.existsSync(fileA)) {
    console.error(`Lỗi: Không tìm thấy file A: ${fileA}`);
    process.exit(1);
  }
  if (!fs.existsSync(fileB)) {
    console.error(`Lỗi: Không tìm thấy file B: ${fileB}`);
    process.exit(1);
  }

  const baseA = parseBaseFile(fileA, { includeRecords: false });
  const baseB = parseBaseFile(fileB, { includeRecords: false });

  console.log('================================================================');
  console.log('                 LARK BASE DIFFERENCE REPORT                    ');
  console.log('================================================================');
  console.log(`[A] Gốc:       ${fileA} (${baseA.base.name})`);
  console.log(`[B] Bản mới:   ${fileB} (${baseB.base.name})`);
  console.log('----------------------------------------------------------------');

  const tablesA = new Map(baseA.tables.map(t => [t.id, t]));
  const tablesB = new Map(baseB.tables.map(t => [t.id, t]));

  let hasDiff = false;

  // 1. Tables added in B
  const addedTables = baseB.tables.filter(t => !tablesA.has(t.id));
  if (addedTables.length > 0) {
    hasDiff = true;
    console.log(`➕ BẢNG MỚI THÊM TRONG [B] (${addedTables.length}):`);
    for (const t of addedTables) {
      console.log(`   + [${t.id}] "${t.name}" (${t.recordCount} bản ghi, ${t.fields.length} trường)`);
    }
  }

  // 2. Tables removed in B
  const removedTables = baseA.tables.filter(t => !tablesB.has(t.id));
  if (removedTables.length > 0) {
    hasDiff = true;
    console.log(`➖ BẢNG ĐÃ BỊ XÓA KHỎI [B] (${removedTables.length}):`);
    for (const t of removedTables) {
      console.log(`   - [${t.id}] "${t.name}" (trước đó có ${t.recordCount} bản ghi)`);
    }
  }

  // 3. Tables modified
  console.log('📊 THAY ĐỔI TRONG CÁC BẢNG HIỆN HỮU:');
  for (const tA of baseA.tables) {
    const tB = tablesB.get(tA.id);
    if (!tB) continue;

    const diffDetails: string[] = [];

    // Record count difference
    if (tA.recordCount !== tB.recordCount) {
      const delta = tB.recordCount - tA.recordCount;
      const sign = delta > 0 ? `+${delta}` : `${delta}`;
      diffDetails.push(`Số bản ghi: ${tA.recordCount} -> ${tB.recordCount} (${sign})`);
    }

    // Name difference
    if (tA.name !== tB.name) {
      diffDetails.push(`Đổi tên bảng: "${tA.name}" -> "${tB.name}"`);
    }

    // Field differences
    const fieldsA = new Map(tA.fields.map(f => [f.id, f]));
    const fieldsB = new Map(tB.fields.map(f => [f.id, f]));

    const addedFields = tB.fields.filter(f => !fieldsA.has(f.id));
    const removedFields = tA.fields.filter(f => !fieldsB.has(f.id));

    if (addedFields.length > 0) {
      diffDetails.push(`Thêm cột: ${addedFields.map(f => `+ "${f.name}" [${f.typeName}]`).join(', ')}`);
    }
    if (removedFields.length > 0) {
      diffDetails.push(`Xóa cột: ${removedFields.map(f => `- "${f.name}"`).join(', ')}`);
    }

    for (const fA of tA.fields) {
      const fB = fieldsB.get(fA.id);
      if (fB) {
        if (fA.type !== fB.type) {
          diffDetails.push(`Đổi kiểu cột "${fA.name}": [${fA.typeName}] -> [${fB.typeName}]`);
        }
        if (fA.name !== fB.name) {
          diffDetails.push(`Đổi tên cột: "${fA.name}" -> "${fB.name}"`);
        }
      }
    }

    if (diffDetails.length > 0) {
      hasDiff = true;
      console.log(`• [${tA.id}] ${tB.name}:`);
      for (const d of diffDetails) {
        console.log(`    ↳ ${d}`);
      }
    }
  }

  if (!hasDiff) {
    console.log('✅ Hai file cơ sở dữ liệu hoàn toàn giống nhau về cấu trúc và số bản ghi.');
  }
}
