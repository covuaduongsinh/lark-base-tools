import { Hono } from 'hono';
import { parseBaseFile } from '@duongsinh/lark-base-core';
import { uploadStorage } from '../services/storage.js';
import { NocoEduMapper } from '../services/nocoedu-mapper.js';
import { MigrationEngine } from '../services/migration-engine.js';
import { BaseExporterService } from '../services/exporter.js';

export const apiRouter = new Hono();

// Health check endpoint
apiRouter.get('/health', (c) => {
  return c.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: '0.1.0'
  });
});

// Server configuration & defaults for UI
apiRouter.get('/config', (c) => {
  const envUrl = process.env.NOCOBASE_URL || 'http://localhost:13000';
  const hasApiKey = Boolean(process.env.NOCOBASE_API_KEY);
  const hasAuth = Boolean(process.env.AUTH_USER && process.env.AUTH_PASS);

  return c.json({
    defaultNocobaseUrl: envUrl,
    hasApiKeyConfigured: hasApiKey,
    authProtected: hasAuth,
    environment: process.env.NODE_ENV || 'production'
  });
});

// Upload endpoint: accepts .base file via multipart/form-data or binary body
apiRouter.post('/upload', async (c) => {
  try {
    let fileBuffer: Buffer | null = null;
    let fileName = 'uploaded.base';

    const contentType = c.req.header('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const body = await c.req.parseBody();
      const file = body['file'];

      if (file && typeof file === 'object' && 'arrayBuffer' in file) {
        const ab = await (file as Blob).arrayBuffer();
        fileBuffer = Buffer.from(ab);
        if ('name' in file && typeof file.name === 'string') {
          fileName = file.name;
        }
      }
    } else {
      // Direct raw binary or base64 stream
      const ab = await c.req.arrayBuffer();
      if (ab.byteLength > 0) {
        fileBuffer = Buffer.from(ab);
      }
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return c.json({ error: 'Không tìm thấy file .base hợp lệ trong yêu cầu tải lên' }, 400);
    }

    // Store temporarily and parse
    const upload = uploadStorage.store(fileName, fileBuffer);
    const inspect = NocoEduMapper.inspectTables(upload.parsedResult);

    return c.json({
      success: true,
      uploadId: upload.id,
      fileName: upload.originalFileName,
      fileSize: upload.fileSize,
      baseId: upload.parsedResult.base.id,
      baseName: upload.parsedResult.base.name,
      totalTables: inspect.totalTables,
      totalRecords: inspect.totalRecords,
      ignoredCount: inspect.ignoredCount,
      mergedCount: inspect.mergedCount,
      tables: inspect.tables,
      recommendedMapping: inspect.recommendedMapping
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Lỗi khi xử lý file .base: ${msg}` }, 500);
  }
});

// Migration endpoint: triggers automated ETL into NocoBase 3
apiRouter.post('/migrate', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const uploadId = body.uploadId;

    if (!uploadId) {
      return c.json({ error: 'Thiếu uploadId' }, 400);
    }

    const upload = uploadStorage.get(uploadId);
    if (!upload) {
      return c.json({ error: 'Không tìm thấy phiên tải lên hoặc phiên đã hết hạn' }, 404);
    }

    const result = await MigrationEngine.run(upload.parsedResult, {
      nocobaseUrl: body.nocobaseUrl,
      nocobaseApiKey: body.nocobaseApiKey,
      databaseUrl: body.databaseUrl,
      mode: body.mode || 'edu_tables',
      dryRun: Boolean(body.dryRun),
      anonymize: Boolean(body.anonymize)
    });

    return c.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Lỗi trong quá trình di chuyển sang NocoBase: ${msg}` }, 500);
  }
});

// Export endpoint: download anonymized data in CSV, SQLite or JSON format
apiRouter.get('/export/:uploadId', async (c) => {
  try {
    const uploadId = c.req.param('uploadId');
    const format = (c.req.query('format') || 'json').toLowerCase();
    const collection = c.req.query('collection') || 'students';
    const anonymize = c.req.query('anonymize') !== 'false';

    const upload = uploadStorage.get(uploadId);
    if (!upload) {
      return c.json({ error: 'Không tìm thấy phiên tải lên hoặc phiên đã hết hạn' }, 404);
    }

    const baseSafeName = (upload.parsedResult.base.name || 'export')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_');

    if (format === 'json') {
      const data = BaseExporterService.exportToJson(upload.parsedResult, anonymize);
      c.header('Content-Disposition', `attachment; filename="${baseSafeName}_anonymized.json"`);
      return c.json(data);
    }

    if (format === 'csv') {
      const csvStr = BaseExporterService.exportToCsv(upload.parsedResult, collection, anonymize);
      c.header('Content-Type', 'text/csv; charset=utf-8');
      c.header('Content-Disposition', `attachment; filename="${collection}_anonymized.csv"`);
      return c.text(csvStr);
    }

    if (format === 'sqlite') {
      const sqliteBytes = await BaseExporterService.exportToSqlite(upload.parsedResult, anonymize);
      c.header('Content-Type', 'application/x-sqlite3');
      c.header('Content-Disposition', `attachment; filename="${baseSafeName}_nocoedu.sqlite"`);
      return c.body(sqliteBytes.buffer as ArrayBuffer);
    }

    return c.json({ error: `Định dạng "${format}" không hỗ trợ. Sử dụng: json, csv, sqlite.` }, 400);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Lỗi khi xuất dữ liệu: ${msg}` }, 500);
  }
});

// POST alias for export
apiRouter.post('/export', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const uploadId = body.uploadId;
  const format = body.format || 'json';
  const collection = body.collection || 'students';
  const anonymize = body.anonymize !== false;

  if (!uploadId) {
    return c.json({ error: 'Thiếu uploadId' }, 400);
  }

  const upload = uploadStorage.get(uploadId);
  if (!upload) {
    return c.json({ error: 'Không tìm thấy phiên tải lên' }, 404);
  }

  if (format === 'json') {
    const data = BaseExporterService.exportToJson(upload.parsedResult, anonymize);
    return c.json(data);
  }

  if (format === 'csv') {
    const csvStr = BaseExporterService.exportToCsv(upload.parsedResult, collection, anonymize);
    c.header('Content-Type', 'text/csv; charset=utf-8');
    return c.text(csvStr);
  }

  if (format === 'sqlite') {
    const sqliteBytes = await BaseExporterService.exportToSqlite(upload.parsedResult, anonymize);
    c.header('Content-Type', 'application/x-sqlite3');
    return c.body(sqliteBytes.buffer as ArrayBuffer);
  }

  return c.json({ error: 'Invalid format' }, 400);
});
