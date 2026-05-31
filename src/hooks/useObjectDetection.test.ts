import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as tf from '@tensorflow/tfjs';
import { useObjectDetection } from './useObjectDetection';

// モックの設定
vi.mock('@tensorflow-models/coco-ssd', () => ({
  load: vi.fn(),
}));

vi.mock('@tensorflow/tfjs', () => ({
  setBackend: vi.fn().mockResolvedValue(true),
  getBackend: vi.fn().mockReturnValue('wasm'), // 強制的にWASMが返るようにモックし、フォールバックをシミュレート
  ready: vi.fn().mockResolvedValue(true),
}));

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

  it('should configure WASM paths properly before setting backend (RED test)', async () => {
    renderHook(() => useObjectDetection());
    
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // 現状は setWasmPaths が定義/インポートされておらず、呼ばれないため失敗(RED)する
    // これを実装しないと実機で404エラーとなりアプリがクラッシュする
    const wasmModule = await import('@tensorflow/tfjs-backend-wasm');
    expect(wasmModule.setWasmPaths).toHaveBeenCalled();
  });
});
