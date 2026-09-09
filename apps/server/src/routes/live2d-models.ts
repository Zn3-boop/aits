/**
 * Live2D 模型上传服务
 * 
 * 职责：
 * 1. 校验上传的 zip 包是否符合 Live2D Cubism 结构
 * 2. 检查 model3.json 是否存在
 * 3. 解压到 public/live2d/ 目录
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import JSZip from 'jszip';
import { join, resolve, basename } from 'node:path';
import { prisma } from '../db.js';
import { requireAuth } from '../auth.js';
import { logger } from '../utils/logger.js';

// 公共目录
const PUBLIC_LIVE2D_DIR = resolve(process.cwd(), '../web/public/live2d/models');

// ============================================================
// 类型定义
// ============================================================

interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
  modelPath?: string;
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 递归查找实际的 model3.json 文件
 * 返回相对于 baseDir 的路径
 */
const findActualModel3Json = (dir: string, baseDir: string = dir): { relativePath: string; fullPath: string } | null => {
  try {
    const files = readdirSync(dir);
    // 先检查是否有直接的 model3.json
    const direct = files.find(f => f === 'model3.json');
    if (direct) {
      const fullPath = join(dir, direct);
      const relativePath = fullPath.replace(baseDir, '').replace(/\\/g, '/').replace(/^\//, '');
      return { relativePath, fullPath };
    }
    // 查找 xxx.model3.json
    const named = files.find(f => f.endsWith('.model3.json'));
    if (named) {
      const fullPath = join(dir, named);
      const relativePath = fullPath.replace(baseDir, '').replace(/\\/g, '/').replace(/^\//, '');
      return { relativePath, fullPath };
    }
    // 搜索子目录
    const subDirs = files.filter(f => {
      try { return statSync(join(dir, f)).isDirectory(); } catch { return false; }
    });
    for (const sub of subDirs) {
      const found = findActualModel3Json(join(dir, sub), baseDir);
      if (found) return found;
    }
  } catch { /* ignore */ }
  return null;
};

// ============================================================
// 校验逻辑
// ============================================================

/**
 * 校验 Live2D 模型包结构
 */
export function validateLive2DStructure(extractedPath: string): ValidationResult {
  const warnings: string[] = [];

  // 1. 检查 model3.json 是否存在（支持 xxx.model3.json 格式）
  const model3JsonPath = join(extractedPath, 'model3.json');
  if (!existsSync(model3JsonPath)) {
    // 尝试在子目录中查找 model3.json 或 xxx.model3.json
    const searchDirs = ['runtime', 'models', 'live2d', ''];
    for (const dir of searchDirs) {
      const searchPath = dir ? join(extractedPath, dir) : extractedPath;
      try {
        const files = readdirSync(searchPath);
        const modelFile = files.find(f => f.endsWith('.model3.json'));
        if (modelFile) {
          const fullPath = join(searchPath, modelFile);
          const relativePath = fullPath.replace(extractedPath, '').replace(/\\/g, '/');
          const modelBaseDir = relativePath.replace('/' + modelFile, '');
          warnings.push(`找到模型文件: ${modelFile}`);
          return { valid: true, warnings, modelPath: modelBaseDir || '/' };
        }
      } catch {
        // 目录不存在，继续搜索
      }
    }

    return {
      valid: false,
      error: '缺少 model3.json 或 xxx.model3.json 文件。Live2D 模型包必须包含模型文件。'
    };
  }

  // 2. 检查 textures 目录
  const texturesPaths = [
    join(extractedPath, 'textures'),
    join(extractedPath, 'texture'),
    join(extractedPath, 'runtime/textures'),
  ];

  let hasTextures = false;
  for (const path of texturesPaths) {
    if (existsSync(path) && readdirSync(path).length > 0) {
      hasTextures = true;
      break;
    }
  }

  if (!hasTextures) {
    warnings.push('未找到 textures 目录，模型可能无法正常显示');
  }

  // 3. 检查 motions 和 expressions 目录（可选）
  const optionalDirs = ['motions', 'expressions', 'physics'];
  for (const dir of optionalDirs) {
    const path = join(extractedPath, dir);
    if (!existsSync(path)) {
      warnings.push(`缺少 ${dir} 目录（可选）`);
    }
  }

  return {
    valid: true,
    warnings,
    modelPath: ''
  };
}

/**
 * 提取文件名中的安全字符
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .trim();
}

// ============================================================
// 路由
// ============================================================

export async function live2dRoutes(fastify: FastifyInstance) {

  // 确保目录存在
  if (!existsSync(PUBLIC_LIVE2D_DIR)) {
    mkdirSync(PUBLIC_LIVE2D_DIR, { recursive: true });
  }

  // POST /api/live2d/upload - 上传 Live2D 模型
  fastify.post('/api/live2d/upload', {
    preHandler: requireAuth,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;

    // 验证用户存在
    const userExists = await prisma.user.findUnique({ where: { id: userId } });
    if (!userExists) {
      logger.error('[Live2D Upload] User not found in DB:', userId);
      return reply.status(401).send({ error: 'USER_NOT_FOUND', message: '用户不存在，请重新登录' });
    }
    logger.info('[Live2D Upload] User validated:', userId, userExists.username);

    try {
      // 诊断日志
      logger.info('[Live2D Upload] content-type:', String(request.headers['content-type']));
      
      // 获取上传的文件
      const data = await request.file();
      logger.info('[Live2D Upload] has file?', String(!!data), 'filename:', data?.filename);
      
      if (!data) {
        return reply.status(400).send({ error: 'NO_FILE', message: '请上传文件' });
      }

      const file = data.file;
      const originalFilename = data.filename || 'model.zip';

      // 校验文件类型
      if (!originalFilename.toLowerCase().endsWith('.zip')) {
        return reply.status(400).send({
          error: 'INVALID_FILE',
          message: '只支持 .zip 格式的压缩包'
        });
      }

      // 生成模型代码和目录名
      const modelName = sanitizeFilename(basename(originalFilename, '.zip'));
      const modelCode = `model_${Date.now()}`;
      const modelDir = join(PUBLIC_LIVE2D_DIR, modelCode);

      // 创建模型目录
      mkdirSync(modelDir, { recursive: true });

      // 读取上传文件内容
      const chunks: Buffer[] = [];
      for await (const chunk of file) {
        chunks.push(Buffer.from(chunk));
      }
      const fileBuffer = Buffer.concat(chunks);

      // 使用 JSZip 解压
      const zip = await JSZip.loadAsync(fileBuffer);
      
      // 提取所有文件 - 使用 Promise.all 正确等待
      const files: { relativePath: string; file: any }[] = [];
      zip.forEach((relativePath, file) => {
        if (!file.dir) {
          files.push({ relativePath, file });
        }
      });
      
      // 并行写入所有文件
      await Promise.all(files.map(async ({ relativePath, file }) => {
        const targetPath = join(modelDir, relativePath);
        const targetDir = join(modelDir, relativePath.split('/').slice(0, -1).join('/'));
        
        // 确保目录存在
        if (!existsSync(targetDir)) {
          mkdirSync(targetDir, { recursive: true });
        }
        
        // 写入文件
        const content = await file.async('nodebuffer');
        await fs.writeFile(targetPath, content);
      }));

      // 查找解压后的内容
      let extractedDirs: string[] = [];
      try {
        extractedDirs = readdirSync(modelDir).filter(name => {
          const path = join(modelDir, name);
          return statSync(path).isDirectory();
        });
      } catch {
        extractedDirs = [];
      }

      let validation: ValidationResult = { valid: false, warnings: [] };
      let model3Path = '';
      let modelPath = '';
      let foundValid = false;

      if (extractedDirs.length === 0) {
        // 没有子目录，压缩包内容直接是文件
        validation = validateLive2DStructure(modelDir);
        if (!validation.valid) {
          // 清理
          await fs.rm(modelDir, { recursive: true, force: true });
          return reply.status(400).send({
            error: 'INVALID_STRUCTURE',
            message: validation.error
          });
        }
        // 查找实际的 model3.json 文件（支持 xxx.model3.json 格式）
        const found = findActualModel3Json(modelDir);
        if (found) {
          model3Path = `/live2d/models/${modelCode}/${found.relativePath}`;
        } else {
          model3Path = `/live2d/models/${modelCode}/model3.json`;
        }
        modelPath = `/live2d/models/${modelCode}/`;
        foundValid = true;
      } else {
        // 有子目录，查找有效的模型结构（包括嵌套在 runtime/ 下的 xxx.model3.json）
        
        // 1. 先检查直接子目录
        for (const dir of extractedDirs) {
          const dirPath = join(modelDir, dir);
          const result = validateLive2DStructure(dirPath);
          if (result.valid) {
            validation = result;
            // 使用 findActualModel3Json 查找实际文件及其相对路径
            const found = findActualModel3Json(dirPath, modelDir);
            if (found) {
              model3Path = `/live2d/models/${modelCode}/${found.relativePath}`;
              modelPath = `/live2d/models/${modelCode}/` + found.relativePath.replace(/\/[^/]*\.model3\.json$/, '/');
            } else {
              model3Path = `/live2d/models/${modelCode}/${dir}/model3.json`;
              modelPath = `/live2d/models/${modelCode}/${dir}/`;
            }
            foundValid = true;
            break;
          }
        }
        
        // 2. 如果没找到，检查二级子目录（runtime/ 等嵌套结构）
        if (!foundValid) {
          for (const dir of extractedDirs) {
            const dirPath = join(modelDir, dir);
            try {
              const subDirs = readdirSync(dirPath).filter(name => {
                const subPath = join(dirPath, name);
                return statSync(subPath).isDirectory();
              });
              for (const subDir of subDirs) {
                const subPath = join(dirPath, subDir);
                const result = validateLive2DStructure(subPath);
                if (result.valid) {
                  validation = result;
                  // 使用 findActualModel3Json 查找实际文件及其相对路径
                  const found = findActualModel3Json(subPath, modelDir);
                  if (found) {
                    model3Path = `/live2d/models/${modelCode}/${found.relativePath}`;
                    modelPath = `/live2d/models/${modelCode}/` + found.relativePath.replace(/\/[^/]*\.model3\.json$/, '/');
                  } else {
                    model3Path = `/live2d/models/${modelCode}/${dir}/${subDir}/model3.json`;
                    modelPath = `/live2d/models/${modelCode}/${dir}/${subDir}/`;
                  }
                  foundValid = true;
                  break;
                }
              }
              if (foundValid) break;
            } catch { /* skip */ }
          }
        }

        if (!foundValid) {
          // 清理
          await fs.rm(modelDir, { recursive: true, force: true });
          return reply.status(400).send({
            error: 'INVALID_STRUCTURE',
            message: '压缩包中未找到有效的 Live2D 模型结构（缺少 model3.json）'
          });
        }
      }

      // 保存到数据库
      const live2dModel = await prisma.live2DModel.create({
        data: {
          userId,
          code: modelCode,
          name: modelName,
          path: model3Path,
          isSystem: false,
          isActive: true,
        }
      });

      return reply.send({
        success: true,
        model: {
          id: live2dModel.id,
          code: live2dModel.code,
          name: live2dModel.name,
          path: model3Path,
        },
        warnings: validation?.warnings || []
      });

    } catch (error) {
      logger.error('Live2D upload error:', String(error));
      return reply.status(500).send({
        error: 'UPLOAD_FAILED',
        message: error instanceof Error ? error.message : '上传失败'
      });
    }
  });

  // GET /api/live2d/models - 获取用户的 Live2D 模型列表
  fastify.get('/api/live2d/models', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;

    const models = await prisma.live2DModel.findMany({
      where: {
        OR: [
          { userId },
          { isSystem: true }
        ],
        isActive: true,
      },
      orderBy: [
        { isSystem: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    return reply.send({ models });
  });

  // DELETE /api/live2d/models/:code - 删除模型
  fastify.delete('/api/live2d/models/:code', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const { code } = request.params as { code: string };

    const model = await prisma.live2DModel.findFirst({
      where: { code, userId, isSystem: false }
    });

    if (!model) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '模型不存在或无法删除系统模型' });
    }

    // 软删除
    await prisma.live2DModel.update({
      where: { id: model.id },
      data: { isActive: false }
    });

    return reply.send({ success: true });
  });

  // GET /api/live2d/models/:code/validate - 校验模型
  fastify.get('/api/live2d/models/:code/validate', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.params as { code: string };

    const model = await prisma.live2DModel.findFirst({
      where: { code, isActive: true }
    });

    if (!model) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '模型不存在' });
    }

    const modelPath = resolve(PUBLIC_LIVE2D_DIR, '..', '..', 'web', 'public', model.path.replace(/^\//, ''));
    const validation = validateLive2DStructure(modelPath);

    return reply.send({
      valid: validation.valid,
      error: validation.error,
      warnings: validation.warnings,
      modelPath: model.path
    });
  });

  // POST /api/live2d/models/:code/fix-path - 修复模型路径（针对之前上传的模型）
  fastify.post('/api/live2d/models/:code/fix-path', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.params as { code: string };

    const model = await prisma.live2DModel.findFirst({
      where: { code, isActive: true }
    });

    if (!model) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '模型不存在' });
    }

    // 构建模型目录的绝对路径
    const modelDir = resolve(PUBLIC_LIVE2D_DIR, code);
    
    if (!existsSync(modelDir)) {
      return reply.status(400).send({ error: 'DIR_NOT_FOUND', message: '模型目录不存在' });
    }

    // 查找实际的 model3.json 文件
    const found = findActualModel3Json(modelDir);
    
    if (!found) {
      return reply.status(400).send({ error: 'MODEL_NOT_FOUND', message: '未找到 model3.json 文件' });
    }

    // 计算正确的相对路径
    const correctPath = `/live2d/models/${code}/${found.relativePath}`;
    
    // 如果路径已经正确，直接返回
    if (model.path === correctPath) {
      return reply.send({
        success: true,
        message: '路径已是最新',
        path: correctPath
      });
    }

    // 更新数据库中的路径
    const updated = await prisma.live2DModel.update({
      where: { id: model.id },
      data: { path: correctPath }
    });

    return reply.send({
      success: true,
      message: '路径已修复',
      oldPath: model.path,
      newPath: correctPath
    });
  });

  // POST /api/live2d/fix-all-paths - 修复所有模型路径（管理员用）
  fastify.post('/api/live2d/fix-all-paths', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;

    const models = await prisma.live2DModel.findMany({
      where: { userId, isActive: true }
    });

    const results: { code: string; name: string; oldPath: string; newPath: string; status: string }[] = [];

    for (const model of models) {
      const modelDir = resolve(PUBLIC_LIVE2D_DIR, model.code);
      
      if (!existsSync(modelDir)) {
        results.push({
          code: model.code,
          name: model.name,
          oldPath: model.path,
          newPath: '',
          status: '目录不存在'
        });
        continue;
      }

      const found = findActualModel3Json(modelDir);
      
      if (!found) {
        results.push({
          code: model.code,
          name: model.name,
          oldPath: model.path,
          newPath: '',
          status: '未找到model3.json'
        });
        continue;
      }

      const correctPath = `/live2d/models/${model.code}/${found.relativePath}`;
      
      if (model.path === correctPath) {
        results.push({
          code: model.code,
          name: model.name,
          oldPath: model.path,
          newPath: correctPath,
          status: '已是最新'
        });
        continue;
      }

      await prisma.live2DModel.update({
        where: { id: model.id },
        data: { path: correctPath }
      });

      results.push({
        code: model.code,
        name: model.name,
        oldPath: model.path,
        newPath: correctPath,
        status: '已修复'
      });
    }

    return reply.send({
      success: true,
      total: models.length,
      results
    });
  });
}