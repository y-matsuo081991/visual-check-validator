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
  
  // デバッグ用ステータス
  const [debugLoopCount, setDebugLoopCount] = useState(0);
  const [debugLastResultCount, setDebugLastResultCount] = useState(0);

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

  // 状態とRefを同期して更新するヘルパー
  const toggleScanning = (scanning: boolean) => {
    setIsScanning(scanning);
  };

  // カメラの起動・停止トグル
  const toggleCamera = () => {
    if (stream) {
      stopCamera();
      toggleScanning(false);
      setPredictions([]);
    } else {
      startCamera();
    }
  };

  // 外部からの依存変更やアンマウント時のクリーンアップのみを担当するuseEffect
  // isScanningとisModelLoadedの変更を検知してループを自動的に起動・停止する（React Standard）
  useEffect(() => {
    let animationId: number;

    const animate = async (timestamp: number) => {
      const videoElement = document.querySelector('video') as HTMLVideoElement;
      
      // スタンダードな防御的実装: ビデオが本当に再生可能かチェックする
      const isVideoReady = videoElement 
        && videoElement.readyState >= 2 
        && videoElement.videoWidth > 0 
        && videoElement.videoHeight > 0;

      if (isVideoReady) {
        // 5fpsスロットリング
        if (lastFrameTimeRef.current === null || timestamp - lastFrameTimeRef.current >= 200) {
          lastFrameTimeRef.current = timestamp;
          
          try {
            const results = await detect(videoElement);
            
            // isScanning自体はクロージャだが、このループは isScanning が変わるたびに
            // useEffectによって破棄・再生成されるため、常に最新の true を見ている
            setPredictions(results);
            
            // functional update を使うことでクロージャに依存せずカウントアップする
            setDebugLoopCount(prev => prev + 1);
            setDebugLastResultCount(results.length);
          } catch (e) {
             console.error("Detection error:", e);
          }
        }
      }

      // 次のフレームをスケジュール
      animationId = requestAnimationFrame(animate);
    };

    if (isScanning && isModelLoaded) {
      lastFrameTimeRef.current = null;
      // ループ開始
      animationId = requestAnimationFrame(animate);
    }

    // クリーンアップ関数（Strict Modeによる再マウント時やスキャン停止時に絶対に前のループを殺す）
    return () => {
      if (animationId !== undefined) {
        cancelAnimationFrame(animationId);
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
        {/* デバッグパネル */}
        <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#e0e0e0', border: '1px solid #ccc', fontSize: '14px', fontFamily: 'monospace' }}>
          <strong>[DEBUG PANEL]</strong><br/>
          ループ実行回数: {debugLoopCount}<br/>
          直近の検知件数: {debugLastResultCount}
        </div>
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
          onClick={() => toggleScanning(!isScanning)}
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
