import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth.js';
import { prisma } from '../db.js';
import { readdirSync, existsSync, mkdirSync, createWriteStream, unlinkSync, renameSync, rmSync, readFileSync, copyFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const MODELS_DIR = join(process.cwd(), '../web/public/live2d/models');

// 确保目录存在
if (!existsSync(MODELS_DIR)) {
  mkdirSync(MODELS_DIR, { recursive: true });
}

/**
 * 获取下一个可用编号。
 * 001-099 预留给系统内置模型；用户上传从当前最大编号后继续。
 */
const getNextModelId = (): string => {
  if (!existsSync(MODELS_DIR)) return '001';

  const dirs = readdirSync(MODELS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const numbers = dirs
    .map(name => parseInt(name.split('_')[0], 10))
    .filter(n => !isNaN(n));

  const max = numbers.length > 0 ? Math.max(...numbers) : 0;
  return String(max + 1).padStart(3, '0');
};

/**
 * 递归查找 .model3.json 文件，返回完整路径。
 */
const findModel3Json = (dir: string): string | null => {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.model3.json')) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const found = findModel3Json(fullPath);
      if (found) return found;
    }
  }
  return null;
};

/**
 * 将模型文件完整路径转换为 web public 下可访问的 /live2d/... 路径。
 */
const toPublicLive2DPath = (fullPath: string, fallbackCode: string): string => {
  const rel = relative(MODELS_DIR, fullPath).replace(/\\/g, '/');
  return rel && !rel.startsWith('..')
    ? `/live2d/models/${rel}`
    : `/live2d/models/${fallbackCode}/runtime/model3.json`;
};

/**
 * 扫描已安装的模型。
 */
const scanInstalledModels = () => {
  if (!existsSync(MODELS_DIR)) return [];

  return readdirSync(MODELS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const [id, ...nameParts] = d.name.split('_');
      const modelDir = join(MODELS_DIR, d.name);
      const modelFile = findModel3Json(modelDir);

      return {
        code: d.name,
        id,
        name: nameParts.join('_') || d.name,
        path: modelFile ? toPublicLive2DPath(modelFile, d.name) : `/live2d/models/${d.name}/runtime/model3.json`,
        isSystem: parseInt(id, 10) < 100,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
};

// 递归复制目录的函数
const copyDirRecursive = (src: string, dest: string) => {
  if (!existsSync(src)) {
    throw new Error(`Source directory does not exist: ${src}`);
  }
  
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      const srcStat = statSync(srcPath);
      if (srcStat.isFile()) {
        copyFileSync(srcPath, destPath);
      }
    }
  }
};

const unzipModel = (zipPath: string, extractDir: string) => {
  if (process.platform === 'win32') {
    execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, {
      stdio: 'ignore',
    });
    return;
  }

  execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'ignore' });
};

export async function modelRoutes(fastify: FastifyInstance) {
  const listModelsHandler = async (request: any, reply: any) => {
    const userId = request.user!.userId;
    const models = scanInstalledModels();

    const dbModels = await prisma.live2DModel.findMany({
      where: { OR: [{ userId }, { isSystem: true }] },
      orderBy: { code: 'asc' },
    });

    return reply.send({
      models: models.map(model => {
        const dbModel = dbModels.find(item => item.code === model.code);
        return {
          ...model,
          name: dbModel?.name ?? model.name,
          path: dbModel?.path ?? model.path,
          isActive: dbModel?.isActive ?? true,
        };
      }),
    });
  };

  const uploadModelHandler = async (request: any, reply: any) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'BAD_REQUEST', message: '请上传 zip 文件' });
    }

    if (!data.filename.endsWith('.zip')) {
      return reply.status(400).send({ error: 'BAD_REQUEST', message: '只接受 .zip 格式' });
    }

    if (data.file.truncated) {
      return reply.status(413).send({ error: 'PAYLOAD_TOO_LARGE', message: '文件超过 50MB' });
    }

    let extractDir = '';
    try {
      const nextId = getNextModelId();
      const timestamp = Date.now();
      const modelCode = `${nextId}_user_upload_${timestamp}`;
      extractDir = join(MODELS_DIR, modelCode);

      mkdirSync(extractDir, { recursive: true });

      const tempZip = join(extractDir, 'temp.zip');
      await pipeline(data.file, createWriteStream(tempZip));

      try {
        unzipModel(tempZip, extractDir);
      } catch {
        rmSync(extractDir, { recursive: true, force: true });
        return reply.status(400).send({ error: 'UNZIP_FAILED', message: '解压失败，请检查 zip 文件格式' });
      }

      try {
        unlinkSync(tempZip);
      } catch {
        // 临时文件清理失败不影响后续模型校验。
      }

      const modelFile = findModel3Json(extractDir);
      if (!modelFile) {
        rmSync(extractDir, { recursive: true, force: true });
        return reply.status(400).send({ error: 'INVALID_MODEL', message: 'zip 中未找到 .model3.json 文件' });
      }

      const hash = createHash('md5').update(readFileSync(modelFile)).digest('hex').slice(0, 8);
      const finalCode = `${modelCode}_${hash}`;
      const finalDir = join(MODELS_DIR, finalCode);
      
      // 在Windows上，renameSync可能会因权限问题失败，所以先尝试复制然后删除
      try {
        renameSync(extractDir, finalDir);
      } catch (_renameError) {
        // 如果rename失败，则使用复制方式
        copyDirRecursive(extractDir, finalDir);
        rmSync(extractDir, { recursive: true, force: true });
      }

      const finalModelFile = modelFile.replace(extractDir, finalDir);
      const path = toPublicLive2DPath(finalModelFile, finalCode);
      const userId = request.user!.userId;
      const name = data.filename.replace(/\.zip$/i, '');

      await prisma.live2DModel.create({
        data: {
          userId,
          code: finalCode,
          name,
          path,
          isSystem: false,
          isActive: true,
        },
      });

      return reply.send({
        success: true,
        modelCode: finalCode,
        id: nextId,
        path,
        message: '模型上传成功',
      });
    } catch (error) {
      if (extractDir && existsSync(extractDir)) {
        rmSync(extractDir, { recursive: true, force: true });
      }
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'UPLOAD_FAILED',
        message: '模型上传或解压失败',
      });
    }
  };

  const deleteModelHandler = async (request: any, reply: any) => {
    const { code } = request.params as { code: string };
    const userId = request.user!.userId;

    const targetDir = join(MODELS_DIR, code);
    if (!existsSync(targetDir)) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '模型不存在' });
    }

    const dbModel = await prisma.live2DModel.findFirst({ where: { code } });

    if (dbModel?.isSystem) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: '不能删除系统内置模型' });
    }

    if (dbModel && dbModel.userId !== userId) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: '无权删除此模型' });
    }

    try {
      rmSync(targetDir, { recursive: true, force: true });

      if (dbModel) {
        await prisma.live2DModel.deleteMany({ where: { code, userId } });
      }

      await prisma.persona.updateMany({
        where: { modelPath: { contains: code } },
        data: { modelPath: '' },
      });

      return reply.send({ success: true, message: '模型已删除' });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'DELETE_FAILED', message: '删除失败' });
    }
  };

  // 兼容旧接口，避免前端或脚本仍调用 /api/models/*
  fastify.get('/api/models/installed', { preHandler: requireAuth }, listModelsHandler);
  fastify.post('/api/models/upload', { preHandler: requireAuth }, uploadModelHandler);
  fastify.delete('/api/models/:code', { preHandler: requireAuth }, deleteModelHandler);
}