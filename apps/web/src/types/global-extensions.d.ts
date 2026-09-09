interface FaceAPI {
  nets: {
    tinyFaceDetector: { loadFromUri(uri: string): Promise<void> };
    faceExpressionNet: { loadFromUri(uri: string): Promise<void> };
  };
  TinyFaceDetectorOptions: new () => unknown;
  detectSingleFace(
    input: HTMLVideoElement,
    options: unknown
  ): { withFaceExpressions(): Promise<FaceDetectionResult | undefined> };
}

interface FaceDetectionResult {
  expressions: Record<string, number>;
}

interface TfAPI {
  removeBackend(name: string): void;
  setBackend(name: string): Promise<void>;
  ready(): Promise<void>;
  getBackend(): string;
}

interface Window {
  tf?: TfAPI;
  faceapi?: FaceAPI;
  webkitAudioContext?: typeof AudioContext;
}