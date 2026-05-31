import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';

// カスタムフックのモック
vi.mock('./hooks/useCamera', () => ({
  useCamera: () => ({
    stream: null,
    error: null,
    startCamera: vi.fn(),
    stopCamera: vi.fn(),
  }),
}));

vi.mock('./hooks/useObjectDetection', () => ({
  useObjectDetection: () => ({
    isModelLoaded: true,
    error: null,
    detect: vi.fn().mockResolvedValue([]),
    activeBackend: 'wasm',
  }),
}));

describe('App Component (Sync-Aware UX)', () => {
  it('should display the unsynced badge when there are pending records', () => {
    // Act
    render(<App />);

    // Assert
    const badgeElement = screen.getByText(/未同期:/);
    expect(badgeElement).toBeInTheDocument();
  });

  it('should safely clear animation frame and not update state when unmounted during detectLoop (RED test)', async () => {
    // コンポーネントをマウントしてからすぐにアンマウントすることで、
    // detectLoop 内の await detect() 解決後の setPredictions が
    // アンマウント後に行われないこと（メモリリークエラーが出ないこと）をテストする。
    // ※ jsdom と vitest の環境では Warning ではなくエラーとして検知させるか、
    // cancelAnimationFrameが確実に呼ばれたかで検証する
    const cancelAnimationFrameSpy = vi.spyOn(window, 'cancelAnimationFrame');
    
    const { unmount } = render(<App />);
    unmount();

    // 現在の実装では requestRef がクリアされる保証や isMountedガードがないため、
    // テストは不完全な挙動（あるいはSpyの呼び出し失敗）でREDになる
    expect(cancelAnimationFrameSpy).toHaveBeenCalled();
  });
});