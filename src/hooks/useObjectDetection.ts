import { useState, useEffect, useCallback, useRef } from 'react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs'; // Core backend initialization

export const useObjectDetection = () => {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initModel = async () => {
      try {
        // ADR-004: iOS Safari WebGL制約の検証用
        // 必要であればここで tf.setBackend('wasm') 等の処理を挟むことができる
        const loadedModel = await cocoSsd.load({
          base: 'lite_mobilenet_v2' // デフォルトより軽量なモデルを指定
        });
        
        if (isMounted) {
          modelRef.current = loadedModel;
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
    };
  }, []);

  const detect = useCallback(async (videoElement: HTMLVideoElement) => {
    if (!modelRef.current) {
      return [];
    }

    try {
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
    activeBackend: 'webgl' // TDD RED: hardcoded to webgl, test expects wasm or dynamic
  };
};
