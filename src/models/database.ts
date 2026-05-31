import Dexie, { type Table } from 'dexie';
import type { EvidenceRecord } from './EvidenceRecord';

export class VcvDatabase extends Dexie {
  evidenceRecords!: Table<EvidenceRecord, string>;

  constructor() {
    super('VcvDatabase');
    // IndexedDBのインデックス定義
    // idをプライマリキーとし、検索用に timestamp と syncStatus のインデックスを作成
    this.version(1).stores({
      evidenceRecords: 'id, timestamp, syncStatus'
    });
  }
}

// シングルトンインスタンスをエクスポート
export const db = new VcvDatabase();
