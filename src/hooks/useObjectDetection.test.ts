import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as tf from '@tensorflow/tfjs';
import { useObjectDetection } from './useObjectDetection';

// モックの設定
vi.mock('@tensorflow-models/coco-ssd', () => ({
  load: vi.fn(),
}));

vi.mock('@tensorflow/tfjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tensorflow/tfjs')>();
  return {
    ...actual,
    setBackend: vi.fn().mockResolvedValue(true),
    getBackend: vi.fn().mockReturnValue('wasm'),
    ready: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('@tensorflow/tfjs-backend-wasm', () => ({
  setWasmPaths: vi.fn(),
}));

describe('useObjectDetection hook', () => {
  const mockDetect = vi.fn();
  const mockModel = {
    detect: mockDetect,
    dispose: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(cocoSsd.load).mockResolvedValue(mockModel as unknown as cocoSsd.ObjectDetection);
    vi.mocked(tf.getBackend).mockReturnValue('wasm'); // 初期化時にWASMと判定させる
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should load coco-ssd model and expose detect logic', async () => {
    const { result } = renderHook(() => useObjectDetection());
    expect(result.current.isModelLoaded).toBe(false);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(cocoSsd.load).toHaveBeenCalled();
    expect(result.current.isModelLoaded).toBe(true);
  });

  it('should attempt to load WASM backend if specified or fallback (GREEN test)', async () => {
    const { result } = renderHook(() => useObjectDetection());
    
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // tf.getBackend のモックが 'wasm' を返すため、activeBackend は 'wasm' になるはず
    expect(result.current.activeBackend).toBe('wasm');
  });

  it('should configure WASM paths with exact version from package.json (RED test)', async () => {
    renderHook(() => useObjectDetection());
    
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const wasmModule = await import('@tensorflow/tfjs-backend-wasm');
    expect(wasmModule.setWasmPaths).toHaveBeenCalled();
    
    // CDNパスが `latest` ではなく、package.jsonのバージョン (4.22.0) に固定されていることを確認
    expect(wasmModule.setWasmPaths).toHaveBeenCalledWith(
      expect.stringContaining('@tensorflow/tfjs-backend-wasm@4.22.0')
    );
  });

  it('should not leak memory (tensors) during asynchronous detect calls (RED test)', async () => {
    // モックモデルが呼ばれた際に、内部で意図的にテンソルを生成してリークをシミュレートする
    // (実際の coco-ssd.detect 内部で HTMLVideoElement がテンソル化される挙動の再現)
    mockDetect.mockImplementationOnce(async () => {
      tf.tensor1d([1, 2, 3]); // このテンソルが解放されるかをテストする
      return [];
    });

    const { result } = renderHook(() => useObjectDetection());
    
    // モデルロードを待機
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const initialTensors = tf.memory().numTensors;
    const dummyVideo = document.createElement('video');

    await act(async () => {
      await result.current.detect(dummyVideo);
    });

    const finalTensors = tf.memory().numTensors;
    
    // 正しい実装(try...finally + dispose)により、非同期内部のテンソルは確実に解放される。
    // そのため、初期状態とテンソル数が一致（リークなし）することを証明(GREEN)する。
    expect(finalTensors).toBe(initialTensors);
  });
});
