import React, { useEffect, useRef } from 'react';
import type { DetectedObject } from '@tensorflow-models/coco-ssd';

export interface CameraScannerProps {
  stream: MediaStream | null;
  predictions: DetectedObject[];
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ stream, predictions }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // カメラストリームの割り当て
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // 推論結果の描画 (Bounding Box)
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // キャンバスのサイズをビデオの実際のサイズに合わせる
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    // 前回の描画をクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 各予測結果に対して枠とテキストを描画
    predictions.forEach(prediction => {
      const [x, y, width, height] = prediction.bbox;

      // 枠線の描画
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, width, height);

      // 背景付きテキストの描画
      ctx.fillStyle = '#00FFFF';
      ctx.font = '18px Arial';
      const text = `${prediction.class} (${Math.round(prediction.score * 100)}%)`;
      const textWidth = ctx.measureText(text).width;
      
      ctx.fillRect(x, y - 24, textWidth + 10, 24);
      ctx.fillStyle = '#000000';
      ctx.fillText(text, x + 5, y - 6);
    });
  }, [predictions]);

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '640px', margin: '0 auto' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        data-testid="camera-video"
        style={{ width: '100%', height: 'auto', display: 'block' }}
      />
      <canvas
        ref={canvasRef}
        data-testid="overlay-canvas"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none' // クリックイベントをvideoに透過させる
        }}
      />
    </div>
  );
};
