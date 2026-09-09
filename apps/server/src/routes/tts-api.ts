/**
 * TTS HTTP 端点 - 提供 /tts 和 /api/tts 接口
 */
import { FastifyInstance } from 'fastify';
import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { writeFile, readFile, unlink } from 'fs/promises';

// Edge TTS 配置
const EDGE_TTS_VOICE = process.env.EDGE_TTS_VOICE || 'zh-CN-XiaoxiaoNeural';

// 可用的音色列表
const VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', language: 'zh-CN' },
  { id: 'zh-CN-YunxiNeural', name: '云希', language: 'zh-CN' },
  { id: 'zh-CN-YunyangNeural', name: '云扬', language: 'zh-CN' },
  { id: 'zh-CN-XiaoyiNeural', name: '小艺', language: 'zh-CN' },
  { id: 'zh-CN-XiaoxuanNeural', name: '小璇', language: 'zh-CN' },
  { id: 'en-US-JennyNeural', name: 'Jenny', language: 'en-US' },
  { id: 'en-US-GuyNeural', name: 'Guy', language: 'en-US' },
  { id: 'en-US-AriaNeural', name: 'Aria', language: 'en-US' },
  { id: 'ja-JP-NanamiNeural', name: '七海', language: 'ja-JP' },
  { id: 'ko-KR-SunHiNeural', name: 'SunHi', language: 'ko-KR' },
];

// 通用 TTS 合成函数
async function synthesizeWithEdgeTTS(
  text: string,
  voice: string,
  outputFile: string
): Promise<void> {
  const pythonScript = `
import asyncio
import edge_tts

async def synthesize():
    text = """${text.replace(/"""/g, '\\"')}"""
    communicate = edge_tts.Communicate(text, "${voice}")
    await communicate.save("${outputFile.replace(/\\/g, '\\\\')}")

asyncio.run(synthesize())
`;

  return new Promise<void>((resolve, reject) => {
    const python = spawn('python', ['-c', pythonScript], {
      windowsHide: true,
    });

    let stderr = '';
    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Python 脚本失败: ${stderr}`));
      }
    });

    python.on('error', reject);
  });
}

export default async function ttsApiRoutes(app: FastifyInstance) {

  // ─────────────────────────────────────────────
  // POST /api/tts/stream - 合成语音并返回音频流
  // ─────────────────────────────────────────────
  app.post('/api/tts/stream', async (req, reply) => {
    const { text, voiceId } = req.body as {
      text?: string;
      voiceId?: string;
    };

    if (!text) {
      return reply.status(400).send({ error: '缺少 text 参数' });
    }

    const voice = voiceId || EDGE_TTS_VOICE;
    const outputFile = join(tmpdir(), `tts_stream_${randomUUID()}.mp3`);

    try {
      await synthesizeWithEdgeTTS(text, voice, outputFile);

      const audioBuffer = await readFile(outputFile);
      await unlink(outputFile).catch(() => {});

      // Edge TTS 不提供词边界信息，返回空数组
      const wordBoundaries: unknown[] = [];

      return reply
        .header('Content-Type', 'audio/mpeg')
        .header('Content-Disposition', 'inline')
        .header('X-Word-Boundaries', JSON.stringify(wordBoundaries))
        .send(audioBuffer);
    } catch (err) {
      app.log.error('[TTS/stream] 合成失败:', err);
      const errorMessage = err instanceof Error ? err.message : '未知错误';
      return reply.status(500).send({
        error: 'TTS 合成失败',
        message: errorMessage,
        hint: '请确保已安装 edge-tts: pip install edge-tts',
      });
    }
  });

  // ─────────────────────────────────────────────
  // POST /api/tts/synthesize - 合成语音
  // ─────────────────────────────────────────────
  app.post('/api/tts/synthesize', async (req, reply) => {
    const { text, voiceId } = req.body as {
      text?: string;
      voiceId?: string;
    };

    if (!text) {
      return reply.status(400).send({ error: '缺少 text 参数' });
    }

    const voice = voiceId || EDGE_TTS_VOICE;
    const outputFile = join(tmpdir(), `tts_${randomUUID()}.mp3`);

    try {
      await synthesizeWithEdgeTTS(text, voice, outputFile);

      const audioBuffer = await readFile(outputFile);
      await unlink(outputFile).catch(() => {});

      return reply
        .header('Content-Type', 'audio/mpeg')
        .header('Content-Disposition', 'inline')
        .send(audioBuffer);
    } catch (err) {
      app.log.error('[TTS/synthesize] 合成失败:', err);
      const errorMessage = err instanceof Error ? err.message : '未知错误';
      return reply.status(500).send({
        error: 'TTS 合成失败',
        message: errorMessage,
        hint: '请确保已安装 edge-tts: pip install edge-tts',
      });
    }
  });

  // ─────────────────────────────────────────────
  // POST /tts - 合成语音（兼容旧端点）
  // ─────────────────────────────────────────────
  app.post('/tts', async (req, reply) => {
    const { text, voiceId, format = 'mp3' } = req.body as {
      text?: string;
      voiceId?: string;
      format?: string;
    };

    if (!text) {
      return reply.status(400).send({ error: '缺少 text 参数' });
    }

    const voice = voiceId || EDGE_TTS_VOICE;
    const outputFile = join(tmpdir(), `tts_${randomUUID()}.mp3`);

    try {
      await synthesizeWithEdgeTTS(text, voice, outputFile);

      const audioBuffer = await readFile(outputFile);
      await unlink(outputFile).catch(() => {});

      return reply
        .header('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'audio/mp3')
        .header('Content-Disposition', 'inline')
        .send(audioBuffer);
    } catch (error) {
      app.log.error('[TTS/legacy] 合成失败:', error);
      await unlink(outputFile).catch(() => {});
      return reply.status(500).send({
        error: 'TTS 合成失败',
        message: error instanceof Error ? error.message : '未知错误',
      });
    }
  });

  // ─────────────────────────────────────────────
  // GET /tts/voices - 获取可用音色列表
  // ─────────────────────────────────────────────
  app.get('/tts/voices', async (_request, reply) => {
    return reply.send({ voices: VOICES });
  });

  // ─────────────────────────────────────────────
  // GET /tts/health - 健康检查
  // ─────────────────────────────────────────────
  app.get('/tts/health', async (_request, reply) => {
    return reply.send({ status: 'ok' });
  });
}