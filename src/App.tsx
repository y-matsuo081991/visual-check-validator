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

  const requestRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const isMountedRef = useRef<boolean>(true);
  
  // クロージャ問題(Silent Failure)を防ぐため、ループ内判定用の最新状態をRefで保持
  const isScanningRef = useRef<boolean>(false);
  const loopCounterRef = useRef<number>(0);

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
    isScanningRef.current = scanning;
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

  // 推論ループの実体
  // useRefに格納することでクロージャの罠を回避し、再描画の影響を受けないようにする
  const detectLoopRef = useRef<((timestamp: number) => Promise<void>) | null>(null);

  // レンダリングフェーズ外（useEffect内）で最新の関数をRefに同期する
  useEffect(() => {
    detectLoopRef.current = async (timestamp: number) => {
      if (!isMountedRef.current || !isScanningRef.current) {
        requestRef.current = null;
        return;
      }

      const videoElement = document.querySelector('video') as HTMLVideoElement;
      
      // スタンダードな防御的実装: ビデオが本当に再生可能かチェックする
      const isVideoReady = videoElement 
        && videoElement.readyState >= 2 
        && videoElement.videoWidth > 0 
        && videoElement.videoHeight > 0;

      if (isVideoReady) {
        // 5fpsスロットリング: 前回の推論から十分な時間（200ms）が経過しているかチェック
        if (lastFrameTimeRef.current === null || timestamp - lastFrameTimeRef.current >= 200) {
          lastFrameTimeRef.current = timestamp;
          loopCounterRef.current += 1;
          
          // TF.jsの推論実行
          const results = await detect(videoElement);
          
          // 推論（await）の間に停止指示が来ていれば結果を破棄
          if (!isMountedRef.current || !isScanningRef.current) {
            requestRef.current = null;
            return;
          }
          
          setPredictions(results);
          setDebugLoopCount(loopCounterRef.current);
          setDebugLastResultCount(results.length);
        }
      }

      // 【重要】ビデオが準備中でスキップした場合も、推論が終わった場合も、
      // 次のフレームで再確認するため、必ず requestAnimationFrame を呼んでループを継続する。
      // ※クロージャを避けるため、直接関数名ではなくRef経由で呼ぶ
      if (isMountedRef.current && isScanningRef.current) {
        requestRef.current = requestAnimationFrame((t) => detectLoopRef.current && detectLoopRef.current(t));
      }
    };
  }); // 依存配列なし = 毎レンダリング後に最新のクロージャを同期する

  // 外部からの依存変更やアンマウント時のクリーンアップのみを担当するuseEffect
  // isScanningとisModelLoadedの変更を検知してループを自動的に起動・停止する（React Standard）
  useEffect(() => {
    if (isScanning && isModelLoaded) {
      // ループがまだ回っていない場合のみ発火
      if (!requestRef.current) {
        lastFrameTimeRef.current = null;
        requestRef.current = requestAnimationFrame((t) => detectLoopRef.current && detectLoopRef.current(t));
      }
    } else {
      // 停止時
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    }

    return () => {
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    };
  }, [isScanning, isModelLoaded]);

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
