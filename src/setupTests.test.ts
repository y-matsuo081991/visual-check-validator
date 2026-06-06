import { describe, it, expect, vi } from 'vitest';

describe('Zero-Warning Policy: Environment Setup', () => {
  it('MUST mock HTMLCanvasElement.getContext to prevent silent JSDOM warnings', () => {
    // TDD RED Phase: 
    // JSDOM環境ではCanvas APIがサポートされていないため、UIテスト時に大量の警告が発生します。
    // 「Zero-Warning Policy」に準拠するため、setupTests.ts にて
    // HTMLCanvasElement.prototype.getContext が確実にモック化されていることを要求します。
    
    const isMocked = vi.isMockFunction(HTMLCanvasElement.prototype.getContext);
    expect(isMocked).toBe(true);
  });
});
