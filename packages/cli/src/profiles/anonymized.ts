import { type ExportProfile } from './types.js';

export const ANONYMIZED_PROFILE: ExportProfile = {
  name: 'anonymized',
  description: 'Default anonymized export profile: excludes sensitive columns (CCCD, phone, email, address, photos, bills) and abbreviates personal names',
  excludeSensitiveFields: true,
  anonymizeAllNames: true,
  resolveLinksAsForeignKeys: true
};
