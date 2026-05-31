import { describe, it, expect, beforeEach } from 'vitest';
import { VcvDatabase } from './database';
import type { EvidenceRecord } from './EvidenceRecord';

describe('EvidenceRecord Schema & Database', () => {
  let db: VcvDatabase;

  beforeEach(async () => {
    db = new VcvDatabase();
    // テスト間のデータ干渉を防ぐためクリア
    await db.evidenceRecords.clear();
  });

  it('should save and retrieve an EvidenceRecord correctly', async () => {
    // Arrange
    const dummyBlob = new Blob(['dummy image data'], { type: 'image/jpeg' });
    const record: EvidenceRecord = {
      id: 'uuid-1234',
      timestamp: Date.now(),
      portNumber: 'ge-0/0/1',
      imageBlob: dummyBlob,
      isMasked: true,
      syncStatus: 'pending'
    };

    // Act
    await db.evidenceRecords.add(record);
    const retrieved = await db.evidenceRecords.get('uuid-1234');

    // Assert
    expect(retrieved).toBeDefined();
    expect(retrieved?.portNumber).toBe('ge-0/0/1');
    expect(retrieved?.isMasked).toBe(true);
    expect(retrieved?.syncStatus).toBe('pending');
  });
});
