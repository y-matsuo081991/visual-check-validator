import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCamera } from './useCamera';

describe('useCamera hook', () => {
  const mockGetUserMedia = vi.fn();

  beforeEach(() => {
    // navigator.mediaDevices.getUserMedia のモック
    Object.defineProperty(navigator, 'mediaDevices', {
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

  it('should not leak previous stream tracks when startCamera is called rapidly (RED test)', async () => {
    // Arrange: 異なるストリームを2回返すようにモック
    const mockTrack1 = { stop: vi.fn() };
    const mockStream1 = { getTracks: () => [mockTrack1] };
    const mockTrack2 = { stop: vi.fn() };
    const mockStream2 = { getTracks: () => [mockTrack2] };
    
    mockGetUserMedia
      .mockResolvedValueOnce(mockStream1)
      .mockResolvedValueOnce(mockStream2);

    const { result } = renderHook(() => useCamera());

    // Act: 連続して startCamera を呼ぶ
    await act(async () => {
      await result.current.startCamera();
      await result.current.startCamera();
    });

    // Assert: 古いストリーム(mockTrack1)が確実にstopされていること
    // 現状の実装はクロージャで古いstreamを参照しているためstopが呼ばれずテストが失敗(RED)する
    expect(mockTrack1.stop).toHaveBeenCalled();
  });
});
