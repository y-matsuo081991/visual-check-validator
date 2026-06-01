import { useState, useEffect, useCallback, useRef } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';

export const useObjectDetection = () => {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [activeBackend, setActiveBackend] = useState<string>('webgl');
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initModel = async () => {
      try {
        // ADR-004: iOS Safari WebGL制約の検証および回避
        // 16-bit浮動小数点の制約や、メモリ確保失敗時にWASMへフォールバックする
        let backend = 'webgl';
        await tf.setBackend(backend);
        await tf.ready();
        
        // 簡易的なフォールバックロジック（WebGLの初期化に失敗した場合等）
        if (tf.getBackend() !== 'webgl') {
          backend = 'wasm';
          // package.jsonのバージョンと一致させるため、ビルド時に注入されたバージョンを利用する
          setWasmPaths(`https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@${__TFJS_VERSION__}/dist/`);
          await tf.setBackend(backend);
          await tf.ready();
        }

        const loadedModel = await cocoSsd.load({
          base: 'lite_mobilenet_v2'
        });
        
        if (isMounted) {
          modelRef.current = loadedModel;
          setActiveBackend(backend);
          setIsModelLoaded(true);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error('Failed to load AI model'));
        }
      }
    };

    initModel();

    return () => {
      isMounted = false;
      // コンポーネントアンマウント時にモデルを破棄しメモリリークを防ぐ
      if (modelRef.current) {
        modelRef.current.dispose();
      }
    };
  }, []);

  const detect = useCallback(async (videoElement: HTMLVideoElement) => {
    if (!modelRef.current) {
      return [];
    }

    let pixels: tf.Tensor3D | null = null;
    try {
      // TensorFlow.js推奨パターン:
      // 非同期環境では startScope/endScope を使わず、明示的にテンソルを作り dispose する
      pixels = tf.browser.fromPixels(videoElement);
      const predictions = await modelRef.current.detect(pixels);
      return predictions;
    } catch (err) {
      console.error('Detection error:', err);
      return [];
    } finally {
      // 推論成功・エラーに関わらず、確保したVRAMを必ず解放する
      if (pixels) {
        pixels.dispose();
      }
    }
  }, []);

  return {
    isModelLoaded,
    error,
    detect,
    activeBackend
  };
};
