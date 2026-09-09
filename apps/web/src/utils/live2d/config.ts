/**
 * Live2D SDK 配置
 * 使用本地化的 SDK 文件，避免依赖外部 CDN
 */

// 模型路径配置
export const modelPath = "/live2d/models/kei_basic_free/runtime/kei_basic_free.model3.json";

export const LIVE2D_CONFIG = {
  // Live2D SDK 基础路径
  sdkBasePath: '/live2d/sdk',

  // 模型基础路径
  modelBasePath: '/live2d/models',

  // 动作基础路径
  motionBasePath: '/live2d/motions',

  // 默认模型配置
  defaultModel: {
    modelName: 'kei_basic_free',
    modelJson: 'kei_basic_free.model3.json',
  },

  // 渲染配置
  render: {
    width: 800,
    height: 600,
    pixelRatio: window.devicePixelRatio || 1,
  },

  // 调试模式
  debug: false,
} as const;

export type Live2DModelConfig = {
  modelName: string;
  modelJson: string;
  textures?: string[];
  motions?: {
    idle?: string[];
    tap?: string[];
  };
  physics?: string;
  pose?: string;
};

export const AVAILABLE_MODELS: Live2DModelConfig[] = [
  {
    modelName: 'kei_basic_free',
    modelJson: 'kei_basic_free.model3.json',
  },
  // 可以添加更多模型配置
];
