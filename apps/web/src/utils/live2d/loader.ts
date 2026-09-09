import * as PIXI from "pixi.js";
import { Application, type DisplayObject } from "pixi.js";
import { modelPath as defaultModelPath, LIVE2D_CONFIG } from "./config";
import { logger } from "../logger";

if (typeof window !== "undefined") {
  const w = window as typeof window & { PIXI?: typeof PIXI };
  if (!w.PIXI || typeof w.PIXI !== "object") {
    (w as unknown as { PIXI: typeof PIXI }).PIXI = PIXI;
  } else {
    Object.assign(w.PIXI, PIXI);
  }
}

type Live2DModelConstructor = {
  new (...args: unknown[]): DisplayObject & {
    width: number;
    height: number;
    scale: { set: (value: number) => void; x?: number; y?: number };
    x: number;
    y: number;
    anchor?: { set: (x: number, y: number) => void };
    eventMode?: string;
    interactive?: boolean;
    hitArea?: unknown;
    expression?: (name: string) => Promise<void> | void;
    motion?: (group: string, index?: number) => Promise<void> | void;
    once?: (event: string, listener: () => void) => void;
    internalModel?: Record<string, unknown>;
    destroy?: (options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }) => void;
  };
  from: (url: string) => Promise<InstanceType<Live2DModelConstructor>>;
  registerTicker: (ticker: unknown) => void;
};

let _Live2DModel: Live2DModelConstructor | null = null;

const ensurePIXIGlobal = () => {
  if (typeof window === "undefined") return;
  const w = window as typeof window & { PIXI?: typeof PIXI };
  if (!w.PIXI || typeof w.PIXI !== "object") {
    (w as unknown as { PIXI: typeof PIXI }).PIXI = PIXI;
  } else {
    Object.assign(w.PIXI, PIXI);
  }
};

const loadPixiLive2DDisplay = (): Promise<void> => {
  const w = window as typeof window & { __pixiLive2DLoadingPromise__?: Promise<void> };
  if (w.__pixiLive2DLoadingPromise__) return w.__pixiLive2DLoadingPromise__;

  w.__pixiLive2DLoadingPromise__ = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-pixi-live2d="true"]') as HTMLScriptElement | null;
    if (existing) {
      const pixiWin = window as typeof window & { PIXI?: { live2d?: { Live2DModel?: unknown } } };
      if (pixiWin.PIXI?.live2d?.Live2DModel) { resolve(); return; }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("加载 pixi-live2d-display 失败")), { once: true });
      return;
    }

    ensurePIXIGlobal();

    const script = document.createElement("script");
    script.src = "/live2d/sdk/pixi-live2d-display-cubism4.min.js";
    script.async = false;
    script.dataset.pixiLive2d = "true";
    script.onload = () => {
      const pixiWin = window as typeof window & { PIXI?: { live2d?: { Live2DModel?: unknown } } };
      if (pixiWin.PIXI?.live2d?.Live2DModel) {
        resolve();
      } else {
        reject(new Error("pixi-live2d-display 脚本已加载但 PIXI.live2d.Live2DModel 未注入"));
      }
    };
    script.onerror = () => reject(new Error("加载 pixi-live2d-display 脚本失败"));
    document.head.appendChild(script);
  });

  return w.__pixiLive2DLoadingPromise__;
};

const getLive2DModel = async () => {
  if (_Live2DModel) return _Live2DModel;
  ensurePIXIGlobal();
  await loadPixiLive2DDisplay();

  const pixiWin = window as typeof window & { PIXI?: { live2d?: { Live2DModel?: Live2DModelConstructor } } };
  const Live2DModelClass = pixiWin.PIXI?.live2d?.Live2DModel;
  if (!Live2DModelClass) {
    throw new Error("PIXI.live2d.Live2DModel 未找到");
  }

  _Live2DModel = Live2DModelClass;
  _Live2DModel.registerTicker(PIXI.Ticker);
  return _Live2DModel;
};

type MutableLive2DModel = InstanceType<Live2DModelConstructor> &
  DisplayObject & {
    width: number;
    height: number;
    scale: { set: (value: number) => void };
    x: number;
    y: number;
    anchor?: { set: (x: number, y: number) => void };
    eventMode?: string;
    interactive?: boolean;
    hitArea?: unknown;
    expression?: (name: string) => Promise<void> | void;
    motion?: (group: string, index?: number) => Promise<void> | void;
  };

export class Live2DLoader {
  private app: Application | null = null;
  private model: MutableLive2DModel | null = null;
  private container: HTMLElement | null = null;
  private currentModelPath = defaultModelPath;
  private destroyed = false;

  constructor() {
    // 不在 constructor 里初始化 PIXI，延迟到 mount 时
  }

  private initPixiApp(containerWidth: number, containerHeight: number) {
    const canvas = document.createElement("canvas");

    this.app = new Application({
      width: containerWidth || LIVE2D_CONFIG.render.width,
      height: containerHeight || LIVE2D_CONFIG.render.height,
      view: canvas,
      backgroundAlpha: 0,
      resolution: LIVE2D_CONFIG.render.pixelRatio,
      autoDensity: true,
    } as never);

    if (LIVE2D_CONFIG.debug) {
      logger.log("[Live2D] PIXI Application initialized", {
        width: containerWidth,
        height: containerHeight,
      });
    }
  }

  async mount(container: HTMLElement, initialModelPath: string = defaultModelPath): Promise<void> {
    if (this.destroyed) {
      throw new Error("Live2DLoader has been destroyed, create a new instance");
    }
    this.container = container;
    this.currentModelPath = initialModelPath || defaultModelPath;

    // 获取容器实际尺寸
    const rect = container.getBoundingClientRect();
    const width = rect.width || LIVE2D_CONFIG.render.width;
    const height = rect.height || LIVE2D_CONFIG.render.height;

    // 如果已有 app，先销毁
    if (this.app) {
      this.app.destroy(true);
      this.app = null;
    }

    this.initPixiApp(width, height);

    if (!this.app) {
      throw new Error("PIXI Application not initialized");
    }

    const app = this.app as Application & { view: HTMLCanvasElement };
    // 禁用全局 interaction manager，避免 processPointerOverOut 报错
    if (app.renderer.plugins.interaction) {
      app.renderer.plugins.interaction.destroy();
      delete (app.renderer.plugins as Record<string, unknown>).interaction;
    }

    container.textContent = "";
    if (app.view) {
      const canvas = app.view;
      canvas.style.display = "block";
      canvas.style.maxWidth = "100%";
      canvas.style.maxHeight = "100%";
      container.appendChild(canvas);
    }

    await this.loadModel(this.currentModelPath);
  }

  async switchModel(nextModelPath: string): Promise<void> {
    const normalizedPath = nextModelPath || defaultModelPath;
    if (!this.app) {
      this.currentModelPath = normalizedPath;
      return;
    }

    if (this.currentModelPath === normalizedPath && this.model) {
      return;
    }

    this.currentModelPath = normalizedPath;
    await this.loadModel(normalizedPath);
  }

  private async loadModel(nextModelPath: string = this.currentModelPath): Promise<void> {
    if (!this.app) {
      throw new Error("PIXI Application not initialized");
    }

    const modelUrl = nextModelPath || this.currentModelPath || defaultModelPath;
    
    try {
      if (this.model) {
        this.app.stage.removeChild(this.model as unknown as DisplayObject);
        this.model.destroy();
        this.model = null;
      }

      // 检查 Cubism Core 是否加载
      if (typeof window !== "undefined" && !(window as unknown as Record<string, unknown>).Live2DCubismCore) {
        logger.warn("[Live2D] Cubism Core not loaded, attempting to load...");
        const sources = [
          '/live2d/sdk/live2dcubismcore.min.js',
          'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
        ];
        let loaded = false;
        for (const src of sources) {
          try {
            await new Promise<void>((resolve, reject) => {
              const script = document.createElement('script');
              script.src = src;
              script.onload = () => {
                if ((window as unknown as Record<string, unknown>).Live2DCubismCore) {
                  resolve();
                } else {
                  reject(new Error('Cubism Core script loaded but global not defined'));
                }
              };
              script.onerror = () => reject(new Error(`Failed to load Cubism Core from ${src}`));
              document.head.appendChild(script);
            });
            loaded = true;
            break;
          } catch (e) {
            logger.warn(`[Live2D] ⚠️ Cubism Core 从 ${src} 加载失败:`, e);
          }
        }
        if (!loaded) {
          throw new Error('所有 Cubism Core 加载源均失败');
        }
      }

      const Live2DModel = await getLive2DModel();
      
      // 验证模型 URL 是否可访问
      try {
        const response = await fetch(modelUrl);
        if (!response.ok) {
          throw new Error(`Model file not found: ${response.status} ${modelUrl}`);
        }
      } catch (fetchError) {
        logger.warn(`[Live2D] Model fetch check failed, trying anyway:`, fetchError);
      }

      this.model = (await Live2DModel.from(modelUrl)) as unknown as MutableLive2DModel;

      await new Promise<void>((resolve) => {
        const internalModel = (this.model as unknown as {
          internalModel?: { motionManager?: unknown };
        }).internalModel;

        if (internalModel?.motionManager) {
          resolve();
          return;
        }

        const readyTimeout = setTimeout(() => {
          logger.warn('[Live2D] ⚠️ 等待模型 ready 超时，强制继续');
          resolve();
        }, 5000);

        const handler = () => {
          clearTimeout(readyTimeout);
          resolve();
        };

        this.model?.once?.('ready', handler);
      });

      // 禁用模型的交互，避免 PIXI interaction 报错
      this.model.eventMode = 'none';
      this.model.interactive = false;

      this.app.stage.addChild(this.model as unknown as DisplayObject);
      this.adjustModel();

      if (LIVE2D_CONFIG.debug) {
        logger.log("[Live2D] Model loaded successfully", { modelPath: modelUrl });
      }
    } catch (error) {
      logger.error("[Live2D] Failed to load model:", error);
      logger.warn("[Live2D] Model loading failed, canvas will remain empty");
    }
  }

  private adjustModel(): void {
    if (!this.model || !this.app) return;

    const dpr = LIVE2D_CONFIG.render.pixelRatio || window.devicePixelRatio || 1;
    const canvasW = this.app.screen.width / dpr;
    const canvasH = this.app.screen.height / dpr;

    const rawW = (this.model as unknown as { internalModel?: { width?: number } }).internalModel?.width
      ?? this.model.width / ((this.model.scale as { x?: number }).x || 1);
    const rawH = (this.model as unknown as { internalModel?: { height?: number } }).internalModel?.height
      ?? this.model.height / ((this.model.scale as { y?: number }).y || 1);

    if (rawW > 0 && rawH > 0) {
      const scale = Math.min(canvasW / rawW, canvasH / rawH) * 0.9;
      this.model.scale.set(scale);
    }

    this.model.x = canvasW / 2;
    this.model.y = canvasH * 0.92;
    this.model.anchor?.set?.(0.5, 1);

    if (LIVE2D_CONFIG.debug) {
      logger.log("[Live2D] Model adjusted:", { scale: this.model.scale, x: this.model.x, y: this.model.y, dpr });
    }
  }

  async updateExpression(expressionName: string): Promise<void> {
    if (!this.model?.expression) return;
    const internalModel = (this.model as unknown as {
      internalModel?: { motionManager?: { expressionManager?: unknown } };
    }).internalModel;
    if (!internalModel?.motionManager?.expressionManager) {
      logger.warn('[Live2D] ⚠️ expressionManager 不存在，跳过表情设置');
      return;
    }

    try {
      await this.model.expression(expressionName);
      if (LIVE2D_CONFIG.debug) {
        logger.log("[Live2D] Expression updated:", expressionName);
      }
    } catch (error) {
      logger.error("[Live2D] Failed to update expression:", error);
    }
  }

  async playMotion(group: string = "idle", index: number = 0): Promise<void> {
    if (!this.model?.motion) return;
    const internalModel = (this.model as unknown as {
      internalModel?: { motionManager?: { queueManager?: unknown } };
    }).internalModel;
    if (!internalModel?.motionManager?.queueManager) {
      logger.warn('[Live2D] ⚠️ queueManager 不存在，跳过动作播放');
      return;
    }

    try {
      await this.model.motion(group, index);
      if (LIVE2D_CONFIG.debug) {
        logger.log("[Live2D] Motion played:", { group, index });
      }
    } catch (error) {
      logger.error("[Live2D] Failed to play motion:", error);
    }
  }

  resize(width: number, height: number): void {
    if (!this.app) return;

    this.app.renderer.resize(width, height);
    this.adjustModel();

    if (LIVE2D_CONFIG.debug) {
      logger.log("[Live2D] Resized:", { width, height });
    }
  }

  destroy(): void {
    this.destroyed = true;

    if (this.model) {
      this.model.destroy();
      this.model = null;
    }

    if (this.app) {
      this.app.destroy(true);
      this.app = null;
    }

    if (this.container) {
      this.container.textContent = "";
      this.container = null;
    }

    // 清理单例引用
    if (live2DLoader === this) {
      live2DLoader = null;
    }

    if (LIVE2D_CONFIG.debug) {
      logger.log("[Live2D] Destroyed");
    }
  }

  getModel() {
    return this.model;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }
}

let live2DLoader: Live2DLoader | null = null;

export const getLive2DLoader = (): Live2DLoader => {
  if (!live2DLoader || live2DLoader.isDestroyed()) {
    live2DLoader = new Live2DLoader();
  }
  return live2DLoader;
};