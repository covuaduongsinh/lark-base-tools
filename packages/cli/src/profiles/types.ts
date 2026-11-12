export interface ExportProfile {
  name: string;
  description?: string;
  excludeTables?: string[];
  includeTables?: string[];
  excludeSensitiveFields?: boolean;
  excludeFields?: Record<string, string[]>; // table -> field names to exclude
  renameFields?: Record<string, Record<string, string>>; // table -> oldField -> newField
  anonymizeFields?: Record<string, string[]>; // table -> field names to abbreviate
  anonymizeAllNames?: boolean;
  resolveLinksAsForeignKeys?: boolean;
}
