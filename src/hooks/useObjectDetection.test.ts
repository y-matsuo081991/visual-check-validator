import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { useObjectDetection } from './useObjectDetection';

// coco-ssd モジュールのモック
vi.mock('@tensorflow-models/coco-ssd', () => ({
  load: vi.fn(),
}));

describe('useObjectDetection hook', () => {
  const mockDetect = vi.fn();
  const mockModel = {
    detect: mockDetect,
  };

  beforeEach(() => {
    vi.mocked(cocoSsd.load).mockResolvedValue(mockModel as unknown as cocoSsd.ObjectDetection);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should load coco-ssd model and expose detect logic (RED test)', async () => {
    // Act
    const { result } = renderHook(() => useObjectDetection());

    // Assert: 初期状態では isModelLoaded は false
    expect(result.current.isModelLoaded).toBe(false);

    // モデルロードを待つ
    await act(async () => {
      // 内部の useEffect 等でロードされるのを待つため、Promise.resolve()でマクロタスクを回す
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Assert: load が呼ばれ、状態が更新されること
    expect(cocoSsd.load).toHaveBeenCalled();
    expect(result.current.isModelLoaded).toBe(true);
  });
});
