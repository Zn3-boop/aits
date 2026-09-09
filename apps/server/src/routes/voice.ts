import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { promises as fs, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { requireAuth } from '../auth.js';
import { logger } from '../utils/logger.js';

const VOICE_SAMPLES_DIR = resolve(process.cwd(), '../web/public/voice-samples');

interface CloneRequest {
  sampleCount: number;
  sampleFiles: {
    filename: string;
    contentBase64: string;
    mimeType: string;
    size: number;
    durationSec: number;
  }[];
}

export async function voiceRoutes(fastify: FastifyInstance) {
  if (!existsSync(VOICE_SAMPLES_DIR)) {
    mkdirSync(VOICE_SAMPLES_DIR, { recursive: true });
  }

  // POST /api/voice/clone - 接收语音样本
  fastify.post('/api/voice/clone', {
    preHandler: requireAuth,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const body = request.body as CloneRequest;

    try {
      if (!body.sampleFiles?.length) {
        return reply.status(400).send({ error: 'NO_SAMPLES', message: '请提供音频样本' });
      }

      // 创建用户样本目录
      const userDir = join(VOICE_SAMPLES_DIR, `user_${userId}`);
      if (!existsSync(userDir)) mkdirSync(userDir, { recursive: true });

      // 保存样本文件
      const savedFiles: string[] = [];
      for (const sample of body.sampleFiles) {
        const buffer = Buffer.from(sample.contentBase64, 'base64');
        const filePath = join(userDir, sample.filename);
        await fs.writeFile(filePath, buffer);
        savedFiles.push(filePath);
      }

      return reply.send({
        success: true,
        message: '样本已保存，语音克隆任务已创建（待对接克隆引擎）',
        jobId: `voice_clone_${Date.now()}`,
        samplesReceived: savedFiles.length,
      });

    } catch (error) {
      logger.error('Voice clone error:', String(error));
      return reply.status(500).send({
        error: 'CLONE_FAILED',
        message: error instanceof Error ? error.message : '语音克隆失败'
      });
    }
  });

  // GET /api/voice/jobs/:jobId - 查询克隆任务状态
  fastify.get('/api/voice/jobs/:jobId', {
    preHandler: requireAuth,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = request.params as { jobId: string };
    return reply.send({
      jobId,
      status: 'pending',
      progress: 0,
      modelUrl: null,
    });
  });
}

export default voiceRoutes;