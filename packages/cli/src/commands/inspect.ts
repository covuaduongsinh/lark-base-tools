import { parseBaseFile, isSensitiveField } from '@duongsinh/lark-base-core';
import fs from 'fs';

export async function inspectCommand(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) {
    console.error(`Lỗi: Không tìm thấy file: ${filePath}`);
    process.exit(1);
  }

  const stat = fs.statSync(filePath);
  const fileSizeMb = (stat.size / (1024 * 1024)).toFixed(2);

  const baseResult = parseBaseFile(filePath, { includeRecords: false });

  console.log('================================================================');
  console.log('              LARK BASE FILE INSPECTION SUMMARY                 ');
  console.log('================================================================');
  console.log(`📁 File:        ${filePath} (${fileSizeMb} MB)`);
  console.log(`🏷️  Base Name:   ${baseResult.base.name}`);
  console.log(`🆔 Base ID:     ${baseResult.base.id}`);
  console.log(`📊 Số bảng:     ${baseResult.tables.length}`);
  
  const totalRecords = baseResult.tables.reduce((sum, t) => sum + t.recordCount, 0);
  console.log(`🔢 Tổng bản ghi: ${totalRecords}`);
  console.log('----------------------------------------------------------------');

  const fieldTypeCounts: Record<string, number> = {};
  let totalSensitiveColumns = 0;

  console.log('DANH SÁCH BẢNG & CẢNH BÁO CỘT NHẠY CẢM:');
  for (const t of baseResult.tables) {
    const sensitiveCols: string[] = [];
    for (const f of t.fields) {
      fieldTypeCounts[f.typeName] = (fieldTypeCounts[f.typeName] || 0) + 1;
      if (isSensitiveField(f.name)) {
        sensitiveCols.push(`${f.name} [${f.typeName}]`);
        totalSensitiveColumns++;
      }
    }

    console.log(`• [${t.id}] ${t.name}: ${t.recordCount} records, ${t.fields.length} fields`);
    if (sensitiveCols.length > 0) {
      console.log(`   ⚠️ Cột nhạy cảm (${sensitiveCols.length}): ${sensitiveCols.join(', ')}`);
    }
  }

  console.log('----------------------------------------------------------------');
  console.log('PHÂN BỔ LOẠI TRƯỜNG DỮ LIỆU:');
  for (const [tName, count] of Object.entries(fieldTypeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${tName.padEnd(16)}: ${count} cột`);
  }

  console.log('----------------------------------------------------------------');
  console.log('MODULES MỞ RỘNG:');
  console.log(`  - Tự động hóa (Automations): ${baseResult.automations.length} quy trình`);
  console.log(`  - Bảng điều khiển (Dashboards): ${baseResult.dashboards.length} dashboard`);
  console.log(`  - Phân quyền (Roles):          ${baseResult.roles.length} vai trò`);
  console.log('----------------------------------------------------------------');
  if (totalSensitiveColumns > 0) {
    console.log(`🛡️  Tổng cộng phát hiện ${totalSensitiveColumns} cột chứa dữ liệu nhạy cảm.`);
    console.log('💡 Gợi ý: Hãy dùng lệnh `lark-base export --profile anonymized` để tự động loại trừ!');
  }
}
