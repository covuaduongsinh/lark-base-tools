export const SENSITIVE_KEYWORDS = [
  'cccd',
  'cmnd',
  'định danh',
  'dinh danh',
  'email',
  'điện thoại',
  'dien thoai',
  'sdt',
  'sđt',
  'đt',
  'dt',
  'zalo',
  'phone',
  'ảnh',
  'anh',
  'địa chỉ',
  'dia chi',
  'bill'
];

/**
 * Checks if a field name is likely sensitive
 */
export function isSensitiveField(fieldName: string): boolean {
  if (!fieldName) return false;
  const lower = fieldName.toLowerCase().trim();
  
  // Specific words or substrings
  for (const kw of SENSITIVE_KEYWORDS) {
    if (kw.length <= 2) {
      // For short words like 'dt', 'đt', match whole word or surrounded by space/punctuation
      const regex = new RegExp(`(^|[\\s_.,/-])${kw}([\\s_.,/-]|$)`, 'i');
      if (regex.test(lower)) return true;
    } else {
      if (lower.includes(kw)) return true;
    }
  }
  return false;
}

/**
 * Anonymize personal full names to abbreviations (e.g., "Nguyễn Văn An" -> "N. V. An")
 */
export function anonymizeName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] || '';
  
  // Abbreviate all except the last name or keep first letters
  const abbreviated = parts.map((part, index) => {
    if (index === parts.length - 1) {
      return part; // keep last given name
    }
    return part.charAt(0).toUpperCase() + '.';
  });
  return abbreviated.join(' ');
}
