export interface NocoFieldDefinition {
  name: string;
  type: string;
  title: string;
  uiSchema?: {
    title: string;
    type?: string;
    'x-component'?: string;
    enum?: Array<{ value: string; label: string; color?: string }>;
  };
  target?: string;
  foreignKey?: string;
  sourceKey?: string;
}

export interface NocoCollectionDefinition {
  name: string;
  title: string;
  fields: NocoFieldDefinition[];
  description?: string;
}

export interface NocoRecord {
  id?: string | number;
  [key: string]: unknown;
}

export interface MigrationStepLog {
  step: string;
  status: 'pending' | 'in_progress' | 'completed' | 'warning' | 'failed';
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface MigrationResult {
  success: boolean;
  baseName: string;
  totalTablesParsed: number;
  totalRecordsProcessed: number;
  collectionsCreated: string[];
  fieldsCreated: number;
  recordsInserted: Record<string, number>;
  totalInserted?: number;
  totalUpdated?: number;
  ignoredTables: Array<{ id: string; name: string; reason: string }>;
  mergedTables: {
    target: string;
    sources: string[];
    recordCount: number;
  };
  logs: MigrationStepLog[];
  durationMs: number;
}

export interface MigrationOptions {
  nocobaseUrl?: string;
  nocobaseApiKey?: string;
  databaseUrl?: string;
  mode?: 'edu_tables' | 'nocobase_collections';
  dryRun?: boolean;
  anonymize?: boolean;
}

export interface TableSummary {
  id: string;
  name: string;
  recordCount: number;
  fieldCount: number;
  targetCollection?: string;
  isIgnored: boolean;
  ignoreReason?: string;
  isMerged?: boolean;
}

export interface InspectSummary {
  uploadId: string;
  baseId: string | number;
  baseName: string;
  totalTables: number;
  totalRecords: number;
  tables: TableSummary[];
  recommendedMapping: Record<string, string>;
  ignoredCount: number;
  mergedCount: number;
}
