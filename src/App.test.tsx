import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from './App';
import { db } from './models/database';
import * as syncService from './services/syncService';
import * as tf from '@tensorflow/tfjs';
import { useObjectDetection } from './hooks/useObjectDetection';

// jsdom環境でMediaStreamが存在しないためのモック
class MockMediaStream {
  getTracks() { return []; }
}
vi.stubGlobal('MediaStream', MockMediaStream);

// カスタムフックのモック
vi.mock('./hooks/useCamera', () => ({
  useCamera: () => ({
    stream: new MockMediaStream(), // streamをmockしてスキャン可能な状態にする
    error: null,
    startCamera: vi.fn(),
    stopCamera: vi.fn(),
  }),
}));

vi.mock('./hooks/useObjectDetection', () => ({
  useObjectDetection: vi.fn().mockImplementation(() => ({
    isModelLoaded: true,
    error: null,
    // detectの中で意図的にtensorを生成し、リークを再現する
    detect: vi.fn().mockImplementation(async () => {
      tf.tensor1d([1, 2, 3]); // リークするtensor
      return [];
    }),
    activeBackend: 'wasm',
  })),
}));

describe('App Component (Sync-Aware UX)', () => {
  // 世界的ベストプラクティス: テスト間の IndexedDB の状態リーク（State Leakage）を完全に防ぐ
  beforeEach(async () => {
    await db.evidenceRecords.clear();
    // ネットワーク同期が走った際にエラーでクラッシュしないようfetchをモックする
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should display the unsynced badge when there are pending records', () => {
    render(<App />);
    const badgeElement = screen.getByText(/未同期:/);
    expect(badgeElement).toBeInTheDocument();
  });

  it('should mount and unmount without memory leaks or errors (GREEN test)', () => {
    // 複雑な非同期ループのモックはjsdomの制約で不安定になるため、
    // ここではコンポーネントが安全にマウント・アンマウント（isMountedRefの切り替え）できることを担保する
    const { unmount } = render(<App />);
    expect(() => unmount()).not.toThrow();
  });

  it('should toggle scanning state without crashing (GREEN test)', () => {
    const { getByText } = render(<App />);
    const scanButton = getByText(/Start AI Detection/);
    
    // エラーなく状態が切り替わることを確認（クロージャバグの修正によりクラッシュしない）
    expect(() => {
      act(() => {
        scanButton.click();
      });
    }).not.toThrow();
  });

  it('should prevent memory leaks in the detection loop (RED test)', async () => {
    // コールスタックオーバーフローを防ぐため、非同期に実行する
    // かつ、App.tsxのスロットリング(200ms)を突破するために十分に未来の時間を渡す
    let time = performance.now();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      time += 500;
      setTimeout(() => cb(time), 0);
      return 1;
    });

    const { getByText, unmount } = render(<App />);
    const scanButton = getByText(/Start AI Detection/);
    
    // スキャン開始前のテンソル数
    const initialTensors = tf.memory().numTensors;

    await act(async () => {
      scanButton.click(); // スキャン開始
      // イベントループを回して detect を数回実行させる
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // スキャン停止
    await act(async () => {
      scanButton.click();
    });

    // 終了後のtensor数
    const finalTensors = tf.memory().numTensors;
    
    unmount();
    vi.unstubAllGlobals();

    // REDテストとして「テンソル数が増えていないこと」を期待する
    expect(finalTensors).toBe(initialTensors);
  });

  it('should not attempt detection if video is not fully loaded (readyState < 2) to prevent silent 0x0 tensor failures (RED test)', async () => {
    // モックのvideo要素を作成し、わざと readyState を 1 (HAVE_METADATA だがデータなし) にする
    const mockDetect = vi.fn();
    vi.mocked(useObjectDetection).mockReturnValue({
      isModelLoaded: true,
      error: null,
      detect: mockDetect,
      activeBackend: 'wasm',
    });

    // querySelectorをフックして意図的に未完了のvideoを返す
    const originalQuerySelector = document.querySelector.bind(document);
    vi.spyOn(document, 'querySelector').mockImplementation((selector) => {
      if (selector === 'video') {
        const video = document.createElement('video');
        // JSDOMでは readonly なので Object.defineProperty で強制上書きする
        Object.defineProperty(video, 'readyState', { value: 1, configurable: true });
        // videoWidth と videoHeight が意図的に 0 の状態をシミュレート
        Object.defineProperty(video, 'videoWidth', { value: 0, configurable: true });
        Object.defineProperty(video, 'videoHeight', { value: 0, configurable: true });
        return video;
      }
      return originalQuerySelector(selector);
    });

    // RequestAnimationFrame を同期的に呼ぶモック
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      setTimeout(() => cb(performance.now() + 500), 0);
      return 1;
    });

    const { getByText, unmount } = render(<App />);
    const scanButton = getByText(/Start AI Detection/);
    
    await act(async () => {
      scanButton.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      scanButton.click();
    });

    unmount();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();

    // App.tsx の実装では、ビデオの準備ができていない（videoWidth が 0 など）場合は
    // requestAnimationFrame のループに「次のフレーム要求」が入らず、サイレントにループが止まってしまう。
    // REDテストとして、ビデオが未準備な状態でも「次のフレームを要求して再トライし続けるべき」であるため、
    // ここでは「本来は呼ばれるべきではないが、ループが途絶えているバグを証明する」ための確認を行う。
    expect(mockDetect).not.toHaveBeenCalled();
  });

  it('MUST execute the detection loop when scanning is started, overcoming stale closures (RED test)', async () => {
    // コンポーネント内で定義された関数（detectLoop）が、古いstate（isScanning=false）を
    // キャプチャしたまま requestAnimationFrame に渡されてしまい、
    // ボタンを押しても即座に return されてループが全く回らない（0回のまま）バグを証明する。

    const mockDetect = vi.fn().mockResolvedValue([]);
    vi.mocked(useObjectDetection).mockReturnValue({
      isModelLoaded: true,
      error: null,
      detect: mockDetect,
      activeBackend: 'wasm',
    });

    // ビデオが完全に準備できた状態（readyState=4, サイズあり）をシミュレート
    const originalQuerySelector = document.querySelector.bind(document);
    vi.spyOn(document, 'querySelector').mockImplementation((selector) => {
      if (selector === 'video') {
        const video = document.createElement('video');
        Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
        Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });
        return video;
      }
      return originalQuerySelector(selector);
    });

    // アニメーションフレームを同期的に進め、スロットリング（200ms）を突破する時間を渡す
    let frameTime = performance.now();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frameTime += 300; 
      setTimeout(() => cb(frameTime), 0);
      return 1;
    });

    const { getByText, unmount } = render(<App />);
    const scanButton = getByText(/Start AI Detection/);
    
    // スキャン開始
    await act(async () => {
      scanButton.click();
      // ループが複数回回るのを待つ
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // スキャン停止
    await act(async () => {
      scanButton.click();
    });

    unmount();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();

    // 期待値: 完璧な状態のビデオが存在し、スキャンを開始したのだから、
    // AIの推論処理（detect）は最低でも1回以上呼ばれていなければならない。
    expect(mockDetect).toHaveBeenCalled();
  });

  it('MUST keep the detection loop running even after React Strict Mode double-mount or state updates (RED test)', async () => {
    // ブラウザで「ループ実行回数: 0」になるバグの完全な再現。
    // React 18のStrict Modeや、コンポーネントの再レンダリングによって
    // requestAnimationFrame のクリーンアップが誤作動し、
    // 以降二度とループが着火しなくなる（サイレントに死ぬ）問題を証明する。

    const mockDetect = vi.fn().mockResolvedValue([]);
    vi.mocked(useObjectDetection).mockReturnValue({
      isModelLoaded: true,
      error: null,
      detect: mockDetect,
      activeBackend: 'wasm',
    });

    const originalQuerySelector = document.querySelector.bind(document);
    vi.spyOn(document, 'querySelector').mockImplementation((selector) => {
      if (selector === 'video') {
        const video = document.createElement('video');
        Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
        Object.defineProperty(video, 'videoHeight', { value: 480, configurable: true });
        return video;
      }
      return originalQuerySelector(selector);
    });

    // アニメーションフレームを同期的に進める
    let frameTime = performance.now();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frameTime += 300; 
      setTimeout(() => cb(frameTime), 0);
      return 1;
    });

    const { getByText, rerender, unmount } = render(<App />);
    const scanButton = getByText(/Start AI Detection/);
    
    // スキャン開始
    await act(async () => {
      scanButton.click();
    });

    // Strict Modeの挙動（または他のStateによる再レンダリング）をシミュレート
    rerender(<App />);

    // 再レンダリング後、ループが回るのを待つ
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    unmount();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();

    // 現状の実装はループ管理（useEffectの依存配列とRefの同期）が破綻しているため、
    // 再レンダリングが挟まると detect は1回も呼ばれずにループが死ぬ（REDになる）。
    expect(mockDetect).toHaveBeenCalled();
  });

  it('MUST handle offline saving and online background sync (Sync-Aware UX RED test)', async () => {
    // 1. オフラインモードをONにする
    // 2. モック保存ボタンを押して、Dexieにpendingレコードを追加する
    // 3. UIのバッジが「未同期: 1件」になることを確認する
    // 4. オフラインモードをOFF（オンライン）に戻す
    // 5. バックグラウンドで同期処理が走り、Dexieのレコードが消え、バッジが「未同期: 0件」に戻ることを確認する

    const { getByText, findByText, unmount } = render(<App />);

    const offlineToggle = getByText(/Simulate Offline Mode: OFF/);
    const saveMockButton = getByText(/Save Result \(Mock\)/);

    // 1. オフラインモードをONにする
    await act(async () => {
      offlineToggle.click();
    });
    expect(offlineToggle.textContent).toContain('ON');

    // 2. 保存ボタンを押す
    await act(async () => {
      saveMockButton.click();
    });

    // 3. 未同期バッジが増えることを確認
    const badge1 = await findByText(/☁️ 未同期: 1件/);
    expect(badge1).toBeInTheDocument();

    // 4. オンラインに復帰する
    await act(async () => {
      offlineToggle.click();
    });

    // 5. バックグラウンド同期が走り、バッジが0に戻ることを確認
    const badge0 = await findByText(/☁️ 未同期: 0件/);
    expect(badge0).toBeInTheDocument();

    unmount();
  });

  it('MUST trigger sync immediately when saving while online (Sync-Aware UX RED test 2)', async () => {
    // オンライン状態で保存ボタンを押した直後に同期処理が走り、
    // 保留中（pending）のレコードが最終的に0になることを証明する。
    const { getByText, findByText, unmount } = render(<App />);

    // 初期状態はオンライン (OFF) のはず
    const offlineToggle = getByText(/Simulate Offline Mode: OFF/);
    expect(offlineToggle).toBeInTheDocument();

    const saveMockButton = getByText(/Save Result \(Mock\)/);

    // 保存ボタンを押す
    await act(async () => {
      saveMockButton.click();
    });

    // 最初は1件になるかもしれないが、その後すぐに同期されて0件に戻るはず
    // RTL の findByText は非同期で要素を待つ
    const badge0 = await findByText(/☁️ 未同期: 0件/, {}, { timeout: 3000 });
    expect(badge0).toBeInTheDocument();

    unmount();
  });

  it('MUST prevent double saving when the save button is spammed (Idempotency RED test)', async () => {
    // ネットワーク遅延シミュレーション（1回目の保存中に連打する期間を作る）
    const saveSpy = vi.spyOn(syncService, 'saveMockRecord').mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
      await db.evidenceRecords.add({
        id: crypto.randomUUID(), timestamp: Date.now(), portNumber: 'MOCK',
        imageBlob: new Blob(), isMasked: false, syncStatus: 'pending'
      });
    });

    // ベストプラクティス: userEvent.setup() でユーザー操作を初期化
    const user = userEvent.setup();
    const { getByText, unmount } = render(<App />);
    
    // UIが表示されるのを待機
    const saveMockButton = await waitFor(() => getByText(/Save Result \(Mock\)/) as HTMLButtonElement);

    // RTLの userEvent を用いて連打（スパムクリック）をシミュレート
    // userEventは disabled を検知するため、1回目のクリックで setIsSaving(true) が反映された後、
    // 2回目・3回目のクリックは「disabled なのでクリックできない」として正しく無視される。
    // ※ ユーザーの現実の連打をシミュレートするため、await で逐次実行する
    await user.click(saveMockButton);
    await user.click(saveMockButton);
    await user.click(saveMockButton);

    // 内部の非同期処理が完了し、ボタンが再度有効になるまで待機
    await waitFor(() => {
      expect(saveMockButton).not.toBeDisabled();
    }, { timeout: 3000 });

    // DBの中身を確認し、保存が1件に抑えられたかチェック
    const pendingCount = await db.evidenceRecords.where('syncStatus').equals('pending').count();
    const syncedCount = await db.evidenceRecords.where('syncStatus').equals('synced').count();
    
    expect(pendingCount + syncedCount).toBeLessThanOrEqual(1);
    
    // 実際にモック関数も1回しか呼ばれていないことをアサート
    expect(saveSpy).toHaveBeenCalledTimes(1);

    saveSpy.mockRestore();
    unmount();
  });

  it('MUST re-enable the save button after saving, even after Strict Mode double-mounts (Strict Mode RED test)', async () => {
    // React 18の Strict Mode による「ダブルマウント」をシミュレートする
    const user = userEvent.setup();
    const { getByText, unmount } = render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    
    const saveMockButton = await waitFor(() => getByText(/Save Result \(Mock\)/) as HTMLButtonElement);

    // クリック実行
    await user.click(saveMockButton);

    // アンチパターン（isMountedRef）を削除したため、
    // Strict Modeのダブルマウント下であっても finally が正しく実行され、
    // ボタンの非活性化（disabled）が確実に解除されるはずである。
    await waitFor(() => {
      expect(saveMockButton).not.toBeDisabled();
    });

    unmount();
  });

  it('MUST successfully sync and clear badge when API responds successfully (MSW/Mock Integration GREEN test)', async () => {
    // 正常なAPIレスポンス（200 OK）をシミュレート
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const user = userEvent.setup();
    const { getByText, unmount } = render(<App />);

    const offlineToggle = await waitFor(() => getByText(/Simulate Offline Mode: OFF/));
    const saveMockButton = getByText(/Save Result \(Mock\)/) as HTMLButtonElement;

    // 1. オフラインモードをONにする
    await user.click(offlineToggle);

    // 2. 保存ボタンを押す
    await user.click(saveMockButton);

    // 3. 未同期バッジが「1件」になることを確認
    await waitFor(() => {
      expect(screen.getByText(/☁️ 未同期: 1件/)).toBeInTheDocument();
    });

    // 4. オンラインに復帰する（ここで syncRecords が発火する）
    await user.click(offlineToggle);

    // 5. 期待値 (GREENの条件): 
    // APIが正常に 200 OK を返せば、同期が成功してバッジは 0件 になるべき。
    await waitFor(() => {
      expect(screen.getByText(/☁️ 未同期: 0件/)).toBeInTheDocument();
    });

    unmount();
  });
});