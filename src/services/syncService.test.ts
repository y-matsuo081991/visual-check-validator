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
    const mockFn = vi.fn().mockImplementation(async () => {
      return { ok: true, status: 200 };
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

    expect(mockFn).toHaveBeenCalledTimes(2);
    expect(mockFn.mock.calls[0][0]).toContain('/api/health-check');
    expect(mockFn.mock.calls[1][0]).toContain('/api/sync-evidence');
  });

  it('MUST prevent race conditions by implementing a mutex lock', async () => {
    // 成功モックだが少し遅延させてロック期間を作る
    const mockFn = vi.fn().mockImplementation(async (url) => {
      if (url.includes('/api/health-check')) {
        return { ok: true, status: 200 };
      }
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
    // Mutexが効いていれば、ヘルスチェックと同期アップロードがそれぞれ1回ずつしか呼ばれない（計2回）
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('MUST retry with Exponential Backoff when network fails (Reliability RED test)', async () => {
    // 1回目、2回目は 500 エラー、3回目に 200 OK となるように fetch をモック
    // ヘルスチェックは無条件で 200 OK
    let attemptCount = 0;
    const mockFn = vi.fn().mockImplementation(async (url) => {
      if (url.includes('/api/health-check')) {
        return { ok: true, status: 200 };
      }
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
    // ヘルスチェック(1回) + 同期送信(リトライ2回 + 成功1回 = 3回) = 計4回
    expect(mockFn).toHaveBeenCalledTimes(4);
  });

  it('MUST queue and execute subsequent sync requests to prevent silent data loss (Queueing RED test)', async () => {
    // 送信されたペイロードをキャプチャする
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sentBodies: any[] = [];
    
    // ネットワーク遅延をシミュレート（1回目の同期処理が 300ms かかるようにする）
    const mockFn = vi.fn().mockImplementation(async (url, options) => {
      if (url.includes('/api/health-check')) {
        return { ok: true, status: 200 };
      }
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

  it('MUST perform an active health-check ping and halt sync if ping fails (Lie-Fi prevention RED test)', async () => {
    // URLに応じて異なる応答を返すモックを設定
    const mockFn = vi.fn().mockImplementation(async (url) => {
      if (url.includes('/api/health-check')) {
        // Ping疎通確認が失敗（Lie-Fi状態：インターネット繋がらず）
        return { ok: false, status: 500 };
      }
      if (url.includes('/api/sync-evidence')) {
        return { ok: true, status: 200 };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal('fetch', mockFn);

    await db.evidenceRecords.add({
      id: 'liefi-test-1', timestamp: Date.now(), syncStatus: 'pending',
      portNumber: 'MOCK', imageBlob: new Blob(), isMasked: true
    });

    // 実行。Ping失敗時に同期処理が中断され、エラーが投げられることを期待
    await expect(syncRecords()).rejects.toThrow();

    // 1. 同期処理が中断されているため、ステータスは pending のままであること
    const pendingCount = await db.evidenceRecords.where('syncStatus').equals('pending').count();
    expect(pendingCount).toBe(1);

    // 2. /api/health-check への Ping は実行されたが、/api/sync-evidence へのアップロードは一切呼び出されていないこと
    expect(mockFn).toHaveBeenCalled();
    const calledUrls = mockFn.mock.calls.map(args => args[0]);
    expect(calledUrls).toContain('/api/health-check');
    expect(calledUrls).not.toContain('/api/sync-evidence');
  });
});
