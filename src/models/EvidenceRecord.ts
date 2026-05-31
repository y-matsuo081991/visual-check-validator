export interface EvidenceRecord {
  id: string; // UUID
  timestamp: number;
  portNumber: string;
  imageBlob: Blob;
  isMasked: boolean;
  syncStatus: 'pending' | 'synced' | 'failed';
}

// データベースクラス等の実装はまだ行わない（REDテストのため）
