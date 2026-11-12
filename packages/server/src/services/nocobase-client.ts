import {
  type NocoCollectionDefinition,
  type NocoFieldDefinition,
  type NocoRecord,
  type MigrationStepLog
} from './types.js';

export interface NocoBaseClientOptions {
  baseUrl: string;
  apiKey?: string;
  dryRun?: boolean;
}

export class NocoBaseClient {
  private baseUrl: string;
  private apiKey?: string;
  private dryRun: boolean;

  constructor(options: NocoBaseClientOptions) {
    this.baseUrl = (options.baseUrl || 'http://localhost:13000').replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.dryRun = options.dryRun ?? false;
  }

  /**
   * Tests connection to NocoBase 3
   */
  public async testConnection(): Promise<{ ok: boolean; statusText: string }> {
    if (this.dryRun) {
      return { ok: true, statusText: 'Dry-run mode (Simulated connection OK)' };
    }
    try {
      const res = await fetch(`${this.baseUrl}/api/collections`, {
        method: 'GET',
        headers: this.getHeaders()
      });
      if (res.ok) {
        return { ok: true, statusText: 'Connection to NocoBase 3 established successfully' };
      }
      return { ok: false, statusText: `NocoBase responded with status ${res.status}: ${res.statusText}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, statusText: `Failed to reach NocoBase at ${this.baseUrl}: ${msg}` };
    }
  }

  /**
   * Creates or ensures a Collection exists in NocoBase 3
   */
  public async createCollection(
    def: NocoCollectionDefinition,
    logger?: (log: MigrationStepLog) => void
  ): Promise<boolean> {
    const log = (msg: string, status: MigrationStepLog['status'] = 'in_progress') => {
      logger?.({
        step: `Collection: ${def.name}`,
        status,
        message: msg,
        timestamp: new Date().toISOString()
      });
    };

    if (this.dryRun) {
      log(`[DRY-RUN] Simulating creation of collection '${def.name}' (${def.title})`, 'completed');
      return true;
    }

    try {
      // Step 1: Create Collection
      const payload = {
        name: def.name,
        title: def.title,
        description: def.description || ''
      };

      const res = await fetch(`${this.baseUrl}/api/collections`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload)
      });

      if (!res.ok && res.status !== 400) {
        // 400 often means collection already exists in NocoBase
        const errorText = await res.text();
        log(`Failed creating collection '${def.name}': ${errorText}`, 'warning');
      } else {
        log(`Created collection '${def.name}' successfully`, 'completed');
      }

      // Step 2: Create Fields
      for (const f of def.fields) {
        await this.createField(def.name, f, logger);
      }

      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Error creating collection '${def.name}': ${msg}`, 'failed');
      return false;
    }
  }

  /**
   * Creates a Field or Association inside a Collection
   */
  public async createField(
    collectionName: string,
    field: NocoFieldDefinition,
    logger?: (log: MigrationStepLog) => void
  ): Promise<boolean> {
    const log = (msg: string, status: MigrationStepLog['status'] = 'in_progress') => {
      logger?.({
        step: `Field: ${collectionName}.${field.name}`,
        status,
        message: msg,
        timestamp: new Date().toISOString()
      });
    };

    if (this.dryRun) {
      log(`[DRY-RUN] Simulating field '${collectionName}.${field.name}' (${field.type})`, 'completed');
      return true;
    }

    try {
      const payload: Record<string, unknown> = {
        name: field.name,
        type: field.type,
        uiSchema: field.uiSchema || {
          title: field.title,
          type: field.type === 'number' || field.type === 'integer' ? 'number' : 'string',
          'x-component': field.type === 'text' ? 'Input.TextArea' : 'Input'
        }
      };

      // Association fields (belongsTo, hasMany)
      if (field.type === 'belongsTo' || field.type === 'hasMany') {
        payload.target = field.target;
        payload.foreignKey = field.foreignKey;
        if (field.sourceKey) payload.sourceKey = field.sourceKey;
      }

      const res = await fetch(`${this.baseUrl}/api/collections/${collectionName}/fields`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload)
      });

      if (!res.ok && res.status !== 400) {
        const errorText = await res.text();
        log(`Field '${field.name}' creation warning: ${errorText}`, 'warning');
      } else {
        log(`Field '${collectionName}.${field.name}' initialized`, 'completed');
      }
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Field '${collectionName}.${field.name}' error: ${msg}`, 'warning');
      return false;
    }
  }

  /**
   * Batch inserts records into a collection
   */
  public async batchInsert(
    collectionName: string,
    records: NocoRecord[],
    batchSize = 50,
    logger?: (log: MigrationStepLog) => void
  ): Promise<number> {
    const log = (msg: string, status: MigrationStepLog['status'] = 'in_progress') => {
      logger?.({
        step: `Batch Insert: ${collectionName}`,
        status,
        message: msg,
        timestamp: new Date().toISOString()
      });
    };

    if (records.length === 0) return 0;

    if (this.dryRun) {
      log(`[DRY-RUN] Simulating batch insert of ${records.length} records into '${collectionName}'`, 'completed');
      return records.length;
    }

    let insertedCount = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      try {
        // NocoBase 3 supports batch create with array body or /api/:collection:create
        const res = await fetch(`${this.baseUrl}/api/${collectionName}:create`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(batch)
        });

        if (res.ok) {
          insertedCount += batch.length;
          log(`Inserted ${insertedCount}/${records.length} records into '${collectionName}'`);
        } else {
          // If bulk create is not enabled on the endpoint, fallback to sequential
          for (const item of batch) {
            const singleRes = await fetch(`${this.baseUrl}/api/${collectionName}`, {
              method: 'POST',
              headers: this.getHeaders(),
              body: JSON.stringify(item)
            });
            if (singleRes.ok) insertedCount++;
          }
          log(`Fallback single inserted ${insertedCount}/${records.length} records into '${collectionName}'`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`Error inserting batch ${i / batchSize + 1} into '${collectionName}': ${msg}`, 'warning');
      }
    }

    log(`Completed batch insert for '${collectionName}': ${insertedCount} records inserted`, 'completed');
    return insertedCount;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
      headers['x-api-key'] = this.apiKey;
    }
    return headers;
  }
}
