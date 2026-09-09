declare module 'pixi-live2d-display/lib/cubism4' {
  interface CoreModel {
    setParameterValueById(id: string, value: number): void;
    addParameterValueById(id: string, value: number): void;
    getParameterIndex(id: string): number;
    getParameterCount?(): number;
    getParameterId?(index: number): string;
    _model?: {
      parameters?: {
        ids?: string[];
      };
    };
  }

  interface SoundManager {
    volume: number;
    getVolume?(): number;
    setVolume?(volume: number): void;
  }

  interface InternalModel {
    coreModel: CoreModel;
    motionManager?: {
      motionGroups?: Record<string, unknown[]>;
      soundManager?: SoundManager;
    };
    settings?: {
      expressions?: Array<{ name?: string; Name?: string }>;
      motions?: Record<string, unknown[]>;
    };
  }

  // PIXI DisplayObject properties needed for Live2DModel
  export interface Live2DModelType {
    // Internal model data
    internalModel: InternalModel | undefined;
    
    // PIXI DisplayObject properties
    x: number;
    y: number;
    width: number;
    height: number;
    scale: { x: number; y: number; set(x: number, y?: number): void };
    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void;
    once(event: string, listener: () => void): void;
    on(event: string, listener: (...args: unknown[]) => void): void;
    
    // Event emitter methods
    addEventListener(event: string, listener: (...args: unknown[]) => void): void;
    removeEventListener(event: string, listener: (...args: unknown[]) => void): void;
  }

  export class Live2DModel {
    static from(url: string): Promise<Live2DModelType>;
    static registerTicker(ticker: unknown): void;
    
    destroy(options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }): void;
    once(event: string, listener: () => void): void;
    on(event: string, listener: (...args: unknown[]) => void): void;
  }

  export type Live2DModelInstance = Live2DModelType;

  export default Live2DModel;
}
