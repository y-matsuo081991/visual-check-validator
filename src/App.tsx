import { useState, useEffect, useRef } from 'react';
import { useCamera } from './hooks/useCamera';
import { useObjectDetection } from './hooks/useObjectDetection';
import { CameraScanner } from './components/CameraScanner';
import type { DetectedObject } from '@tensorflow-models/coco-ssd';

function App() {
  const { stream, error: cameraError, startCamera, stopCamera } = useCamera();
  const { isModelLoaded, error: modelError, detect } = useObjectDetection();
  
  const [isScanning, setIsScanning] = useState(false);
  const [predictions, setPredictions] = useState<DetectedObject[]>([]);
  const requestRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);

  // カメラの起動・停止トグル
  const toggleCamera = () => {
    if (stream) {
      stopCamera();
      setIsScanning(false);
      setPredictions([]);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    } else {
      startCamera();
    }
  };

  // 推論ループ (Detection Loop) - スロットリング実装
  const detectLoop = async (timestamp: number) => {
    // 5fpsに制限（1000ms / 5 = 200ms）
    if (lastFrameTimeRef.current !== null && timestamp - lastFrameTimeRef.current < 200) {
      if (isScanning) requestRef.current = requestAnimationFrame(detectLoop);
      return;
    }
    lastFrameTimeRef.current = timestamp;

    const videoElement = document.querySelector('video') as HTMLVideoElement;
    
    if (videoElement && videoElement.readyState >= 2) {
      const results = await detect(videoElement);
      setPredictions(results);
    }
    
    if (isScanning) {
      requestRef.current = requestAnimationFrame(detectLoop);
    }
  };

  // スキャン状態が変わったときにループを制御
  useEffect(() => {
    if (isScanning && isModelLoaded) {
      lastFrameTimeRef.current = null; // リセット
      requestRef.current = requestAnimationFrame(detectLoop);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isScanning, isModelLoaded, detect]);

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Visual Check Validator (VCV)</h1>
      <p>エッジ推論モジュール (Tech Spike)</p>

      {/* エラー表示 */}
      {cameraError && <div style={{ color: 'red', margin: '10px 0' }}>📷 {cameraError.message}</div>}
      {modelError && <div style={{ color: 'red', margin: '10px 0' }}>🧠 {modelError.message}</div>}

      {/* 状態表示 */}
      <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '8px' }}>
        <div>🤖 AI Model: <strong>{isModelLoaded ? 'Loaded (coco-ssd)' : 'Loading...'}</strong></div>
        <div>📷 Camera: <strong>{stream ? 'Active' : 'Inactive'}</strong></div>
      </div>

      {/* コントロール */}
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={toggleCamera}
          style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', marginRight: '10px' }}
        >
          {stream ? '🛑 Stop Camera' : '▶️ Start Camera'}
        </button>

        <button 
          onClick={() => setIsScanning(!isScanning)}
          disabled={!stream || !isModelLoaded}
          style={{ padding: '10px 20px', fontSize: '16px', cursor: (!stream || !isModelLoaded) ? 'not-allowed' : 'pointer' }}
        >
          {isScanning ? '⏸️ Pause AI Detection' : '👁️ Start AI Detection'}
        </button>
      </div>

      {/* カメラスキャナー画面 */}
      <div style={{ border: '2px dashed #ccc', padding: '10px', borderRadius: '8px' }}>
        <CameraScanner stream={stream} predictions={predictions} />
        {!stream && (
          <div style={{ textAlign: 'center', padding: '50px', color: '#666' }}>
            カメラがオフです。Start Camera をクリックしてください。
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
