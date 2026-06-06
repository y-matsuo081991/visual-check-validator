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
    render(<CameraScanner stream={dummyStream} predictions={dummyPredictions} enableMasking={true} />);

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
    render(<CameraScanner stream={null} predictions={[]} enableMasking={true} />);
    const videoElement = screen.getByTestId('camera-video');
    expect(videoElement).toHaveAttribute('width');
    expect(videoElement).toHaveAttribute('height');
  });

  it('MUST mask the entire background even when zero objects are detected to prevent security leak (RED test)', () => {
    // Canvas APIのモック
    const mockFillRect = vi.fn();
    const mockClearRect = vi.fn();
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    
    // @ts-expect-error: JSDOM environment lacks full Canvas API - JSDOM環境での不完全なモック注入のため
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

  it('MUST skip masking for MLOps sampling when confidence score is below 60% (Drift RED test)', () => {
    const mockFillRect = vi.fn();
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    
    // @ts-expect-error: JSDOM environment lacks full Canvas API
    HTMLCanvasElement.prototype.getContext = function() {
      return {
        clearRect: vi.fn(),
        fillRect: mockFillRect,
        strokeRect: vi.fn(),
        measureText: () => ({ width: 10 }),
        fillText: vi.fn(),
      };
    };

    try {
      // 確信度が極端に低い（50%）スレスレの画像
      const lowConfidencePredictions = [{
        class: 'target',
        bbox: [10, 10, 50, 50] as [number, number, number, number],
        score: 0.50
      }];

      // ADR-003: 確信度が低い場合はMLOpsの再学習サンプリング用生データを確保するため、
      // enableMasking=true であってもマスキング処理（fillRect）をスキップ（バイパス）しなければならない。
      render(<CameraScanner stream={null} predictions={lowConfidencePredictions} enableMasking={true} />);

      // 背景全面黒塗りの fillRect が呼ばれていないことを確認
      // (テキストラベルの背景描画等で他の引数で呼ばれる可能性はあるため、全面黒塗りを指定)
      expect(mockFillRect).not.toHaveBeenCalledWith(0, 0, 640, 480);
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  it('MUST use configurable MLOps threshold via props instead of magic number (Maintainability RED test)', () => {
    const mockFillRect = vi.fn();
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    
    // @ts-expect-error: JSDOM environment lacks full Canvas API
    HTMLCanvasElement.prototype.getContext = function() {
      return {
        clearRect: vi.fn(),
        fillRect: mockFillRect,
        strokeRect: vi.fn(),
        measureText: () => ({ width: 10 }),
        fillText: vi.fn(),
      };
    };

    try {
      // スコアは 0.70。現状ハードコードされている 0.60 のロジックではマスキングが実行されてしまう。
      const predictions = [{
        class: 'target',
        bbox: [10, 10, 50, 50] as [number, number, number, number],
        score: 0.70
      }];

      // mlopsThreshold=0.80 を渡すことで、0.70 < 0.80 となりマスキングがスキップされることを期待する。
      render(<CameraScanner stream={null} predictions={predictions} enableMasking={true} mlopsThreshold={0.80} />);

      // RED: propが無視され、ハードコードの0.60で判定されるため、0.70は閾値以上とみなされてマスキングされてしまう。
      // このテストは「マスキングされないこと」を期待する。
      expect(mockFillRect).not.toHaveBeenCalledWith(0, 0, 640, 480);
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });
});
