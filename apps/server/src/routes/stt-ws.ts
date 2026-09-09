/**
 * WebSocket STT 端点 - 真正的实时流式语音识别
 * 
 * 核心思路：前端通过 WebSocket 实时推送音频 chunk，
 * 后端做智能缓冲 + VAD 边界检测，
 * 检测到语音段结束时立即送 Whisper，返回结果
 * 
 * 协议流程：
 *   1. 前端连接 WS
 *   2. 前端发送 {type: 'start'}
 *   3. 后端回复 {type: 'ready'} ← 前端收到后才启动录音
 *   4. 前端推送音频数据
 *   5. 后端识别完成后发送 {type: 'final'|'interim', text: '...'}
 *   6. 前端发送 {type: 'stop'} 或静音超时触发最终识别
 */
import { FastifyInstance } from 'fastify';
import FormData from 'form-data';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';

// ========== 配置 ==========
const WHISPER_URL = process.env.WHISPER_URL || 'http://localhost:10095';
const MAX_BUFFER_MS = 8000;
const SILENCE_TIMEOUT_MS = 1200;
const MIN_AUDIO_MS = 500;
const SESSION_MAX_TTL_MS = 30 * 60 * 1000;
const SESSION_CLEANUP_INTERVAL_MS = 60 * 1000;

// ========== 类型定义 ==========
interface AudioChunk {
  buffer: Buffer;
  timestamp: number;
}

interface STTSession {
  chunks: AudioChunk[];
  lastVoiceTime: number;
  isRecording: boolean;
  checkInterval?: NodeJS.Timeout;
  ws: WebSocket;
  createdAt: number;
}

// ========== 会话管理 ==========
const sessions = new Map<string, STTSession>();

const cleanupExpiredSessions = () => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_MAX_TTL_MS) {
      logger.info(`[STT-WS:${id}] 会话超时(${SESSION_MAX_TTL_MS / 1000}s)，强制回收`);
      if (session.checkInterval) clearInterval(session.checkInterval);
      try {
        session.ws.close();
      } catch (_e) {}
      sessions.delete(id);
    }
  }
};

const sessionCleanupTimer = setInterval(cleanupExpiredSessions, SESSION_CLEANUP_INTERVAL_MS);
sessionCleanupTimer.unref();

function hasVoiceActivity(buffer: Buffer, threshold = 200): boolean {
  return buffer.length > threshold;
}

async function transcribe(audioBuffer: Buffer, sessionId: string): Promise<string> {
  const form = new FormData();
  form.append('file', audioBuffer, {
    filename: 'audio.webm',
    contentType: 'audio/webm',
  });

  try {
    const res = await axios.post(`${WHISPER_URL}/api/asr`, form, {
      headers: form.getHeaders(),
      timeout: 15000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    const result = res.data;
    if (typeof result === 'string') {
      return result;
    }
    return result.text || result.result || '';
  } catch (error) {
    logger.error(`[STT-WS:${sessionId}] Whisper error:`, error);
    throw error;
  }
}

/**
 * 刷新会话并发送识别请求
 * @param sessionId 会话 ID
 * @param isFinal 是否是最终识别（用户手动停止或静音超时）
 */
function flushSession(sessionId: string, isFinal = false) {
  const session = sessions.get(sessionId);
  if (!session || session.chunks.length === 0) {
    logger.info(`[STT-WS:${sessionId}] flushSession: 无音频数据，跳过`);
    return;
  }

  const chunkCount = session.chunks.length;
  const audioBlob = Buffer.concat(session.chunks.map(c => c.buffer));
  session.chunks = [];
  
  const sizeKB = (audioBlob.length / 1024).toFixed(1);
  logger.info(`[STT-WS:${sessionId}] flushSession(${isFinal ? 'final' : 'interim'}), 音频大小: ${audioBlob.length} bytes (${sizeKB}KB), chunks: ${chunkCount}`);

  // 用户手动停止或静音超时（isFinal）时，不管音频多短都要尝试识别
  // 中间识别（interim）时，如果音频太短（< 5KB 等效），可能只是噪声，跳过
  if (!isFinal && audioBlob.length < MIN_AUDIO_MS * 48) {
    logger.info(`[STT-WS:${sessionId}] 中间识别：音频太短 (${audioBlob.length} bytes)，跳过`);
    return;
  }

  logger.info(`[STT-WS:${sessionId}] 开始识别，音频大小: ${audioBlob.length} bytes`);

  transcribe(audioBlob, sessionId)
    .then(text => {
      const s = sessions.get(sessionId);
      if (!s) return; // 会话可能已关闭
      if (text.trim()) {
        logger.info(`[STT-WS:${sessionId}] 识别结果: ${text.trim()}`);
        s.ws.send(JSON.stringify({
          type: isFinal ? 'final' : 'interim',
          text: text.trim(),
          sessionId,
        }));
      } else {
        logger.warn(`[STT-WS:${sessionId}] 识别结果为空`);
        // 即使结果为空，如果是最终识别也发送一个 final 消息让前端知道识别完成
        if (isFinal) {
          s.ws.send(JSON.stringify({
            type: 'final',
            text: '',
            sessionId,
            empty: true,
          }));
        }
      }
    })
    .catch((err: Error) => {
      const s = sessions.get(sessionId);
      if (!s) return;
      logger.error(`[STT-WS:${sessionId}] Transcribe error:`, err.message);
      s.ws.send(JSON.stringify({
        type: 'error',
        message: '识别失败: ' + err.message,
      }));
    });
}

export default async function sttWsRoutes(app: FastifyInstance) {
  app.get('/api/stt/ws', { websocket: true }, (socket, _request) => {
    const sessionId = randomUUID();
    logger.info(`[STT-WS:${sessionId}] 连接建立`);

    const session: STTSession = {
      chunks: [],
      lastVoiceTime: Date.now(),
      isRecording: false,
      ws: socket,
      createdAt: Date.now(),
    };
    sessions.set(sessionId, session);

    session.checkInterval = setInterval(() => {
      const now = Date.now();
      const totalBuffered = session.chunks.reduce((sum, c) => sum + c.buffer.length, 0);

      if (now - session.lastVoiceTime > SILENCE_TIMEOUT_MS && session.chunks.length > 0) {
        logger.info(`[STT-WS:${sessionId}] 静音超时，触发识别`);
        flushSession(sessionId, true);
      }

      if (totalBuffered > MAX_BUFFER_MS * 96) {
        logger.info(`[STT-WS:${sessionId}] 缓冲区过大(${totalBuffered} bytes)，强制识别`);
        flushSession(sessionId, false);
      }
    }, 300);

    socket.on('message', (message: Buffer | ArrayBuffer | string, isBinary?: boolean) => {
      if (!isBinary) {
        let text: string;
        if (typeof message === 'string') {
          text = message;
        } else if (Buffer.isBuffer(message)) {
          text = message.toString('utf-8');
        } else {
          text = Buffer.from(message as ArrayBuffer).toString('utf-8');
        }

        try {
          const cmd = JSON.parse(text);

          if (cmd.type === 'start') {
            logger.info(`[STT-WS:${sessionId}] 收到 start 指令，重置会话`);
            session.isRecording = true;
            session.chunks = [];
            session.lastVoiceTime = Date.now();
            socket.send(JSON.stringify({
              type: 'ready',
              sessionId,
              whisperUrl: WHISPER_URL,
            }));
            return;
          }

          if (cmd.type === 'stop') {
            logger.info(`[STT-WS:${sessionId}] 收到 stop 指令`);
            flushSession(sessionId, true);
            session.isRecording = false;
            return;
          }
        } catch {
          // 不是 JSON，忽略
        }
      }

      if (!session.isRecording) return;

      const buf = Buffer.isBuffer(message)
        ? message
        : Buffer.from(message as ArrayBuffer);

      session.chunks.push({ buffer: buf, timestamp: Date.now() });
      if (hasVoiceActivity(buf)) {
        session.lastVoiceTime = Date.now();
      }
    });

    socket.on('close', () => {
      logger.info(`[STT-WS:${sessionId}] 连接关闭`);
      if (session.checkInterval) clearInterval(session.checkInterval);
      flushSession(sessionId, true);
      sessions.delete(sessionId);
    });

    socket.on('error', (error: Error) => {
      logger.error(`[STT-WS:${sessionId}] WebSocket 错误:`, error);
      if (session.checkInterval) clearInterval(session.checkInterval);
      sessions.delete(sessionId);
    });

    // ❌ 删除：不要在连接建立时自动发送 ready，等收到 start 后再发送
    // 否则前端会收到两次 ready，导致 MediaRecorder.start() 被调用两次而报错
  });

  app.get('/api/stt/ws/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      type: 'websocket-stt',
      whisperUrl: WHISPER_URL,
      activeSessions: sessions.size,
    });
  });
}