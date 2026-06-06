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

/**
 * 保留中のレコードをバックグラウンドで同期するシミュレーション
 */
export const syncRecords = async (): Promise<void> => {
  // ADR-005: バックグラウンド同期のレースコンディション防止（Mutex）
  if (isSyncing) {
    console.log('[Sync-Aware UX] Sync process is already running. Skipping.');
    return;
  }

  isSyncing = true;
  try {
    const pendingRecords = await db.evidenceRecords.where('syncStatus').equals('pending').toArray();
    if (pendingRecords.length === 0) return;
    
    // ネットワーク遅延のシミュレート
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 送信成功としてステータスを更新 (モック)
    await db.evidenceRecords.where('syncStatus').equals('pending').modify({ syncStatus: 'synced' });
    console.log('[Sync-Aware UX] Sync Complete: ' + pendingRecords.length + ' records synced.');
  } finally {
    // 処理完了（またはエラー）時に必ずロックを解除する
    isSyncing = false;
  }
};
