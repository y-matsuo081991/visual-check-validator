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
      const videoElement = document.querySelector('video') as HTMLVideoElement;
      
      const isVideoReady = videoElement 
        && videoElement.readyState >= 2 
        && videoElement.videoWidth > 0 
        && videoElement.videoHeight > 0;

      if (isVideoReady) {
        if (lastFrameTimeRef.current === null || timestamp - lastFrameTimeRef.current >= 200) {
          lastFrameTimeRef.current = timestamp;
          
          try {
            const results = await detect(videoElement);
            
            setPredictions(results);
            setDebugLoopCount(prev => prev + 1);
            setDebugLastResultCount(results.length);
          } catch (e) {
             console.error("Detection error:", e);
          }
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
