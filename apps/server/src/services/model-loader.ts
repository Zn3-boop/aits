import { getAvailableModels } from './model-registry.js';
import type { Live2DManager } from '../types/live2d.js';
import { logger } from '../utils/logger.js';

/**
 * 模型加载降级服务
 * 提供模型加载失败时的降级策略
 */
export class ModelLoader {
  private live2dManager: Live2DManager;
  private currentModelKey: string = '';
  private staticAvatarElement: HTMLElement | null = null;

  constructor(live2dManager: Live2DManager) {
    this.live2dManager = live2dManager;
  }

  /**
   * 加载模型，支持降级
   * @param modelKey 模型键
   * @param showToast 显示Toast的回调函数
   */
  async loadModelWithFallback(
    modelKey: string,
    showToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void
  ): Promise<void> {
    const models = await getAvailableModels();
    const model = models.find((m) => m.modelKey === modelKey);

    if (!model) {
      throw new Error(`模型不存在: ${modelKey}`);
    }

    try {
      // 尝试加载目标模型
      await this.live2dManager.loadModel(model.modelPath);
      this.currentModelKey = modelKey;
      return;
    } catch (err) {
      logger.warn(`模型 ${modelKey} 加载失败，尝试降级:`, String(err));
      if (showToast) {
        showToast(`模型 ${modelKey} 加载失败，尝试降级`, 'warning');
      }
    }

    // 降级到内置默认模型（haru）
    if (modelKey !== 'haru') {
      try {
        const fallback = models.find((m) => m.modelKey === 'haru');
        if (fallback) {
          await this.live2dManager.loadModel(fallback.modelPath);
          this.currentModelKey = 'haru';
          if (showToast) {
            showToast('角色模型加载失败，已切换为默认形象', 'warning');
          }
          return;
        }
      } catch (err) {
        logger.warn('默认模型加载失败:', String(err));
      }
    }

    // 全部失败，显示静态头像
    if (showToast) {
      showToast('角色模型加载失败，显示静态头像', 'error');
    }
    this.showStaticAvatar();
  }

  /**
   * 带超时的模型加载
   * @param modelPath 模型路径
   * @param timeout 超时时间（毫秒）
   */
  async loadWithTimeout(modelPath: string, timeout: number = 10000): Promise<void> {
    return Promise.race([
      this.live2dManager.loadModel(modelPath),
      new Promise<void>((_, reject) => 
        setTimeout(() => reject(new Error('模型加载超时')), timeout)
      )
    ]);
  }

  /**
   * 显示静态头像
   */
  private showStaticAvatar(): void {
    // 这里应该实现显示静态头像的逻辑
    // 实际实现需要根据项目需求调整
    logger.info('显示静态头像');

    // 创建静态头像元素
    if (!this.staticAvatarElement) {
      this.staticAvatarElement = document.createElement('div');
      this.staticAvatarElement.className = 'static-avatar';
      this.staticAvatarElement.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 300px;
        height: 300px;
        background: #f0f0f0;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 80px;
      `;
      this.staticAvatarElement.textContent = '👤';
    }

    // 添加到容器
    const container = document.querySelector('.live2d-container');
    if (container) {
      container.appendChild(this.staticAvatarElement);
    }
  }

  /**
   * 清理静态头像
   */
  private clearStaticAvatar(): void {
    if (this.staticAvatarElement && this.staticAvatarElement.parentNode) {
      this.staticAvatarElement.parentNode.removeChild(this.staticAvatarElement);
    }
    this.staticAvatarElement = null;
  }

  /**
   * 获取当前模型键
   */
  getCurrentModelKey(): string {
    return this.currentModelKey;
  }
}