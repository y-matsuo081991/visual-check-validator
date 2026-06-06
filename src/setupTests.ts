import 'fake-indexeddb/auto';
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Canvas Web API モック (JSdom環境のサイレントエラー回避)
// JSDOMはデフォルトでCanvasをサポートしていないため、テスト出力に大量の警告が出ます。
HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation(() => {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })),
    getImageData: vi.fn(),
    putImageData: vi.fn(),
    createImageData: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    globalCompositeOperation: 'source-over',
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '10px sans-serif'
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

