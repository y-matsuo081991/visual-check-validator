import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useInferenceLoop } from './useInferenceLoop';

describe('useInferenceLoop (Architecture Separation)', () => {
  const mockDetect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // requestAnimationFrame を現実的な時間で進めるモック
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      // Vitestの環境下で、実時間ベースで呼び出すことで
      // setTimeout(500) と同期して 500ms 分だけ進むようにする
      const t = performance.now();
      setTimeout(() => cb(t), 16);
      return Math.floor(t);
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

  it('MUST throttle inference loop to approximately 10fps (100ms) to satisfy PoC Exit Criteria (PoC Audit RED test)', async () => {
    mockDetect.mockResolvedValue([]);
    // リセット
    mockDetect.mockClear();

    renderHook(() => useInferenceLoop(true, true, mockDetect));

    await act(async () => {
      // 500ms 経過させる
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    // RED: PoCのExit Criteria（0.1秒推論による待ち時間ゼロ）を満たすため、
    // スロットリングは 200ms(5fps) ではなく 100ms(10fps) でなければならない。
    // 500ms の間に約5回（テストのブレを考慮して4〜15回の間）呼ばれるべきだが、
    // 現状は 200ms 設定のため 2〜3 回しか呼ばれず RED になる。
    expect(mockDetect.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(mockDetect.mock.calls.length).toBeLessThanOrEqual(20);
  });

  it('MUST NOT restart loop if unmounted during async detect (ADR-008 RED test)', async () => {
    // ゾンビ化（メモリリーク）防止のテスト
    // 非同期処理中にアンマウントされた場合、その後の再ループが呼ばれないことを確認する
    mockDetect.mockClear();
    let resolveDetect: (val: unknown) => void;
    const detectPromise = new Promise(resolve => {
      resolveDetect = resolve;
    });
    mockDetect.mockReturnValue(detectPromise);

    const { unmount } = renderHook(() => useInferenceLoop(true, true, mockDetect));

    // ループが開始され、detect が1度呼ばれるのを待つ
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
    });

    expect(mockDetect).toHaveBeenCalled();

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

    // detectの待機中にコンポーネントを破棄する
    unmount();

    // アンマウント後にdetectを解決（完了）させる
    await act(async () => {
      resolveDetect!([]);
      // 非同期処理完了後の setState や 再ループのスケジューリングを待つ
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // ADR-008: アンマウント後はキャンセル済みとして扱われ、requestAnimationFrame は二度と呼ばれてはならない
    expect(rafSpy).not.toHaveBeenCalled();

    rafSpy.mockRestore();
  });
});
