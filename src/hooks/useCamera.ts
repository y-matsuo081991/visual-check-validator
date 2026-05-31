import { useState, useCallback, useEffect } from 'react';

export const useCamera = () => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const startCamera = useCallback(async () => {
    try {
      // 既にストリームが存在する場合は一度停止する
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      // アウトカメラ（背面カメラ）を優先的に要求
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });

      setStream(mediaStream);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('カメラの起動に失敗しました'));
      setStream(null);
    }
  }, [stream]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  // コンポーネントのアンマウント時にカメラを確実に停止する（メモリリークとプライバシー保護）
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  return { stream, error, startCamera, stopCamera };
};
