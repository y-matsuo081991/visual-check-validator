import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CameraScanner } from './CameraScanner';

describe('CameraScanner Component', () => {
  it('should render video and canvas elements (RED test)', () => {
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

    // Assert: 要素が存在するか（モック実装では空を返すため、テストはREDになる）
    const videoElement = screen.getByTestId('camera-video');
    const canvasElement = screen.getByTestId('overlay-canvas');
    
    expect(videoElement).toBeInTheDocument();
    expect(canvasElement).toBeInTheDocument();
  });
});
