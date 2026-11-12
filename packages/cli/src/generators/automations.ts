import { type LarkAutomation } from '@duongsinh/lark-base-core';

export function generateAutomationsMarkdown(automations: LarkAutomation[]): string {
  const lines: string[] = [
    '# Danh Sách và Cơ Chế Tự Động Hóa (Lark Automations)',
    '',
    '> Bảng phân tích chi tiết các kịch bản tự động hóa được thiết lập trong Lark Base.',
    '> Dùng để tái tạo luồng công việc tương ứng trong module Workflow của NocoBase.',
    ''
  ];

  if (automations.length === 0) {
    lines.push('Không có kịch bản tự động hóa nào được định nghĩa.');
    return lines.join('\n');
  }

  lines.push('| ID | Tên Kịch Bản | Trigger | Trạng thái | Diễn giải luồng xử lý | Tương đương NocoBase |');
  lines.push('|---|---|---|---|---|---|');

  for (const a of automations) {
    const raw = a.raw || {};
    const triggerName = a.triggerName || (raw.trigger_name as string) || 'N/A';
    const statusText = a.status === 1 ? '🟢 Đang bật (Active)' : '⚪ Đã tắt (Disabled)';
    
    let description = '';
    let nocoEquivalent = '';

    if (triggerName === 'setRecord') {
      description = 'Kích hoạt khi một bản ghi trong bảng được cập nhật giá trị (ví dụ: thay đổi trạng thái, cập nhật kết quả).';
      nocoEquivalent = 'Workflow Trigger: "Update record"';
    } else if (triggerName === 'addRecordV2' || triggerName === 'addRecord') {
      description = 'Kích hoạt ngay khi có bản ghi mới được tạo (ví dụ: phát sinh tương tác phụ huynh, deal mới).';
      nocoEquivalent = 'Workflow Trigger: "Create record"';
    } else if (triggerName === 'datetimeField') {
      description = 'Kích hoạt theo mốc thời gian hoặc lịch hẹn định kỳ (ví dụ: trước buổi học, định kỳ nhắc nhở).';
      nocoEquivalent = 'Workflow Trigger: "Schedule / Date condition"';
    } else {
      description = `Kích hoạt theo sự kiện \`${triggerName}\`.`;
      nocoEquivalent = 'Custom Workflow Event';
    }

    lines.push(`| \`${a.id}\` | **${a.name}** | \`${triggerName}\` | ${statusText} | ${description} | ${nocoEquivalent} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('### Hướng dẫn chuyển dịch sang NocoBase 3:');
  lines.push('1. Trong NocoBase, vào **Workflows**.');
  lines.push('2. Tạo mới workflow tương ứng với bảng đích.');
  lines.push('3. Cấu hình điều kiện lọc (Filter Conditions) tương đương với điều kiện ghi trong Lark.');
  lines.push('4. Thiết lập node hành động: Email notification / Webhook / Update related record.');

  return lines.join('\n');
}
