import { useState, useEffect, useCallback, useRef } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-wasm';

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

    try {
      // 【WARNING: メモリリーク注意】
      // 非同期推論では tf.tidy() 内で作成されたテンソルでも自動解放されない場合がある。
      // 本来は tf.engine().startScope() / endScope() や明示的な dispose() が望ましいが、
      // coco-ssd の detect 内部で生成されるテンソルはライブラリ側で管理される。
      // ただし、もし前処理として tf.browser.fromPixels(videoElement) 等を行う場合は、
      // 必ず明示的に tensor.dispose() を呼ぶこと。
      const predictions = await modelRef.current.detect(videoElement);
      return predictions;
    } catch (err) {
      console.error('Detection error:', err);
      return [];
    }
  }, []);

  return {
    isModelLoaded,
    error,
    detect,
    activeBackend
  };
};
