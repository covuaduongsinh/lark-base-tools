import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { type LarkBaseResult, parseBaseFile } from '@duongsinh/lark-base-core';

export interface StoredBaseUpload {
  id: string;
  originalFileName: string;
  fileSize: number;
  uploadedAt: Date;
  tempFilePath?: string;
  parsedResult: LarkBaseResult;
}

class UploadStorage {
  private uploads = new Map<string, StoredBaseUpload>();
  private tempDir: string;
  private ttlMs = 2 * 60 * 60 * 1000; // 2 hours

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'lark-base-uploads');
    try {
      fs.mkdirSync(this.tempDir, { recursive: true });
    } catch {
      // Ignore directory creation error
    }

    // Periodic cleanup of expired uploads
    setInterval(() => this.cleanup(), 15 * 60 * 1000).unref();
  }

  public store(fileName: string, buffer: Buffer): StoredBaseUpload {
    const id = crypto.randomUUID();
    const tempFilePath = path.join(this.tempDir, `${id}.base`);
    
    // Save to disk for durability and lower memory usage
    fs.writeFileSync(tempFilePath, buffer);

    // Parse the file
    const parsedResult = parseBaseFile(buffer, {
      includeRecords: true,
      anonymize: false // Keep raw initially; anonymization is applied on export/migrate
    });

    const record: StoredBaseUpload = {
      id,
      originalFileName: fileName,
      fileSize: buffer.length,
      uploadedAt: new Date(),
      tempFilePath,
      parsedResult
    };

    this.uploads.set(id, record);
    return record;
  }

  public get(id: string): StoredBaseUpload | undefined {
    return this.uploads.get(id);
  }

  public delete(id: string): boolean {
    const record = this.uploads.get(id);
    if (record?.tempFilePath && fs.existsSync(record.tempFilePath)) {
      try {
        fs.unlinkSync(record.tempFilePath);
      } catch {
        // ignore
      }
    }
    return this.uploads.delete(id);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, item] of this.uploads.entries()) {
      if (now - item.uploadedAt.getTime() > this.ttlMs) {
        this.delete(id);
      }
    }
  }
}

export const uploadStorage = new UploadStorage();
