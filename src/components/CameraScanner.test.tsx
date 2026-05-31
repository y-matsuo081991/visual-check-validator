import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
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

  it('should apply defensive masking (blackout background) when objects are detected (RED test)', () => {
    const dummyStream = null;
    const dummyPredictions = [
      {
        bbox: [10, 10, 100, 100] as [number, number, number, number],
        class: 'tire',
        score: 0.90
      }
    ];

    render(<CameraScanner stream={dummyStream} predictions={dummyPredictions} enableMasking={true} />);

    // まだ enableMasking プロパティも黒塗り専用のキャンバス(mask-canvas)も実装していないため、テストが失敗(RED)する
    const maskCanvas = screen.getByTestId('mask-canvas');
    expect(maskCanvas).toBeInTheDocument();
  });
});
