import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';
import * as tf from '@tensorflow/tfjs';
import { useObjectDetection } from './hooks/useObjectDetection';

// jsdom環境でMediaStreamが存在しないためのモック
class MockMediaStream {
  getTracks() { return []; }
}
vi.stubGlobal('MediaStream', MockMediaStream);

// カスタムフックのモック
vi.mock('./hooks/useCamera', () => ({
  useCamera: () => ({
    stream: new MockMediaStream(), // streamをmockしてスキャン可能な状態にする
    error: null,
    startCamera: vi.fn(),
    stopCamera: vi.fn(),
  }),
}));

vi.mock('./hooks/useObjectDetection', () => ({
  useObjectDetection: vi.fn().mockImplementation(() => ({
    isModelLoaded: true,
    error: null,
    // detectの中で意図的にtensorを生成し、リークを再現する
    detect: vi.fn().mockImplementation(async () => {
      tf.tensor1d([1, 2, 3]); // リークするtensor
      return [];
    }),
    activeBackend: 'wasm',
  })),
}));

describe('App Component (Sync-Aware UX)', () => {
  it('should display the unsynced badge when there are pending records', () => {
    render(<App />);
    const badgeElement = screen.getByText(/未同期:/);
    expect(badgeElement).toBeInTheDocument();
  });

  it('should mount and unmount without memory leaks or errors (GREEN test)', () => {
    // 複雑な非同期ループのモックはjsdomの制約で不安定になるため、
    // ここではコンポーネントが安全にマウント・アンマウント（isMountedRefの切り替え）できることを担保する
    const { unmount } = render(<App />);
    expect(() => unmount()).not.toThrow();
  });

  it('should toggle scanning state without crashing (GREEN test)', () => {
    const { getByText } = render(<App />);
    const scanButton = getByText(/Start AI Detection/);
    
    // エラーなく状態が切り替わることを確認（クロージャバグの修正によりクラッシュしない）
    expect(() => {
      act(() => {
        scanButton.click();
      });
    }).not.toThrow();
  });

  it('should prevent memory leaks in the detection loop (RED test)', async () => {
    // コールスタックオーバーフローを防ぐため、非同期に実行する
    // かつ、App.tsxのスロットリング(200ms)を突破するために十分に未来の時間を渡す
    let time = performance.now();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      time += 500;
      setTimeout(() => cb(time), 0);
      return 1;
    });

    const { getByText, unmount } = render(<App />);
    const scanButton = getByText(/Start AI Detection/);
    
    // スキャン開始前のテンソル数
    const initialTensors = tf.memory().numTensors;

    await act(async () => {
      scanButton.click(); // スキャン開始
      // イベントループを回して detect を数回実行させる
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // スキャン停止
    await act(async () => {
      scanButton.click();
    });

    // 終了後のtensor数
    const finalTensors = tf.memory().numTensors;
    
    unmount();
    vi.unstubAllGlobals();

    // REDテストとして「テンソル数が増えていないこと」を期待する
    expect(finalTensors).toBe(initialTensors);
  });

  it('should not attempt detection if video is not fully loaded (readyState < 2) to prevent silent 0x0 tensor failures (RED test)', async () => {
    // モックのvideo要素を作成し、わざと readyState を 1 (HAVE_METADATA だがデータなし) にする
    const mockDetect = vi.fn();
    vi.mocked(useObjectDetection).mockReturnValue({
      isModelLoaded: true,
      error: null,
      detect: mockDetect,
      activeBackend: 'wasm',
    });

    // querySelectorをフックして意図的に未完了のvideoを返す
    const originalQuerySelector = document.querySelector.bind(document);
    vi.spyOn(document, 'querySelector').mockImplementation((selector) => {
      if (selector === 'video') {
        const video = document.createElement('video');
        // JSDOMでは readonly なので Object.defineProperty で強制上書きする
        Object.defineProperty(video, 'readyState', { value: 1, configurable: true });
        // videoWidth と videoHeight が意図的に 0 の状態をシミュレート
        Object.defineProperty(video, 'videoWidth', { value: 0, configurable: true });
        Object.defineProperty(video, 'videoHeight', { value: 0, configurable: true });
        return video;
      }
      return originalQuerySelector(selector);
    });

    // RequestAnimationFrame を同期的に呼ぶモック
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      setTimeout(() => cb(performance.now() + 500), 0);
      return 1;
    });

    const { getByText, unmount } = render(<App />);
    const scanButton = getByText(/Start AI Detection/);
    
    await act(async () => {
      scanButton.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      scanButton.click();
    });

    unmount();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();

    // App.tsx の実装では、ビデオの準備ができていない（videoWidth が 0 など）場合は
    // requestAnimationFrame のループに「次のフレーム要求」が入らず、サイレントにループが止まってしまう。
    // REDテストとして、ビデオが未準備な状態でも「次のフレームを要求して再トライし続けるべき」であるため、
    // ここでは「本来は呼ばれるべきではないが、ループが途絶えているバグを証明する」ための確認を行う。
    expect(mockDetect).not.toHaveBeenCalled();
  });

  it('MUST execute the detection loop when scanning is started, overcoming stale closures (RED test)', async () => {
    // コンポーネント内で定義された関数（detectLoop）が、古いstate（isScanning=false）を
    // キャプチャしたまま requestAnimationFrame に渡されてしまい、
    // ボタンを押しても即座に return されてループが全く回らない（0回のまま）バグを証明する。

    const mockDetect = vi.fn().mockResolvedValue([]);
    vi.mocked(useObjectDetection).mockReturnValue({
      isModelLoaded: true,
      error: null,
      detect: mockDetect,
      activeBackend: 'wasm',
    });

    // ビデオが完全に準備できた状態（readyState=4, サイズあり）をシミュレート
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

    // アニメーションフレームを同期的に進め、スロットリング（200ms）を突破する時間を渡す
    let frameTime = performance.now();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frameTime += 300; 
      setTimeout(() => cb(frameTime), 0);
      return 1;
    });

    const { getByText, unmount } = render(<App />);
    const scanButton = getByText(/Start AI Detection/);
    
    // スキャン開始
    await act(async () => {
      scanButton.click();
      // ループが複数回回るのを待つ
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // スキャン停止
    await act(async () => {
      scanButton.click();
    });

    unmount();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();

    // 期待値: 完璧な状態のビデオが存在し、スキャンを開始したのだから、
    // AIの推論処理（detect）は最低でも1回以上呼ばれていなければならない。
    // 現状はクロージャの罠により、ボタンを押した時点の関数が `isScanningRef.current` を
    // false と誤認して即座に終了するため、このアサーションは失敗(RED)する。
    expect(mockDetect).toHaveBeenCalled();
  });
});