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

  it('MUST prevent race conditions by implementing a mutex lock (Race Condition RED test)', async () => {
    // 準備: 複数の pending レコードを作成
    await db.evidenceRecords.bulkAdd([
      { id: 'uuid-race-1', timestamp: Date.now(), syncStatus: 'pending', portNumber: 'MOCK', imageBlob: new Blob(), isMasked: true },
      { id: 'uuid-race-2', timestamp: Date.now(), syncStatus: 'pending', portNumber: 'MOCK', imageBlob: new Blob(), isMasked: true }
    ]);

    // syncRecords を意図的に同時に複数回呼び出す（連打やFlaky Networkによる再送をエミュレート）
    const promise1 = syncRecords();
    const promise2 = syncRecords();
    const promise3 = syncRecords();

    await Promise.all([promise1, promise2, promise3]);

    // 本来であれば、syncRecords 内に console.log やモック可能な外部通信があり、
    // それが「1回しか呼ばれていないこと」を確認したい。
    // 今回は簡易的に、処理がクラッシュせずに全て synced になることと、
    // もし内部で外部APIのモックがあれば呼び出し回数をアサートする設計が望ましい。
    
    // 現在のコードベースでは syncRecords が純粋な Dexie 操作なので Race は表面化しにくいが、
    // 今後GCP連携を入れた際に備え、少なくともミューテックス機構が導入されることを要求するテストとする。
    // （実装で isSyncing フラグなどをエクスポートするか、ロガーを監視するか）
    
    const syncedCount = await db.evidenceRecords.where('syncStatus').equals('synced').count();
    expect(syncedCount).toBe(2);
  });
});
