import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { saveMockRecord, syncRecords } from './syncService';
import { db } from '../models/database';
import 'fake-indexeddb/auto'; // Dexieのテスト用モック

describe('syncService (Architecture Separation)', () => {
  beforeEach(async () => {
    // 各テスト前にDexieの中身をクリアする
    await db.evidenceRecords.clear();
    // fetchモックのリセット
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('MUST save a mock record with status "pending"', async () => {
    await saveMockRecord(true);
    
    const count = await db.evidenceRecords.count();
    expect(count).toBe(1);
    
    const records = await db.evidenceRecords.toArray();
    expect(records[0].syncStatus).toBe('pending');
    expect(records[0].isMasked).toBe(true);
  });

  it('MUST sync pending records and update their status to "synced"', async () => {
    // fetch が 200 OK を返すようにモック
    const mockFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', mockFn);

    await db.evidenceRecords.add({
      id: 'test-id-1',
      timestamp: Date.now(),
      portNumber: 'MOCK-PORT',
      imageBlob: new Blob([''], { type: 'image/jpeg' }),
      isMasked: false,
      syncStatus: 'pending'
    });

    await syncRecords();

    const pendingCount = await db.evidenceRecords.where('syncStatus').equals('pending').count();
    expect(pendingCount).toBe(0);

    const syncedCount = await db.evidenceRecords.where('syncStatus').equals('synced').count();
    expect(syncedCount).toBe(1);

    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('MUST prevent race conditions by implementing a mutex lock', async () => {
    // 成功モックだが少し遅延させてロック期間を作る
    const mockFn = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 100));
      return { ok: true, status: 200 };
    });
    vi.stubGlobal('fetch', mockFn);

    await db.evidenceRecords.bulkAdd([
      { id: 'uuid-race-1', timestamp: Date.now(), syncStatus: 'pending', portNumber: 'MOCK', imageBlob: new Blob(), isMasked: true },
    ]);

    const promise1 = syncRecords();
    const promise2 = syncRecords();
    const promise3 = syncRecords();

    await Promise.all([promise1, promise2, promise3]);

    const syncedCount = await db.evidenceRecords.where('syncStatus').equals('synced').count();
    expect(syncedCount).toBe(1);
    // Mutexが効いていれば fetch は1回しか呼ばれない
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('MUST retry with Exponential Backoff when network fails (Reliability RED test)', async () => {
    // 1回目、2回目は 500 エラー、3回目に 200 OK となるように fetch をモック
    let attemptCount = 0;
    const mockFn = vi.fn().mockImplementation(async () => {
      attemptCount++;
      if (attemptCount <= 2) {
        return { ok: false, status: 500 };
      }
      return { ok: true, status: 200 };
    });
    vi.stubGlobal('fetch', mockFn);

    await db.evidenceRecords.add({
      id: 'retry-test-1', timestamp: Date.now(), syncStatus: 'pending',
      portNumber: 'MOCK', imageBlob: new Blob(), isMasked: true
    });

    // 実行（リトライによって成功するはずなので例外は出ない）
    await syncRecords();

    const pendingCount = await db.evidenceRecords.where('syncStatus').equals('pending').count();
    const syncedCount = await db.evidenceRecords.where('syncStatus').equals('synced').count();
    
    expect(syncedCount).toBe(1);
    expect(pendingCount).toBe(0);
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('MUST queue and execute subsequent sync requests to prevent silent data loss (Queueing RED test)', async () => {
    // 送信されたペイロードをキャプチャする
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sentBodies: any[] = [];
    
    // ネットワーク遅延をシミュレート（1回目の同期処理が 300ms かかるようにする）
    const mockFn = vi.fn().mockImplementation(async (_url, options) => {
      sentBodies.push(JSON.parse(options.body));
      await new Promise(r => setTimeout(r, 300));
      return { ok: true, status: 200 };
    });
    vi.stubGlobal('fetch', mockFn);

    // 1件目のデータを追加
    await db.evidenceRecords.add({
      id: 'queue-test-1', timestamp: Date.now(), syncStatus: 'pending',
      portNumber: 'MOCK', imageBlob: new Blob(), isMasked: true
    });

    // 1回目の同期処理をバックグラウンドで開始（await しない）
    const firstSyncPromise = syncRecords();

    // 100ms 待つ（1回目の同期処理はまだ完了していない）
    await new Promise(r => setTimeout(r, 100));

    // その最中に、ユーザーが2件目のデータを保存したと仮定する
    await db.evidenceRecords.add({
      id: 'queue-test-2', timestamp: Date.now(), syncStatus: 'pending',
      portNumber: 'MOCK', imageBlob: new Blob(), isMasked: true
    });

    // 保存完了直後に、App.tsxから2回目の同期処理がキックされる
    const secondSyncPromise = syncRecords();

    // 両方のプロミス（同期呼び出し）が解決するのを待つ
    await Promise.all([firstSyncPromise, secondSyncPromise]);

    // さらにキューされた同期が非同期（setTimeout）で走る可能性を考慮して少し待つ
    await new Promise(r => setTimeout(r, 400));

    // 検証:
    // 現状のバグ実装では、1件目送信中に2件目が追加され、1件目完了時にDB上のすべての pending レコードが
    // synced に一括更新されてしまいます。そのため、2件目は「バックエンドに送信されていないのにローカルでは同期済み扱い」になり、
    // サイレントデータロストが発生します。

    const pendingCount = await db.evidenceRecords.where('syncStatus').equals('pending').count();
    const syncedCount = await db.evidenceRecords.where('syncStatus').equals('synced').count();

    expect(pendingCount).toBe(0);
    expect(syncedCount).toBe(2);

    // RED の真の証明:
    // 2つのレコードがDB上で synced になったのなら、必ずバックエンドに2つのレコードが送信されていなければならない。
    // sentBodies の中に、id が 'queue-test-2' のレコードが含まれているかを検証する。
    const allSentRecords = sentBodies.flat();
    const sentIds = allSentRecords.map(r => r.id);
    
    // 現在のバグでは、'queue-test-2' は送信されていないため FAIL する
    expect(sentIds).toContain('queue-test-1');
    expect(sentIds).toContain('queue-test-2');
  });
});
