export interface Live2DManager {
  loadModel(modelPath: string): Promise<void>;
}
