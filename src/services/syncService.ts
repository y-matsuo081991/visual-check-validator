import { db } from '../models/database';

/**
 * モックレコードを保存する（オフライン時の蓄積シミュレーション）
 */
export const saveMockRecord = async (enableMasking: boolean): Promise<void> => {
  await db.evidenceRecords.add({
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
    timestamp: Date.now(),
    portNumber: 'MOCK-PORT-01',
    imageBlob: new Blob(['mock image data'], { type: 'image/jpeg' }),
    isMasked: enableMasking,
    syncStatus: 'pending'
  });
};

let isSyncing = false;
let needsSyncAgain = false;

/**
 * 保留中のレコードをバックグラウンドで同期するシミュレーション
 */
export const syncRecords = async (): Promise<void> => {
  if (isSyncing) {
    console.log('[Sync-Aware UX] Sync process is already running. Queued for next run.');
    needsSyncAgain = true;
    return;
  }

  isSyncing = true;
  try {
    const pendingRecords = await db.evidenceRecords.where('syncStatus').equals('pending').toArray();
    if (pendingRecords.length === 0) return;

    const pendingIds = pendingRecords.map(r => r.id);
    const maxRetries = 3;
    let attempt = 0;

    // PoC開発環境用のフォールバック: 
    // バックエンドAPIが未実装のローカル環境では、通信をシミュレートして成功扱いとする
    // ※テスト環境（Vitest）では実際のfetch挙動（リトライ・エラー等）を検証するためフォールバックさせない
    if (import.meta.env && import.meta.env.DEV && !import.meta.env.TEST) {
      console.log('[Sync-Aware UX] Running in DEV mode. Simulating API response...');
      await new Promise(resolve => setTimeout(resolve, 500));
      await db.evidenceRecords.where('id').anyOf(pendingIds).modify({ syncStatus: 'synced' });
      console.log('[Sync-Aware UX] Sync Complete (Mocked): ' + pendingRecords.length + ' records synced.');
      return;
    }

    // リトライ機構（Exponential Backoff with Jitter）の導入
    while (attempt <= maxRetries) {
      try {
        const response = await fetch('/api/sync-evidence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pendingRecords),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        // 送信成功としてステータスを更新
        // 【デグレ修正】同期中に新しく追加されたレコードまで一括更新（データロスト）しないよう、
        // 実際に送信した pendingIds だけを対象に更新する
        await db.evidenceRecords.where('id').anyOf(pendingIds).modify({ syncStatus: 'synced' });
        console.log('[Sync-Aware UX] Sync Complete: ' + pendingRecords.length + ' records synced.');
        break; // 成功したらループを抜ける

      } catch (error) {
        attempt++;
        if (attempt > maxRetries) {
          console.error('[Sync Error] Max retries reached. Sync failed.', error);
          throw error;
        }

        const baseDelay = 100 * (2 ** (attempt - 1));
        const jitter = Math.random() * 50; 
        const delay = baseDelay + jitter;

        console.warn(`[Sync-Aware UX] Sync failed. Retrying in ${Math.round(delay)}ms... (Attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } finally {
    isSyncing = false;
    
    // 同期中に別の同期要求が来ていた場合、非同期で再実行する（Queueing）
    if (needsSyncAgain) {
      needsSyncAgain = false;
      console.log('[Sync-Aware UX] Executing queued sync...');
      setTimeout(() => {
        syncRecords().catch(err => console.error('[Sync Error] Queued sync failed:', err));
      }, 0);
    }
  }
};
