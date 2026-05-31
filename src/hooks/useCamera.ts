import { useState, useCallback, useEffect, useRef } from 'react';

export const useCamera = () => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<Error | null>(null);
  
  // クロージャによる古いstreamの参照（Silent Camera Leak）を防ぐためのRef
  const activeStreamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    try {
      // 既にストリームが存在する場合は確実に停止する
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop());
        activeStreamRef.current = null;
      }

      // アウトカメラ（背面カメラ）を優先的に要求
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });

      activeStreamRef.current = mediaStream;
      setStream(mediaStream);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('カメラの起動に失敗しました'));
      setStream(null);
      activeStreamRef.current = null;
    }
  }, []); // 依存配列からstreamを外し、不要な再生成と競合を防ぐ

  const stopCamera = useCallback(() => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
      setStream(null);
    }
  }, []);

  // コンポーネントのアンマウント時にカメラを確実に停止する（メモリリークとプライバシー保護）
  useEffect(() => {
    return () => {
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop());
        activeStreamRef.current = null;
      }
    };
  }, []);

  return { stream, error, startCamera, stopCamera };
};
