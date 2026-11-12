export interface FormulaContext {
  tableNameMap?: Record<string, string>;
  fieldNameMap?: Record<string, Record<string, string>>; // tableId -> fieldId -> fieldName
  optionNameMap?: Record<string, Record<string, string>>; // fieldId -> optionId -> optionName
}

/**
 * Convert bitable formula with table/field/option IDs into a human-readable formula
 */
export function toReadableFormula(
  formula: string,
  currentTableId?: string,
  context?: FormulaContext
): string {
  if (!formula) return '';

  let res = formula;

  // Replace bitable prefix
  res = res.replace(/bitable::/g, '');

  // 1. Replace $table[tblId].$field[fldId]
  res = res.replace(/\$table\[([^\]]+)\]\.\$field\[([^\]]+)\]/g, (_, tblId, fldId) => {
    const tblName = context?.tableNameMap?.[tblId] || tblId;
    const fldName = context?.fieldNameMap?.[tblId]?.[fldId] || fldId;
    return `[${tblName}].[${fldName}]`;
  });

  // 2. Replace $column[fldId].$option[optId]
  res = res.replace(/\$column\[([^\]]+)\]\.\$option\[([^\]]+)\]/g, (_, fldId, optId) => {
    const optName = context?.optionNameMap?.[fldId]?.[optId] || optId;
    return `"${optName}"`;
  });

  // 3. Replace $table[tblId]
  res = res.replace(/\$table\[([^\]]+)\]/g, (_, tblId) => {
    const tblName = context?.tableNameMap?.[tblId] || tblId;
    return `[${tblName}]`;
  });

  // 4. Replace $field[fldId]
  res = res.replace(/\$field\[([^\]]+)\]/g, (_, fldId) => {
    const tblName = currentTableId && context?.tableNameMap?.[currentTableId] ? context.tableNameMap[currentTableId] : null;
    const fldName = (currentTableId && context?.fieldNameMap?.[currentTableId]?.[fldId]) || fldId;
    return tblName ? `[${tblName}].[${fldName}]` : `[${fldName}]`;
  });

  // 5. Replace $column[fldId]
  res = res.replace(/\$column\[([^\]]+)\]/g, (_, fldId) => {
    // If current table has field
    let fldName = currentTableId && context?.fieldNameMap?.[currentTableId]?.[fldId];
    if (!fldName && context?.fieldNameMap) {
      // Find across all tables
      for (const tMap of Object.values(context.fieldNameMap)) {
        if (tMap[fldId]) {
          fldName = tMap[fldId];
          break;
        }
      }
    }
    return `[${fldName || fldId}]`;
  });

  return res;
}

/**
 * Explain a formula into Vietnamese explanation
 */
export function explainFormulaInVietnamese(
  readableFormula: string,
  fieldName: string,
  tableName: string
): { explanation: string; needsConfirmation: boolean } {
  if (!readableFormula) {
    return { explanation: 'Không có công thức xác định.', needsConfirmation: true };
  }

  let text = '';
  let needsConfirmation = false;

  if (readableFormula.includes('.FILTER(')) {
    needsConfirmation = true;
    text = `Lọc dữ liệu từ bảng liên kết theo điều kiện khớp bản ghi hiện tại, sau đó tổng hợp/kết hợp danh sách giá trị.`;
  } else if (readableFormula.includes('IFS(') || readableFormula.includes('IF(')) {
    if (readableFormula.includes('NOW()') && (readableFormula.includes('ngày') || readableFormula.includes('Còn lại'))) {
      text = `Tính khoảng cách thời gian từ mốc hiện tại (NOW) đến hạn chót (Deadline): nếu còn hạn thì hiển thị số ngày/giờ còn lại, nếu quá hạn hiển thị số ngày/giờ quá hạn.`;
    } else {
      needsConfirmation = true;
      text = `Kiểm tra các nhánh điều kiện logic và trả về giá trị tương ứng theo từng trường hợp thỏa mãn.`;
    }
  } else if (readableFormula.includes('IFERROR(')) {
    text = `Tính biểu thức toán học hoặc tỷ lệ, nếu xảy ra lỗi (như chia cho 0 hoặc giá trị trống) thì trả về rỗng.`;
  } else if (readableFormula.includes('-') && !readableFormula.includes('FILTER')) {
    text = `Tính hiệu số giữa các trường giá trị (ví dụ: số lượng trừ đi phần đã dùng hoặc số dư còn lại).`;
  } else if (readableFormula.includes('+') && !readableFormula.includes('FILTER')) {
    text = `Tính tổng cộng các trường giá trị thành phần.`;
  } else {
    needsConfirmation = true;
    text = `Tính toán giá trị trường dựa trên biểu thức: \`${readableFormula}\`.`;
  }

  return { explanation: text, needsConfirmation };
}
