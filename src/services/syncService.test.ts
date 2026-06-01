import { describe, it, expect, beforeEach } from 'vitest';
import { saveMockRecord, syncRecords } from './syncService';
import { db } from '../models/database';
import 'fake-indexeddb/auto'; // Dexieのテスト用モック

describe('syncService (Architecture Separation)', () => {
  beforeEach(async () => {
    // 各テスト前にDexieの中身をクリアする
    await db.evidenceRecords.clear();
  });

  it('MUST save a mock record with status "pending" (RED test)', async () => {
    // まだ実装されていないため、この呼び出しは Error("Not implemented...") をスローして失敗する想定
    await saveMockRecord(true);
    
    const count = await db.evidenceRecords.count();
    expect(count).toBe(1);
    
    const records = await db.evidenceRecords.toArray();
    expect(records[0].syncStatus).toBe('pending');
    expect(records[0].isMasked).toBe(true);
  });

  it('MUST sync pending records and update their status to "synced" (RED test)', async () => {
    // モックデータの準備
    await db.evidenceRecords.add({
      id: 'test-id-1',
      timestamp: Date.now(),
      portNumber: 'MOCK-PORT',
      imageBlob: new Blob([''], { type: 'image/jpeg' }),
      isMasked: false,
      syncStatus: 'pending'
    });

    // 実行（未実装のためエラーで失敗する想定）
    await syncRecords();

    // 検証
    const pendingCount = await db.evidenceRecords.where('syncStatus').equals('pending').count();
    expect(pendingCount).toBe(0);

    const syncedCount = await db.evidenceRecords.where('syncStatus').equals('synced').count();
    expect(syncedCount).toBe(1);
  });
});
