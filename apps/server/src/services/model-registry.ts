import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

export interface RegisteredModel {
  id: string;
  modelKey: string;
  name: string;
  modelPath: string;
  category: 'builtin' | 'custom';
  available: boolean;
}

const registry = new Map<string, RegisteredModel>();

const scanModelDirectories = (): RegisteredModel[] => {
  const dirs: Array<{ dir: string; category: 'builtin' | 'custom' }> = [
    { dir: 'public/live2d/builtin', category: 'builtin' },
    { dir: 'public/live2d/custom', category: 'custom' }
  ];

  const models: RegisteredModel[] = [];

  for (const { dir, category } of dirs) {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      continue;
    }

    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const modelDir = path.join(fullPath, entry.name);
      const files = fs.readdirSync(modelDir);
      const modelFile = files.find((file) => file.endsWith('.model3.json'));
      if (!modelFile) continue;

      const modelKey = entry.name;
      models.push({
        id: modelKey,
        modelKey,
        name: entry.name.charAt(0).toUpperCase() + entry.name.slice(1),
        modelPath: `/${dir.replace('public', '')}/${entry.name}/${modelFile}`,
        category,
        available: true
      });
    }
  }

  return models;
};

/**
 * 同步模型注册表
 */
export async function syncModelRegistry() {
  registry.clear();
  for (const model of scanModelDirectories()) {
    registry.set(model.modelKey, model);
  }
  logger.info('模型注册表同步完成');
}

/**
 * 获取所有可用模型
 */
export async function getAvailableModels() {
  if (registry.size === 0) {
    await syncModelRegistry();
  }

  return Array.from(registry.values())
    .filter((model) => model.available)
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

/**
 * 获取所有模型（包括不可用的）
 */
export async function getAllModels() {
  if (registry.size === 0) {
    await syncModelRegistry();
  }

  return Array.from(registry.values()).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

/**
 * 删除自定义模型
 */
export async function deleteCustomModel(modelKey: string) {
  if (registry.size === 0) {
    await syncModelRegistry();
  }

  const model = registry.get(modelKey);
  if (!model) {
    throw new Error('模型不存在');
  }

  if (model.category === 'builtin') {
    throw new Error('内置模型不可删除');
  }

  registry.delete(modelKey);
  return { success: true };
}