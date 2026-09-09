/**
 * 实时语音 WebSocket 路由
 * 
 * 修正点:
 * 1. ✅ TTS 不阻塞 LLM 生成 (独立流水线)
 * 2. ✅ 情感标签通过缓冲区处理 chunk 边界
 * 3. ✅ Fastify WebSocket API 正确用法: (connection, req)
 * 4. ✅ 使用项目配置的 LLM Provider
 */
import { FastifyInstance } from 'fastify';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

// TTS URL - 使用主服务器的 /tts 端点
const TTS_URL = process.env.TTS_URL || 'http://localhost:8787';

// 句子分割
function splitSentences(text: string): string[] {
  const regex = /[^，。！？.!?\n]+[，。！？.!?\n]+/g;
  return text.match(regex) || [text];
}

// TTS 合成
async function synthesizeSpeech(text: string): Promise<string> {
  try {
    const res = await fetch(`${TTS_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, format: 'mp3' })
    });
    
    if (!res.ok) throw new Error('TTS 请求失败');
    
    const buffer = await res.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  } catch (err) {
    logger.error('[TTS] 合成失败:', err);
    return '';
  }
}

// LLM 流式生成 (使用项目配置的 Provider)
async function* streamLLM(messages: Array<{role: string, content: string}>, systemPrompt: string) {
  const baseUrl = config.modelBaseUrl;
  const model = config.defaultModel || 'qwen2.5:3b';
  
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      stream: true
    })
  });

  if (!res.ok) throw new Error('LLM 请求失败');

  const reader = res.body?.getReader();
  if (!reader) throw new Error('无法读取响应流');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        
        try {
          const parsed = JSON.parse(data);
          const content = parsed.message?.content || parsed.choices?.[0]?.delta?.content;
          if (content) {
            yield content;
          }
        } catch (_e) {
          // 忽略解析错误
        }
      }
    }
  }
}

// 系统提示词
const VOICE_SYSTEM_PROMPT = `你是用户的 AI 伙伴。回复时用 [emotion:情绪] 标记情绪。
情绪可选: neutral, happy, sad, angry, surprised, fearful, disgusted
例如: [emotion:happy] 太好了！
例如: [emotion:surprised] 真的吗？`;

export default async function voiceWSRoutes(app: FastifyInstance) {
  app.get('/api/voice/ws', { websocket: true }, (socket, _req) => {
    logger.info('[VoiceWS] 新的语音连接');

    // 对话上下文
    const context: Array<{role: string, content: string}> = [];
    
    // 文本缓冲区 (用于处理情感标签边界)
    let emotionBuffer = '';
    
    // TTS 队列
    const ttsQueue: string[] = [];
    let isGenerating = false;
    let isDone = false;

    // TTS 流水线 (独立运行，不阻塞 LLM)
    const processTTSQueue = async () => {
      while (ttsQueue.length > 0 && !isDone) {
        const sentence = ttsQueue.shift()!;
        try {
          const audio = await synthesizeSpeech(sentence);
          if (audio) {
            socket.send(JSON.stringify({ type: 'audio', audio }));
          }
        } catch (err) {
          logger.error('[TTS] 合成失败:', err);
        }
      }
    };

    // 处理 LLM 流式输出
    const processLLMStream = async () => {
      isGenerating = true;
      let fullResponse = '';

      try {
        // ✅ LLM 生成和 TTS 分离
        for await (const chunk of streamLLM(context, VOICE_SYSTEM_PROMPT)) {
          fullResponse += chunk;
          
          // 发送增量文本
          socket.send(JSON.stringify({ type: 'partial', content: chunk }));

          // ✅ 情感标签通过缓冲区处理
          emotionBuffer += chunk;
          const emotionMatch = emotionBuffer.match(/\[emotion:(\w+)\]/);
          if (emotionMatch) {
            socket.send(JSON.stringify({ type: 'emotion', emotion: emotionMatch[1] }));
            emotionBuffer = emotionBuffer.replace(/\[emotion:\w+\]/, '');
          }

          // ✅ 提取句子加入 TTS 队列，不阻塞
          const sentences = splitSentences(chunk.replace(/\[emotion:\w+\]/g, ''));
          for (const sentence of sentences) {
            const cleanSentence = sentence.trim();
            if (cleanSentence) {
              ttsQueue.push(cleanSentence);
            }
          }
          
          // 触发 TTS 流水线
          processTTSQueue();
        }

        // 保存 AI 回复到上下文
        context.push({ role: 'assistant', content: fullResponse });
        
        // 发送完成信号
        socket.send(JSON.stringify({ type: 'done' }));
        isDone = true;
        
        // 处理剩余 TTS
        processTTSQueue();

      } catch (err) {
        logger.error('[VoiceWS] LLM 生成失败:', err);
        socket.send(JSON.stringify({ type: 'error', message: String(err) }));
        isGenerating = false;
      }
    };

    socket.on('message', async (data: any) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'text' && !isGenerating) {
          const userText = message.content.trim();
          if (!userText) return;

          logger.info('[VoiceWS] 收到用户文本:', userText);

          // 发送识别结果
          socket.send(JSON.stringify({ type: 'text', content: userText }));

          // 添加到上下文
          context.push({ role: 'user', content: userText });

          // 重置状态
          emotionBuffer = '';
          ttsQueue.length = 0;
          isDone = false;

          // 启动 LLM 生成流水线
          processLLMStream();
        }

      } catch (err) {
        logger.error('[VoiceWS] 处理消息失败:', err);
        socket.send(JSON.stringify({ type: 'error', message: String(err) }));
      }
    });

    socket.on('close', () => {
      logger.info('[VoiceWS] 连接关闭');
      isDone = true;
      isGenerating = false;
    });

    socket.on('error', (err: any) => {
      logger.error('[VoiceWS] 连接错误:', err);
    });
  });
}