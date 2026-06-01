import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useInferenceLoop } from './useInferenceLoop';

describe('useInferenceLoop (Architecture Separation)', () => {
  const mockDetect = vi.fn();
  let time = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    time = performance.now();

    // requestAnimationFrame を同期的に進めるモック
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      // 5fps (200ms) のスロットリングを突破するために十分な時間を進める
      time += 250;
      setTimeout(() => cb(time), 0);
      return 1;
    });

    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    // HTMLVideoElement のモック
    const originalQuerySelector = document.querySelector.bind(document);
    vi.spyOn(document, 'querySelector').mockImplementation((selector) => {
      if (selector === 'video') {
        const video = document.createElement('video');
        Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
        Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });
        return video;
      }
      return originalQuerySelector(selector);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('MUST execute detect logic and update predictions when active (RED test)', async () => {
    // モックの返り値
    const dummyPredictions = [{ class: 'test', score: 0.9, bbox: [0,0,0,0] }];
    mockDetect.mockResolvedValue(dummyPredictions);

    // 未実装のため Error がスローされる、もしくは実行されない想定
    const { result } = renderHook(() => useInferenceLoop(true, true, mockDetect));

    // ループが数回回るのを待つ
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(mockDetect).toHaveBeenCalled();
    expect(result.current.predictions).toEqual(dummyPredictions);
  });

  it('MUST cancel the animation frame when unmounted or stopped (RED test)', async () => {
    mockDetect.mockResolvedValue([]);
    const { unmount } = renderHook(() => useInferenceLoop(true, true, mockDetect));

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    unmount();

    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
