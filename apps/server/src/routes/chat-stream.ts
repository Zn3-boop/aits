/**
 * 流式 Chat + TTS 路由
 * 
 * 核心思路：LLM 流式输出 → 句子级缓冲 → 立即 TTS → SSE 推送 audio_chunk + emotion 事件
 */
import { FastifyInstance } from 'fastify';
import axios from 'axios';
import { logger } from '../utils/logger.js';

// ========== 配置 ==========
const TTS_URL = process.env.TTS_URL || 'http://localhost:8787';
const LLM_URL = process.env.LLM_URL || 'http://localhost:11434/v1/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'qwen2.5:3b';

// ========== 类型定义 ==========
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface StreamEvent {
  type: 'token' | 'text' | 'emotion' | 'audio_chunk' | 'done' | 'error';
  content?: string;
  emotion?: string;
  audio?: string;
  text?: string;
  message?: string;
}

// ========== 辅助函数 ==========

// 句子分割（支持中英文标点）
function splitSentences(text: string): string[] {
  const regex = /[^，。！？.!?\n]+[，。！？.!?\n]+/g;
  const matches = text.match(regex);
  return matches ? matches : [text];
}

// 从文本提取情绪标记，如 [emotion:happy]
function extractEmotion(text: string): { emotion: string | null; cleanText: string } {
  const match = text.match(/^\[emotion:(\w+)\]\s*/);
  if (match) {
    return { emotion: match[1], cleanText: text.replace(match[0], '') };
  }
  return { emotion: null, cleanText: text };
}

// TTS 合成（返回 base64 编码的音频）
async function synthesizeAudio(text: string): Promise<string> {
  try {
    const res = await axios.post(`${TTS_URL}/tts`, { 
      text, 
      format: 'mp3' 
    }, {
      responseType: 'arraybuffer',
      timeout: 15000,
    });
    return Buffer.from(res.data).toString('base64');
  } catch (error) {
    logger.error('[TTS] 合成失败:', error);
    throw error;
  }
}

// 发送 SSE 事件
function sendSSE(reply: any, event: StreamEvent) {
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

// ========== 路由实现 ==========

export default async function chatStreamRoutes(app: FastifyInstance) {
  
  // 注意: /api/chat/stream 路由已在 chats.ts 中定义，此文件提供兼容路由
  app.post('/api/chat/stream-legacy', async (req, reply) => {
    const { messages, personaId }: { 
      messages: ChatMessage[]; 
      personaId?: string 
    } = req.body as any;
    
    // 设置 SSE 头
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    try {
      // 构建系统提示词，包含情绪指令
      const systemPrompt = `你是用户的 AI 伙伴。回复时请在最开头用 [emotion:情绪] 标记你的情绪，可选：neutral, happy, sad, angry, surprised, fearful, disgusted, thinking。
例如：[emotion:happy] 太好了！
例如：[emotion:surprised] 真的吗？
情绪说明：
- happy: 开心、愉悦
- sad: 悲伤、难过
- angry: 生气、不满
- surprised: 惊讶、意外
- fearful: 害怕、担忧
- disgusted: 厌恶、反感
- thinking: 思考中
- neutral: 中性、平静`;

      // 调用 LLM 流式接口
      const llmRes = await axios.post(LLM_URL, {
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        stream: true,
        temperature: 0.8,
        max_tokens: 2000,
      }, {
        responseType: 'stream',
        timeout: 120000,
      });

      let sentenceBuffer = '';
      let currentEmotion = 'neutral';

      // 处理流式响应
      llmRes.data.on('data', async (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(l => l.trim());
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const json = JSON.parse(data);
            const token = json.choices?.[0]?.delta?.content || '';
            if (!token) continue;

            sentenceBuffer += token;

            // 检查是否有完整句子（中英文标点）
            const punctuations = ['，', '。', '！', '？', '.', '!', '?', '\n'];
            const lastChar = token[token.length - 1];
            
            if (punctuations.includes(lastChar)) {
              // 提取情绪标记
              const { emotion, cleanText } = extractEmotion(sentenceBuffer);
              
              if (emotion) {
                currentEmotion = emotion;
                sendSSE(reply, { type: 'emotion', emotion });
              }

              if (cleanText.trim()) {
                // 发送文本
                sendSSE(reply, { type: 'text', content: cleanText });
                
                // 并行：TTS 异步合成，不阻塞文本流
                synthesizeAudio(cleanText)
                  .then(base64Audio => {
                    sendSSE(reply, {
                      type: 'audio_chunk',
                      audio: base64Audio,
                      text: cleanText,
                      emotion: currentEmotion,
                    });
                  })
                  .catch((err: Error) => {
                    logger.error('[TTS] 合成失败:', err.message);
                  });
              }

              sentenceBuffer = '';
            } else {
              // 实时打字效果：发送未完成的 token
              sendSSE(reply, { type: 'token', content: token });
            }
          } catch {
            // 忽略解析错误
          }
        }
      });

      llmRes.data.on('end', async () => {
        // 处理最后残留的 buffer
        if (sentenceBuffer.trim()) {
          const { emotion, cleanText } = extractEmotion(sentenceBuffer);
          
          if (emotion) {
            sendSSE(reply, { type: 'emotion', emotion });
          }
          
          sendSSE(reply, { type: 'text', content: cleanText });
          
          try {
            const base64Audio = await synthesizeAudio(cleanText);
            sendSSE(reply, {
              type: 'audio_chunk',
              audio: base64Audio,
              text: cleanText,
              emotion: emotion || currentEmotion,
            });
          } catch {
            // TTS 失败也继续
          }
        }
        
        sendSSE(reply, { type: 'done' });
        reply.raw.end();
      });

      llmRes.data.on('error', (err: Error) => {
        logger.error('[LLM] 流式响应错误:', err);
        sendSSE(reply, { type: 'error', message: err.message });
        reply.raw.end();
      });

    } catch (err) {
      logger.error('[ChatStream] 请求失败:', err);
      sendSSE(reply, { type: 'error', message: (err as Error).message });
      reply.raw.end();
    }
  });

  // 简单的 TTS 代理端点（如果需要）
  app.post('/api/tts/proxy', async (req, reply) => {
    const { text, voiceId }: { text: string; voiceId?: string } = req.body as any;
    
    try {
      const res = await axios.post(`${TTS_URL}/tts`, {
        text,
        voiceId,
        format: 'mp3',
      }, {
        responseType: 'arraybuffer',
        timeout: 15000,
      });

      return reply
        .header('Content-Type', 'audio/mpeg')
        .header('Content-Disposition', 'inline')
        .send(Buffer.from(res.data));
    } catch (err) {
      logger.error('[TTS Proxy] 失败:', err);
      return reply.status(500).send({ error: 'TTS 合成失败' });
    }
  });

  // 健康检查
  app.get('/api/chat/stream/health', async (_request, reply) => {
    const llmStatus = await checkLLMHealth();
    const ttsStatus = await checkTTSHealth();
    
    return reply.send({
      status: llmStatus && ttsStatus ? 'ok' : 'degraded',
      llm: llmStatus ? 'ok' : 'unavailable',
      tts: ttsStatus ? 'ok' : 'unavailable',
      llmUrl: LLM_URL,
      ttsUrl: TTS_URL,
    });
  });
}

// 健康检查函数
async function checkLLMHealth(): Promise<boolean> {
  try {
    await axios.post(LLM_URL, {
      model: LLM_MODEL,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    }, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function checkTTSHealth(): Promise<boolean> {
  try {
    await axios.post(`${TTS_URL}/health`, {}, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}