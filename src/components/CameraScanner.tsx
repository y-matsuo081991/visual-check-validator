import React, { useEffect, useRef } from 'react';
import type { DetectedObject } from '@tensorflow-models/coco-ssd';

export interface CameraScannerProps {
  stream: MediaStream | null;
  predictions: DetectedObject[];
  enableMasking?: boolean; // TDD RED Phase: property added to pass TS
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ stream, predictions, enableMasking = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);

  // カメラストリームの割り当て
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // 推論結果の描画 (Bounding Box) と 黒塗り処理 (Defensive Masking)
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!video || !canvas || !maskCanvas) return;

    const ctx = canvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    if (!ctx || !maskCtx) return;

    // キャンバスのサイズをビデオの実際のサイズに合わせる
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    canvas.width = width;
    canvas.height = height;
    maskCanvas.width = width;
    maskCanvas.height = height;

    // --- Overlay Canvas (枠線描画) ---
    ctx.clearRect(0, 0, width, height);

    // --- Mask Canvas (黒塗り処理) ---
    maskCtx.clearRect(0, 0, width, height);
    
    // ADR-002: 機密情報保護のため、enableMasking がONの時は常に背景を黒塗りする
    if (enableMasking) {
      // まず画面全体を真っ黒に塗る（対象物がない場合でも背景を隠し通す）
      maskCtx.fillStyle = 'rgba(0, 0, 0, 0.9)'; // ほぼ真っ黒だが、UI確認のために若干透過
      maskCtx.fillRect(0, 0, width, height);
      
      // 対象物が検知された場合のみ、その部分だけを「くり抜く（透明にする）」
      if (predictions.length > 0) {
        maskCtx.globalCompositeOperation = 'destination-out';
        predictions.forEach(prediction => {
          const [x, y, w, h] = prediction.bbox;
          maskCtx.fillRect(x, y, w, h);
        });
        // 元の描画モードに戻す
        maskCtx.globalCompositeOperation = 'source-over';
      }
    }

    // 各予測結果に対して枠とテキストを描画
    predictions.forEach(prediction => {
      const [x, y, w, h] = prediction.bbox;

      // 枠線の描画
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, w, h);

      // 背景付きテキストの描画
      ctx.fillStyle = '#00FFFF';
      ctx.font = '18px Arial';
      const text = `${prediction.class} (${Math.round(prediction.score * 100)}%)`;
      const textWidth = ctx.measureText(text).width;
      
      ctx.fillRect(x, y - 24, textWidth + 10, 24);
      ctx.fillStyle = '#000000';
      ctx.fillText(text, x + 5, y - 6);
    });
  }, [predictions, enableMasking]);

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '640px', margin: '0 auto' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        width={640}
        height={480}
        data-testid="camera-video"
        style={{ width: '100%', height: 'auto', display: 'block' }}
      />
      {/* マスキング（黒塗り）用のレイヤー */}
      <canvas
        ref={maskCanvasRef}
        data-testid="mask-canvas"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          display: enableMasking ? 'block' : 'none'
        }}
      />
      {/* 枠線や文字を描画するレイヤー */}
      <canvas
        ref={canvasRef}
        data-testid="overlay-canvas"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none'
        }}
      />
    </div>
  );
};
