import { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './models/database';
import { useCamera } from './hooks/useCamera';
import { useObjectDetection } from './hooks/useObjectDetection';
import { CameraScanner } from './components/CameraScanner';
import type { DetectedObject } from '@tensorflow-models/coco-ssd';

function App() {
  const { stream, error: cameraError, startCamera, stopCamera } = useCamera();
  const { isModelLoaded, error: modelError, detect } = useObjectDetection();
  
  const [isScanning, setIsScanning] = useState(false);
  const [enableMasking, setEnableMasking] = useState(false);
  const [predictions, setPredictions] = useState<DetectedObject[]>([]);
  
  const requestRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Sync-Aware UX: 未同期（pending）のレコード数をDexieからリアルタイム取得
  const pendingCount = useLiveQuery(
    () => db.evidenceRecords.where('syncStatus').equals('pending').count(),
    []
  ) ?? 0;

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
      // アンマウント済みなら以降の処理（ステート更新や再起呼び出し）を中断する
      if (!isMountedRef.current) return;
      setPredictions(results);
    }
    
    if (isScanning && isMountedRef.current) {
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
      // 常に呼ばれるようにするか、isMountedRefを操作する
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    };
  }, [isScanning, isModelLoaded, detect]);

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Visual Check Validator (VCV)</h1>
        <div style={{ 
          backgroundColor: pendingCount > 0 ? '#ff4444' : '#4caf50', 
          color: 'white', 
          padding: '5px 15px', 
          borderRadius: '20px',
          fontWeight: 'bold'
        }}>
          ☁️ 未同期: {pendingCount}件
        </div>
      </div>
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
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button 
          onClick={toggleCamera}
          style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
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

        <button 
          onClick={() => setEnableMasking(!enableMasking)}
          style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', backgroundColor: enableMasking ? '#333' : '#ddd', color: enableMasking ? 'white' : 'black' }}
        >
          🛡️ Defensive Masking: {enableMasking ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* カメラスキャナー画面 */}
      <div style={{ border: '2px dashed #ccc', padding: '10px', borderRadius: '8px' }}>
        <CameraScanner stream={stream} predictions={predictions} enableMasking={enableMasking} />
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
