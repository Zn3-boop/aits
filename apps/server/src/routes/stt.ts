import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import axios from 'axios';
import FormData from 'form-data';
import { requireAuth } from '../auth.js';

type STTProvider = 'funasr-local' | 'whisper-local' | 'paraformer-cloud' | null;

export async function sttRoutes(fastify: FastifyInstance) {
  let sttAvailable = false;
  let loadError: string | null = null;
  let provider: STTProvider = null;
  let whisperModelReady = false;
  let providerDetecting = true;

  const funasrServerUrl = process.env.FUNASR_SERVER_URL;
  const whisperUrl = process.env.WHISPER_URL || 'http://localhost:10095';
  const apiUrl = process.env.PARAFORMER_API_URL;
  const appKey = process.env.PARAFORMER_APP_KEY;
  const accessKeyId = process.env.PARAFORMER_ACCESS_KEY_ID;
  const accessKeySecret = process.env.PARAFORMER_ACCESS_KEY_SECRET;

  // ========== 新增：Whisper 模型预热检测 ==========
  async function checkWhisperModelReady(): Promise<boolean> {
    try {
      const res = await axios.post(
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

  // ========== 修复：检测逻辑，优先匹配 Faster-Whisper 的实际端点 ==========
  async function detectProvider(): Promise<void> {
    // 1. 检测 Faster-Whisper（你的 Python 服务）
    try {
      // Faster-Whisper 用 FastAPI，健康检查是 /api/health
      const res = await axios.get(`${whisperUrl}/api/health`, {
        timeout: 3000,
      });
      if (res.status === 200) {
        provider = 'whisper-local';
        sttAvailable = true;
        fastify.log.info(`[STT] ✓ Whisper ready at ${whisperUrl}`);
        return;
      }
    } catch (err: any) {
      fastify.log.warn(`[STT] Whisper /api/health failed: ${err.message}`);
      // 再试 /docs（Swagger UI），确认服务是否活着
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

    // 2. 检测 FunASR
    if (funasrServerUrl) {
      try {
        await axios.get(`${funasrServerUrl}/api/health`, { timeout: 3000 });
        provider = 'funasr-local';
        sttAvailable = true;
        fastify.log.info(`[STT] ✓ FunASR ready at ${funasrServerUrl}`);
        return;
      } catch {
        fastify.log.warn(`[STT] FunASR at ${funasrServerUrl} not responding`);
      }
    }

    // 3. 阿里云
    if (apiUrl && appKey && accessKeyId && accessKeySecret) {
      provider = 'paraformer-cloud';
      sttAvailable = true;
      fastify.log.info('[STT] ✓ Paraformer cloud configured');
      return;
    }

    loadError =
      'STT 未配置。请启动以下服务之一：\n' +
      `1. Faster-Whisper: python tools/faster-whisper-server.py (默认 ${whisperUrl})\n` +
      `2. FunASR: 设置 FUNASR_SERVER_URL\n` +
      `3. 阿里云: 设置 PARAFORMER_API_URL 等`;
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

  // FunASR（保留）
  async function transcribeWithFunASR(
    audioBuffer: Buffer,
    filename: string,
    mimetype: string
  ): Promise<{ text: string; duration: number }> {
    const form = new FormData();
    form.append('file', audioBuffer, { filename, contentType: mimetype });
    const response = await axios.post(`${funasrServerUrl}/api/asr`, form, {
      headers: form.getHeaders(),
      timeout: 60000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    const result = response.data;
    let text = '';
    let duration = 0;
    if (Array.isArray(result)) {
      text = result.filter((i: any) => i.text).map((i: any) => i.text).join('');
      duration = result.reduce((m: number, i: any) => Math.max(m, i.duration || 0), 0);
    } else if (typeof result === 'object') {
      text = result.text || result.result?.text || '';
      duration = result.duration || result.result?.duration || 0;
    }
    return { text, duration };
  }

  // Paraformer（保留）
  async function transcribeWithParaformerCloud(
    audioBuffer: Buffer,
    filename: string,
    mimetype: string
  ): Promise<{ text: string; duration: number }> {
    const form = new FormData();
    form.append('audio', audioBuffer, { filename, contentType: mimetype });
    form.append('appkey', appKey!);
    form.append('format', 'webm');
    form.append('sample_rate', '16000');

    const token = Buffer.from(`${accessKeyId}:${accessKeySecret}`).toString('base64');
    const response = await axios.post(apiUrl!, form, {
      headers: { ...form.getHeaders(), Authorization: `Basic ${token}` },
      timeout: 30000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const result = response.data;
    if (result.code) throw new Error(result.message || 'Paraformer error');
    return { text: result.result?.text || '', duration: result.result?.duration || 0 };
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

      if (provider === 'whisper-local') {
        result = await transcribeWithWhisper(buffer, data.filename || 'audio.webm', data.mimetype || 'audio/webm');
      } else if (provider === 'funasr-local') {
        result = await transcribeWithFunASR(buffer, data.filename || 'audio.webm', data.mimetype || 'audio/webm');
      } else {
        result = await transcribeWithParaformerCloud(buffer, data.filename || 'audio.webm', data.mimetype || 'audio/webm');
      }

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

  // ========== 修复：健康检查 ==========
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

    if (provider === 'whisper-local') {
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
    }

    if (provider === 'funasr-local') {
      try {
        await axios.get(`${funasrServerUrl}/api/health`, { timeout: 3000 });
        return reply.send({ status: 'ok', provider: 'funasr-local', message: 'FunASR 正常' });
      } catch {
        return reply.status(503).send({
          status: 'degraded',
          provider: 'funasr-local',
          message: 'FunASR 未响应',
        });
      }
    }

    return reply.send({ status: 'ok', provider: 'paraformer-cloud', message: '阿里云配置正常' });
  });
}