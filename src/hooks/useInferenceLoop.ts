import { useState, useEffect, useRef } from 'react';
import type { DetectedObject } from '@tensorflow-models/coco-ssd';

export const useInferenceLoop = (
  isScanning: boolean,
  isModelLoaded: boolean,
  detect: (video: HTMLVideoElement) => Promise<DetectedObject[]>
) => {
  const [predictions, setPredictions] = useState<DetectedObject[]>([]);
  const [debugLoopCount, setDebugLoopCount] = useState(0);
  const [debugLastResultCount, setDebugLastResultCount] = useState(0);
  
  const lastFrameTimeRef = useRef<number | null>(null);

  useEffect(() => {
    let animationId: number;
    let isCancelled = false; // ADR-008: 非同期キャンセルフラグ

    const animate = async (timestamp: number) => {
      // 破棄済みの場合はループを停止（ゾンビ化防止）
      if (isCancelled) return;

      // スロットリング制御: 100ms経過していない場合は推論をスキップするが、ループは維持する
      // ADR-005 (Modified): PoCのExit Criteria（0.1秒推論によるUX担保）を満たすため、10fps (100ms) に設定
      if (lastFrameTimeRef.current !== null && timestamp - lastFrameTimeRef.current < 100) {
        if (isScanning && isModelLoaded && !isCancelled) {
          animationId = requestAnimationFrame(animate);
        }
        return;
      }
      lastFrameTimeRef.current = timestamp;

      const videoElement = document.querySelector('video') as HTMLVideoElement;
      
      const isVideoReady = videoElement 
        && videoElement.readyState >= 2 
        && videoElement.videoWidth > 0 
        && videoElement.videoHeight > 0;

      if (isVideoReady) {
        try {
          const results = await detect(videoElement);
          
          // 非同期処理完了後、すでにコンポーネントが破棄されているなら状態更新やループ再開を行わない
          if (isCancelled) return;

          setPredictions(results);
          setDebugLoopCount(prev => prev + 1);
          setDebugLastResultCount(results.length);
        } catch (e) {
          console.error("Detection error:", e);
        }
      }

      if (!isCancelled) {
        animationId = requestAnimationFrame(animate);
      }
    };

    if (isScanning && isModelLoaded) {
      lastFrameTimeRef.current = null;
      animationId = requestAnimationFrame(animate);
    }

    return () => {
      isCancelled = true;
      if (animationId !== undefined) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isScanning, isModelLoaded, detect]);

  return {
    predictions,
    setPredictions,
    debugLoopCount,
    debugLastResultCount
  };
};
