import React from 'react';
import type { DetectedObject } from '@tensorflow-models/coco-ssd';

export interface CameraScannerProps {
  stream: MediaStream | null;
  predictions: DetectedObject[];
}

// TDD RED Phase: 
// Return empty to intentionally fail the test, but provide types to pass TS compilation.
export const CameraScanner: React.FC<CameraScannerProps> = () => {
  return null;
};
