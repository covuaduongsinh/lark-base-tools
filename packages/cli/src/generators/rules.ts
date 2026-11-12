import { type LarkTable, LarkFieldType, explainFormulaInVietnamese } from '@duongsinh/lark-base-core';

export function generateRulesMarkdown(tables: LarkTable[]): string {
  const lines: string[] = [
    '# Bảng Quy Tắc Tính Toán và Tra Cứu (Business Rules)',
    '',
    '> Tài liệu này tự động phân tích và giải thích toàn bộ các trường Công thức (Formula) và Tra cứu (Lookup) trong hệ thống Lark Base.',
    '> Các quy tắc có logic phức tạp hoặc phụ thuộc thời gian thực được gắn nhãn `[Cần xác nhận]` để rà soát khi đưa lên NocoEdu.',
    ''
  ];

  let totalFormulas = 0;
  let totalLookups = 0;

  for (const t of tables) {
    const formulaFields = t.fields.filter(f => f.type === LarkFieldType.Formula || f.type === LarkFieldType.Lookup);
    if (formulaFields.length === 0) continue;

    lines.push(`## Bảng: ${t.name} (${t.id})`);
    lines.push('');
    lines.push('| Tên Trường | Loại | Công thức đọc được | Diễn giải quy tắc nghiệp vụ | Trạng thái |');
    lines.push('|---|---|---|---|---|');

    for (const f of formulaFields) {
      if (f.type === LarkFieldType.Formula) {
        totalFormulas++;
        const readable = f.readableFormula || f.formula || '';
        const { explanation, needsConfirmation } = explainFormulaInVietnamese(readable, f.name, t.name);
        const statusBadge = needsConfirmation ? '⚠️ **[Cần xác nhận]**' : '✅ Đã rõ ràng';
        lines.push(`| **${f.name}** | Formula | \`${readable.replace(/\|/g, '\\|')}\` | ${explanation.replace(/\|/g, '\\|')} | ${statusBadge} |`);
      } else if (f.type === LarkFieldType.Lookup) {
        totalLookups++;
        const targetTbl = f.lookup?.targetTableId || f.property?.filterInfo?.targetTable || 'N/A';
        const targetFld = f.lookup?.targetFieldId || f.property?.targetField || 'N/A';
        const readable = f.readableFormula || f.formula || '';
        const statusBadge = '⚠️ **[Cần xác nhận]**';
        const explanation = `Tra cứu từ bảng \`${targetTbl}\`, trường đích \`${targetFld}\`${f.lookup?.rollup ? ` (Rollup: ${f.lookup.rollup})` : ''}. Cần thiết lập quan hệ n-1 hoặc 1-n trên NocoBase.`;
        lines.push(`| **${f.name}** | Lookup | \`${readable.replace(/\|/g, '\\|')}\` | ${explanation.replace(/\|/g, '\\|')} | ${statusBadge} |`);
      }
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`**Tổng số quy tắc:** ${totalFormulas} trường Công thức, ${totalLookups} trường Tra cứu.`);
  return lines.join('\n');
}
