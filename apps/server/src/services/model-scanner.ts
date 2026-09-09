import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { defaultPersonas } from '../config/default-personas.js';

export type Live2DModelEntry = {
  id: string;
  name: string;
  path: string;
};

function searchInDir(dir: string, basePath: string): string | null {
  try {
    const files = readdirSync(dir);
    if (files.includes('model3.json')) {
      return posix.join(basePath, 'model3.json');
    }
    const modelFile = files.find(f => f.endsWith('.model3.json'));
    if (modelFile) {
      return posix.join(basePath, modelFile);
    }
    const subDirs = files.filter(f => {
      try {
        return statSync(join(dir, f)).isDirectory();
      } catch {
        return false;
      }
    });
    for (const subDir of subDirs) {
      const result = searchInDir(join(dir, subDir), posix.join(basePath, subDir));
      if (result) return result;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function scanLive2DModels(publicDir: string): Live2DModelEntry[] {
  if (!existsSync(publicDir)) {
    return defaultPersonas.map(item => ({
      id: item.id,
      path: item.modelPath,
      name: item.name,
    }));
  }

  const folders = readdirSync(publicDir, { withFileTypes: true }).filter(entry => entry.isDirectory());

  return folders.map(entry => {
    const modelDir = join(publicDir, entry.name);
    let modelPath = posix.join('/live2d/models', entry.name, `${entry.name}.model3.json`);
    const foundPath = searchInDir(modelDir, posix.join('/live2d/models', entry.name));
    if (foundPath) modelPath = foundPath;
    return { id: entry.name, name: entry.name, path: modelPath };
  });
}