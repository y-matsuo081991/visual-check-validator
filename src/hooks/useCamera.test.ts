import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCamera } from './useCamera';

describe('useCamera hook', () => {
  const mockGetUserMedia = vi.fn();

  beforeEach(() => {
    // navigator.mediaDevices.getUserMedia のモック
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: mockGetUserMedia,
      },
      writable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize and call getUserMedia with environment facing mode (RED test)', async () => {
    // Arrange: モックストリームを返すように設定
    const mockStream = { getTracks: () => [{ stop: vi.fn() }] };
    mockGetUserMedia.mockResolvedValue(mockStream);

    // Act
    const { result } = renderHook(() => useCamera());

    // Assert: フックがストリームを取得できるまで待つなど（実装がないため落ちる）
    await act(async () => {
      // 実際の実装では startCamera() 的なメソッドを呼ぶか、マウント時に自動取得するか
      if (result.current.startCamera) {
        await result.current.startCamera();
      }
    });

    expect(mockGetUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({
          facingMode: 'environment', // アウトカメラを要求すること
        }),
      })
    );
    expect(result.current.stream).toBeDefined();
  });
});
