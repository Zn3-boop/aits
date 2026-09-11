import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import axios from 'axios';
import FormData from 'form-data';
import { requireAuth } from '../auth.js';

type STTProvider = 'whisper-local' | null;

export async function sttRoutes(fastify: FastifyInstance) {
  let sttAvailable = false;
  let loadError: string | null = null;
  let provider: STTProvider = null;
  let whisperModelReady = false;
  let providerDetecting = true;

  const whisperUrl = process.env.WHISPER_URL || 'http://localhost:10095';

  // ========== 新增：Whisper 模型预热检测 ==========
  async function checkWhisperModelReady(): Promise<boolean> {
    try {
      const _res = await axios.post(
        `${whisperUrl}/api/asr`,
        Buffer.from([]),
        {
          headers: { 'Content-Type': 'audio/webm' },
          timeout: 10000,
        }
      );
      return true;
    } catch (err: any) {
      if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
        return false;
      }
      if (err.response?.status >= 400 && err.response?.status < 500) {
        return true;
      }
      return false;
    }
  }

  // ========== 新增：启动时预热 Whisper ==========
  async function warmupWhisper() {
    fastify.log.info('[STT] 正在预热 Whisper 模型...');
    // 等待最多 30 秒让模型加载
    const maxWait = 30;
    for (let i = 0; i < maxWait; i++) {
      const ready = await checkWhisperModelReady();
      if (ready) {
        whisperModelReady = true;
        fastify.log.info('[STT] ✓ Whisper 模型预热完成');
        return;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    fastify.log.warn('[STT] ⚠ Whisper 模型预热超时，继续运行');
  }

  async function detectProvider(): Promise<void> {
    try {
      const res = await axios.get(`${whisperUrl}/api/health`, { timeout: 3000 });
      if (res.status === 200) {
        provider = 'whisper-local';
        sttAvailable = true;
        fastify.log.info(`[STT] ✓ Whisper ready at ${whisperUrl}`);
        return;
      }
    } catch (err: any) {
      fastify.log.warn(`[STT] Whisper /api/health failed: ${err.message}`);
      try {
        const docsRes = await axios.get(`${whisperUrl}/docs`, { timeout: 2000 });
        if (docsRes.status === 200) {
          provider = 'whisper-local';
          sttAvailable = true;
          fastify.log.info(`[STT] ✓ Whisper alive at ${whisperUrl} (docs ok)`);
          return;
        }
      } catch {
        fastify.log.warn(`[STT] Whisper ${whisperUrl} not responding`);
      }
    }

    loadError =
      'STT 未配置。请启动 Faster-Whisper: python tools/faster-whisper-server.py (默认 ' + whisperUrl + ')';
    fastify.log.warn('[STT] ⚠ ' + loadError);
  }

  detectProvider().then(() => {
    providerDetecting = false;
    if (provider === 'whisper-local') {
      warmupWhisper().catch(() => {});
    }
  }).catch(() => {
    providerDetecting = false;
  });

  // ========== Whisper 识别（匹配你的 Python 服务端点）==========
  async function transcribeWithWhisper(
    audioBuffer: Buffer,
    filename: string,
    mimetype: string
  ): Promise<{ text: string; duration: number }> {
    const form = new FormData();
    form.append('file', audioBuffer, { filename, contentType: mimetype });

    fastify.log.info({
      msg: '[STT] Calling Whisper',
      url: whisperUrl,
      size: audioBuffer.length,
    });

    // 你的 faster-whisper-server.py 端点
    const response = await axios.post(`${whisperUrl}/api/asr`, form, {
      headers: form.getHeaders(),
      timeout: 120000, // 模型加载慢，给 2 分钟
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const result = response.data;
    // 兼容你的返回格式
    let text = '';
    if (typeof result === 'string') {
      text = result;
    } else if (result.text) {
      text = result.text;
    } else if (result.result) {
      text = result.result;
    }

    return { text, duration: 0 };
  }



  // ========== 识别接口 ==========
  fastify.post('/api/stt/transcribe', { preHandler: requireAuth }, async (request, reply) => {
    if (!sttAvailable) {
      return reply.status(503).send({
        error: 'STT_NOT_AVAILABLE',
        message: loadError || 'STT 未配置',
      });
    }

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'AUDIO_REQUIRED', message: '请上传音频文件' });
    }

    const tempDir = join(tmpdir(), 'aits-stt');
    await mkdir(tempDir, { recursive: true });
    const ext = data.filename?.split('.').pop() || 'webm';
    const tempFile = join(tempDir, `${randomUUID()}.${ext}`);

    try {
      const buffer = await data.toBuffer();
      await writeFile(tempFile, buffer);

      fastify.log.info({ msg: '[STT] Transcribing', provider, size: buffer.length });

      let result: { text: string; duration: number };
      result = await transcribeWithWhisper(buffer, data.filename || 'audio.webm', data.mimetype || 'audio/webm');

      return reply.send({
        text: result.text,
        language: 'zh',
        segments: [{ text: result.text, start: 0, end: result.duration }],
        duration: result.duration,
        provider,
      });
    } catch (error: any) {
      fastify.log.error({ msg: '[STT] Failed', provider, error: error.message });
      const userMessage = error.code === 'ECONNREFUSED'
        ? `${provider} 服务未启动，请检查服务是否运行`
        : error.code === 'ETIMEDOUT' || error.message?.includes('timeout')
        ? `${provider} 识别超时，请稍后重试`
        : error.response?.data?.message || error.message || '语音识别失败';
      return reply.status(500).send({
        error: 'STT_ERROR',
        message: userMessage,
        provider,
      });
    } finally {
      await unlink(tempFile).catch(() => {});
    }
  });

  fastify.get('/api/stt/health', async (_request, reply) => {
    if (providerDetecting) {
      return reply.send({
        status: 'detecting',
        provider: null,
        message: '正在检测 STT 服务...',
        modelLoaded: false,
      });
    }

    if (!sttAvailable) {
      return reply.status(503).send({
        status: 'error',
        provider: null,
        message: loadError,
        fix: '启动 Faster-Whisper: python tools/faster-whisper-server.py',
      });
    }

    try {
      await axios.get(`${whisperUrl}/api/health`, { timeout: 3000 });
      return reply.send({
        status: 'ok',
        provider: 'whisper-local',
        message: 'Whisper 正常',
        modelLoaded: whisperModelReady,
      });
    } catch {
      return reply.status(503).send({
        status: 'degraded',
        provider: 'whisper-local',
        message: `Whisper ${whisperUrl} 未响应`,
        fix: '重新启动 faster-whisper-server.py',
        modelLoaded: false,
      });
    }
  });
}