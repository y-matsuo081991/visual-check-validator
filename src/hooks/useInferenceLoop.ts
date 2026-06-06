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

    const animate = async (timestamp: number) => {
      // スロットリング制御: 100ms経過していない場合は推論をスキップするが、ループは維持する
      // ADR-005 (Modified): PoCのExit Criteria（0.1秒推論によるUX担保）を満たすため、10fps (100ms) に設定
      if (lastFrameTimeRef.current !== null && timestamp - lastFrameTimeRef.current < 100) {
        if (isScanning && isModelLoaded) {
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
          
          setPredictions(results);
          setDebugLoopCount(prev => prev + 1);
          setDebugLastResultCount(results.length);
        } catch (e) {
          console.error("Detection error:", e);
        }
      }

      animationId = requestAnimationFrame(animate);
    };

    if (isScanning && isModelLoaded) {
      lastFrameTimeRef.current = null;
      animationId = requestAnimationFrame(animate);
    }

    return () => {
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
