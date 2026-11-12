import { type LarkBaseResult } from '@duongsinh/lark-base-core';
import { NocoEduMapper } from './nocoedu-mapper.js';
import { NocoBaseClient } from './nocobase-client.js';
import {
  type MigrationOptions,
  type MigrationResult,
  type MigrationStepLog
} from './types.js';

export class MigrationEngine {
  public static async run(
    baseResult: LarkBaseResult,
    options: MigrationOptions = {}
  ): Promise<MigrationResult> {
    const startTime = Date.now();
    const logs: MigrationStepLog[] = [];
    const addLog = (log: MigrationStepLog) => logs.push(log);

    addLog({
      step: 'Initialization',
      status: 'in_progress',
      message: `Bắt đầu tiến trình chuyển đổi Lark Base: "${baseResult.base.name}" sang NocoEdu (NocoBase 3)...`,
      timestamp: new Date().toISOString()
    });

    const anonymize = options.anonymize ?? true;
    const dryRun = options.dryRun ?? false;

    // Step 1: Mapping & Anonymization
    addLog({
      step: 'Mapping & Normalization',
      status: 'in_progress',
      message: `Đang chuẩn hóa schema, gộp 3 bảng điểm danh và ẩn danh hóa dữ liệu (anonymize=${anonymize})...`,
      timestamp: new Date().toISOString()
    });

    const mapped = NocoEduMapper.mapToNocoEdu(baseResult, anonymize);

    addLog({
      step: 'Mapping & Normalization',
      status: 'completed',
      message: `Chuẩn hóa hoàn tất: Đã định nghĩa ${mapped.collections.length} collections, gộp ${mapped.summary.mergedTables.sources.length} bảng điểm danh, loại trừ ${mapped.summary.ignoredTables.length} bảng rác.`,
      details: {
        mergedSources: mapped.summary.mergedTables.sources,
        ignoredCount: mapped.summary.ignoredTables.length,
        totalRecords: mapped.summary.totalRecords
      },
      timestamp: new Date().toISOString()
    });

    // Step 2: Initialize NocoBase 3 Client
    const nocoUrl = options.nocobaseUrl || process.env.NOCOBASE_URL || 'http://localhost:13000';
    const apiKey = options.nocobaseApiKey || process.env.NOCOBASE_API_KEY;

    const client = new NocoBaseClient({
      baseUrl: nocoUrl,
      apiKey,
      dryRun
    });

    const connTest = await client.testConnection();
    if (!connTest.ok) {
      addLog({
        step: 'Connection Check',
        status: 'warning',
        message: `Cảnh báo kết nối NocoBase: ${connTest.statusText}. Tiến trình tiếp tục với chế độ chịu lỗi.`,
        timestamp: new Date().toISOString()
      });
    } else {
      addLog({
        step: 'Connection Check',
        status: 'completed',
        message: `Kết nối thành công tới NocoBase 3 (${nocoUrl}).`,
        timestamp: new Date().toISOString()
      });
    }

    // Step 3: Create Collections and Fields
    const collectionsCreated: string[] = [];
    let fieldsCreated = 0;

    for (const colDef of mapped.collections) {
      await client.createCollection(colDef, addLog);
      collectionsCreated.push(colDef.name);
      fieldsCreated += colDef.fields.length;
    }

    // Step 4: Batch Insert Data in Strict Topological Order
    const insertionOrder = [
      'levels',
      'branches',
      'teachers',
      'parents',
      'classes',
      'students',
      'books',
      'tuition_deals',
      'attendances_feedbacks'
    ];

    const recordsInserted: Record<string, number> = {};

    for (const collName of insertionOrder) {
      const records = mapped.data[collName] || [];
      const count = await client.batchInsert(collName, records, 50, addLog);
      recordsInserted[collName] = count;
    }

    const durationMs = Date.now() - startTime;

    addLog({
      step: 'Finalization',
      status: 'completed',
      message: `Di chuyển hoàn tất trong ${durationMs}ms. Đã nạp thành công ${mapped.summary.totalRecords} bản ghi vào NocoEdu.`,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      baseName: baseResult.base.name,
      totalTablesParsed: baseResult.tables.length,
      totalRecordsProcessed: mapped.summary.totalRecords,
      collectionsCreated,
      fieldsCreated,
      recordsInserted,
      ignoredTables: mapped.summary.ignoredTables,
      mergedTables: mapped.summary.mergedTables,
      logs,
      durationMs
    };
  }
}
