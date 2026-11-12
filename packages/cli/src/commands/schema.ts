import fs from 'fs';
import path from 'path';
import { parseBaseFile } from '@duongsinh/lark-base-core';
import { generateMermaidErDiagram } from '../generators/mermaid.js';
import { generateRulesMarkdown } from '../generators/rules.js';
import { generateAutomationsMarkdown } from '../generators/automations.js';

export async function schemaCommand(filePath: string, options: { out: string }): Promise<void> {
  if (!fs.existsSync(filePath)) {
    console.error(`Lỗi: Không tìm thấy file: ${filePath}`);
    process.exit(1);
  }

  const outDir = path.resolve(options.out || './schema');
  fs.mkdirSync(outDir, { recursive: true });

  const result = parseBaseFile(filePath, { includeRecords: false });

  // 1. Generate schema.md
  const schemaLines: string[] = [
    `# Cấu Trúc Cơ Sở Dữ Liệu: ${result.base.name}`,
    '',
    `> Base ID: \`${result.base.id}\` | Tổng số bảng: **${result.tables.length}**`,
    '',
    '## 1. Sơ Đồ Quan Hệ Thực Thể (Entity Relationship Diagram - Mermaid)',
    '',
    generateMermaidErDiagram(result.tables),
    '',
    '## 2. Chi Tiết Từng Bảng và Thuộc Tính',
    ''
  ];

  for (const t of result.tables) {
    schemaLines.push(`### ${t.name} (\`${t.id}\`)`);
    schemaLines.push(`- **Số trường:** ${t.fields.length}`);
    schemaLines.push(`- **Số bản ghi khai báo:** ${t.recordCount}`);
    schemaLines.push('');
    schemaLines.push('| STT | Tên Trường | Field ID | Loại Trường | Chi tiết / Liên kết |');
    schemaLines.push('|---|---|---|---|---|');

    t.fields.forEach((f, idx) => {
      let detail = '-';
      if (f.linkTableId) {
        detail = `Liên kết bảng: \`${f.linkTableId}\``;
      } else if (f.lookup) {
        detail = `Lookup từ: \`${f.lookup.targetTableId || ''}\` (cột: \`${f.lookup.targetFieldId || ''}\`)`;
      } else if (f.formula) {
        detail = `Công thức: \`${f.readableFormula || f.formula}\``;
      } else if (f.options && f.options.length > 0) {
        detail = `Tùy chọn (${f.options.length}): ${f.options.slice(0, 3).map(o => o.name).join(', ')}${f.options.length > 3 ? '...' : ''}`;
      }
      schemaLines.push(`| ${idx + 1} | **${f.name}** | \`${f.id}\` | ${f.typeName} | ${detail.replace(/\|/g, '\\|')} |`);
    });
    schemaLines.push('');
  }

  const schemaMdPath = path.join(outDir, 'schema.md');
  fs.writeFileSync(schemaMdPath, schemaLines.join('\n'), 'utf-8');

  // 2. Generate quy-tac.md
  const quyTacMdPath = path.join(outDir, 'quy-tac.md');
  fs.writeFileSync(quyTacMdPath, generateRulesMarkdown(result.tables), 'utf-8');

  // 3. Generate automations.md
  const autoMdPath = path.join(outDir, 'automations.md');
  fs.writeFileSync(autoMdPath, generateAutomationsMarkdown(result.automations), 'utf-8');

  // 4. Generate schema.json
  const schemaJsonPath = path.join(outDir, 'schema.json');
  const cleanSchema = {
    base: result.base,
    tables: result.tables.map(t => ({
      id: t.id,
      name: t.name,
      primaryKey: t.primaryKey,
      recordCount: t.recordCount,
      fields: t.fields,
      views: t.views
    })),
    automations: result.automations,
    dashboards: result.dashboards,
    roles: result.roles
  };
  fs.writeFileSync(schemaJsonPath, JSON.stringify(cleanSchema, null, 2), 'utf-8');

  console.log(`✅ Xuất thành công tài liệu schema tại thư mục: ${outDir}`);
  console.log(`   📄 ${schemaMdPath}`);
  console.log(`   📄 ${quyTacMdPath}`);
  console.log(`   📄 ${autoMdPath}`);
  console.log(`   📄 ${schemaJsonPath}`);
}
