import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CameraScanner } from './CameraScanner';

describe('CameraScanner Component', () => {
  it('should render video and canvas elements', () => {
    // Arrange: dummy props (using null for stream since MediaStream is not in jsdom)
    const dummyStream = null;
    // モックの DetectedObject
    const dummyPredictions = [
      {
        bbox: [10, 10, 100, 100] as [number, number, number, number],
        class: 'person',
        score: 0.95
      }
    ];

    // Act
    render(<CameraScanner stream={dummyStream} predictions={dummyPredictions} />);

    // Assert
    const videoElement = screen.getByTestId('camera-video');
    const canvasElement = screen.getByTestId('overlay-canvas');
    
    expect(videoElement).toBeInTheDocument();
    expect(canvasElement).toBeInTheDocument();
  });

  it('should apply defensive masking (blackout background) when objects are detected (GREEN test)', () => {
    const dummyStream = null;
    const dummyPredictions = [
      {
        bbox: [10, 10, 100, 100] as [number, number, number, number],
        class: 'tire',
        score: 0.90
      }
    ];

    render(<CameraScanner stream={dummyStream} predictions={dummyPredictions} enableMasking={true} />);

    const maskCanvas = screen.getByTestId('mask-canvas');
    expect(maskCanvas).toBeInTheDocument();
  });

  it('should have explicit width and height attributes on the video element for tf.browser.fromPixels (GREEN test)', () => {
    render(<CameraScanner stream={null} predictions={[]} />);
    const videoElement = screen.getByTestId('camera-video');
    expect(videoElement).toHaveAttribute('width');
    expect(videoElement).toHaveAttribute('height');
  });

  it('MUST mask the entire background even when zero objects are detected to prevent security leak (RED test)', () => {
    // Canvas APIのモック
    const mockFillRect = vi.fn();
    const mockClearRect = vi.fn();
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    
    // @ts-expect-error - JSDOM環境での不完全なモック注入のため
    HTMLCanvasElement.prototype.getContext = function() {
      return {
        clearRect: mockClearRect,
        fillRect: mockFillRect,
        measureText: () => ({ width: 10 }),
        fillText: vi.fn(),
      };
    };

    try {
      // ADR-002: 検知件数が0件（何も見つかっていない）状態でも、
      // enableMasking が true ならば画面全体を黒塗りにして機密情報漏洩を防がなければならない。
      render(<CameraScanner stream={null} predictions={[]} enableMasking={true} />);

      // 背景の黒塗り処理（fillRect）が最低1回は呼ばれているはず（RED: 現在は呼ばれない）
      expect(mockFillRect).toHaveBeenCalled();
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });
});
