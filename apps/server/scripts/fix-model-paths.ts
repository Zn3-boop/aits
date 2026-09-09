/**
 * 数据库 Live2D 模型路径修复脚本
 * 扫描所有已上传的模型目录，自动修复数据库中错误的路径
 */

import { PrismaClient } from '@prisma/client';
import { readdirSync, existsSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// 获取当前脚本的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

// Live2D 模型目录 - 使用绝对路径
const MODELS_DIR = resolve('d:/aits.1/apps/web/public/live2d/models');

interface FoundModel {
  code: string;
  actualPath: string;
  modelFile: string;
}

function findActualModel3Json(dir: string): string | null {
  try {
    const files = readdirSync(dir);
    // 先检查是否有直接的 model3.json
    const direct = files.find(f => f === 'model3.json');
    if (direct) return direct;
    // 查找 xxx.model3.json
    const named = files.find(f => f.endsWith('.model3.json'));
    if (named) return named;
    // 搜索子目录
    const subDirs = files.filter(f => {
      try { return statSync(join(dir, f)).isDirectory(); } catch { return false; }
    });
    for (const sub of subDirs) {
      const found = findActualModel3Json(join(dir, sub));
      if (found) return found;
    }
  } catch { /* ignore */ }
  return null;
}

async function scanModels(): Promise<FoundModel[]> {
  const models: FoundModel[] = [];
  
  if (!existsSync(MODELS_DIR)) {
    console.log('❌ 模型目录不存在:', MODELS_DIR);
    return models;
  }

  const dirs = readdirSync(MODELS_DIR).filter(name => {
    const path = join(MODELS_DIR, name);
    return statSync(path).isDirectory();
  });

  for (const dir of dirs) {
    const modelPath = join(MODELS_DIR, dir);
    const modelFile = findActualModel3Json(modelPath);
    
    if (modelFile) {
      // 构建相对路径
      const relativePath = `/live2d/models/${dir}/${modelFile}`;
      models.push({
        code: dir,
        actualPath: relativePath,
        modelFile,
      });
      console.log(`✅ 找到模型 [${dir}]: ${relativePath}`);
    } else {
      console.log(`⚠️  模型目录 [${dir}] 未找到 model3.json`);
    }
  }

  return models;
}

async function fixDatabasePaths() {
  console.log('🔍 扫描已上传的 Live2D 模型...\n');
  console.log('📁 模型目录:', MODELS_DIR);
  
  const foundModels = await scanModels();
  
  if (foundModels.length === 0) {
    console.log('\n❌ 没有找到任何有效的 Live2D 模型');
    return;
  }

  console.log('\n📋 更新数据库中的路径...\n');

  for (const model of foundModels) {
    const existing = await prisma.live2DModel.findFirst({
      where: { code: model.code }
    });

    if (existing) {
      if (existing.path !== model.actualPath) {
        console.log(`🔄 更新 [${model.code}]: ${existing.path} -> ${model.actualPath}`);
        await prisma.live2DModel.update({
          where: { id: existing.id },
          data: { path: model.actualPath }
        });
      } else {
        console.log(`✅ 路径已正确 [${model.code}]: ${model.actualPath}`);
      }
    } else {
      console.log(`⚠️  数据库中未找到模型 [${model.code}]`);
    }
  }

  console.log('\n✨ 修复完成！');
}

fixDatabasePaths()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
