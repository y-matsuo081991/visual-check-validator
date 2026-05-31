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
  it('should display the unsynced badge when there are pending records (RED test)', () => {
    // Act
    render(<App />);

    // Assert: まだ「未同期バッジ」のUIとDexie連携を実装していないため、テストが失敗(RED)する
    const badgeElement = screen.getByText(/未同期:/);
    expect(badgeElement).toBeInTheDocument();
  });
});