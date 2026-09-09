/**
 * Live2D Cubism 2/3 格式加载器
 * 用于加载 .can3, .cmo3 等 Cubism 2/3 格式模型
 */

import * as PIXI from "pixi.js";
import { logger } from "../logger";

// 动态导入 Cubism 2
let Cubism2Model: unknown = null;

const _loadCubism2 = async () => {
  if (Cubism2Model) return Cubism2Model;
  try {
    const pixiWin = window as typeof window & { PIXI?: { live2d?: { Live2DModel?: unknown } } };
    if (pixiWin.PIXI?.live2d?.Live2DModel) {
      Cubism2Model = pixiWin.PIXI.live2d.Live2DModel;
      return Cubism2Model;
    }
    logger.warn("[Live2D v2] Cubism 2 加载器不可用，请使用 Cubism 4 格式模型");
    return null;
  } catch {
    logger.warn("[Live2D v2] Cubism 2 加载器不可用，请使用 Cubism 4 格式模型");
    return null;
  }
};

type Cubism2Live2DModel = {
  width: number;
  height: number;
  scale: { set: (value: number) => void };
  x: number;
  y: number;
  anchor?: { set: (x: number, y: number) => void };
  motion?: (group: string, index?: number) => Promise<void> | void;
  expression?: (id: string) => void;
};

export class Cubism2Loader {
  private app: PIXI.Application | null = null;
  private model: Cubism2Live2DModel | null = null;
  private container: HTMLElement | null = null;
  private destroyed = false;

  async mount(container: HTMLElement, modelPath: string): Promise<void> {
    if (this.destroyed) {
      throw new Error("Cubism2Loader has been destroyed");
    }

    if (!Cubism2Model) {
      throw new Error("Cubism 2 加载器未安装，请使用 Cubism 4 格式模型");
    }

    this.container = container;

    const rect = container.getBoundingClientRect();
    const width = rect.width || 400;
    const height = rect.height || 600;

    if (this.app) {
      this.app.destroy(true);
      this.app = null;
    }

    this.app = new PIXI.Application({
      width,
      height,
      backgroundAlpha: 0,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    } as never);

    const view = this.app.view as HTMLCanvasElement;
    view.style.width = "100%";
    view.style.height = "100%";
    view.style.display = "block";
    container.textContent = "";
    container.appendChild(view);

    await this.loadModel(modelPath);
  }

  private async loadModel(modelPath: string): Promise<void> {
    if (!this.app) {
      throw new Error("Application not initialized");
    }

    if (this.model) {
      this.app.stage.removeChild(this.model as unknown as PIXI.DisplayObject);
      this.model = null;
    }

    try {
      this.model = await (Cubism2Model as { from: (path: string) => Promise<Cubism2Live2DModel> }).from(modelPath);
      
      const safeWidth = this.model.width || 200;
      const safeHeight = this.model.height || 300;
      const scale = Math.min(this.app.screen.width / safeWidth, this.app.screen.height / safeHeight) * 0.85;
      this.model.scale.set(scale);
      this.model.x = this.app.screen.width / 2;
      this.model.y = this.app.screen.height / 2;
      this.model.anchor?.set?.(0.5, 0.5);

      this.app.stage.addChild(this.model as unknown as PIXI.DisplayObject);
      logger.log("[Live2D v2] 模型加载成功:", modelPath);
    } catch (error) {
      logger.error("[Live2D v2] 加载失败:", error);
      throw error;
    }
  }

  async updateExpression(expressionName: string): Promise<void> {
    if (!this.model?.expression) return;
    try {
      await this.model.expression(expressionName);
    } catch {
      logger.warn("[Live2D v2] Expression not supported:", expressionName);
    }
  }

  async playMotion(group: string = "idle", index: number = 0): Promise<void> {
    if (!this.model?.motion) return;
    try {
      await this.model.motion(group, index);
    } catch {
      logger.warn("[Live2D v2] Motion not supported:", group);
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.model) {
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
  }
}

export const detectModelFormat = (path: string): 'cubism2' | 'cubism3' | 'cubism4' => {
  if (path.endsWith('.can3') || path.endsWith('.cmo3') || path.endsWith('.model.json')) {
    return 'cubism2';
  }
  if (path.endsWith('.model3.json')) {
    return 'cubism4';
  }
  if (path.includes('.can3') || path.includes('.cmo3')) {
    return 'cubism2';
  }
  return 'cubism4'; // 默认使用 v4
};