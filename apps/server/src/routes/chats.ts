// apps/server/src/routes/chats.ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile, unlink } from 'node:fs/promises';
import { prisma } from '../db.js';
import { requireAuth } from '../auth.js';
import { generateModelReplyStream } from '../model-provider.js';
import { composeCompanionMessages } from '@lpm/llm-core';
import { extractAndStoreMemory } from '../services/memory-extractor.js';
import { compressConversationContext } from '../services/message-summary.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(execFile);
import {
  AFFECTION_LEVEL_NAMES,
  determineAIEmotion,
  emotionPrompts,
  getOrCreateAffection,
  getTimeMode,
  timeModePrompts,
  updateAffectionAfterChat,
  type UserEmotion,
} from '../services/affection.js';
import {
  SkillsSystem,
  type SkillName,
  type SkillContext,
  EmotionAdapter,
} from '../services/skills.js';

// ============================================================
// 工具函数
// ============================================================

const inferEmotion = (reply: string): 'warm' | 'shy' | 'tsundere' | 'sad' | 'happy' | 'neutral' => {
  if (/(哼[！~！～]|才不是|笨蛋|谁在担心你|才没有|少自作多情|别误会|啰嗦|讨厌啦|哼，)/.test(reply)) return 'tsundere';
  if (/(害羞|脸红|不好意思|有点难为情|那个…|唔…|羞|遮脸|扭捏|结巴|心扑通)/.test(reply)) return 'shy';
  if (/(难过|别哭|心疼|抱抱|失落|伤心|眼泪|哭|委屈|不忍|辛苦了|心疼你|不好受)/.test(reply)) return 'sad';
  if (/(开心|太好了|真不错|高兴|笑出来|哈哈|嘻嘻|好棒|好开心|超开心|太棒了|耶|愉快|快乐)/.test(reply)) return 'happy';
  if (/(慢慢来|我在这里|别着急|先休息|陪着你|放心|没事的|别担心|有我在|安心|乖|摸摸头|乖啦)/.test(reply)) return 'warm';
  if (/(困|好累|想睡|晚安|早点休息|困了|睡吧|梦里见|好困|打哈欠)/.test(reply)) return 'sleepy' as any;
  if (/(担心|别勉强|还好吗|注意|小心|照顾好|怎么了|没事吧|不舒服)/.test(reply)) return 'concerned' as any;
  return 'neutral';
};

const normalizeRole = (role?: string): 'system' | 'user' | 'assistant' => {
  if (role === 'system' || role === 'assistant') return role;
  return 'user';
};

const DEFAULT_PERSONA_MODEL_PATH = '/live2d/models/kei_basic_free/runtime/kei_basic_free.model3.json';

const chatStreamBodySchema = z.object({
  sessionId: z.string().trim().min(1).max(120).optional(),
  message: z.string().trim().min(1).max(500),
  personaId: z.string().trim().min(1).max(120).optional(),
  aiModel: z.string().trim().min(1).max(120).optional(),
  userEmotion: z.string().optional(),
  userEmotionConfidence: z.number().min(0).max(1).optional(),
  userEmotionSource: z.string().optional(),
  userEmotionConsistency: z.string().optional(),
  userEmotionAiResolved: z.boolean().optional(),
  userEmotionTextSentiment: z.object({
    valence: z.number(),
    arousal: z.number(),
    keywords: z.array(z.string()),
  }).optional(),
});

const sensitiveKeywordPatterns = [
  /傻逼|滚|废物|垃圾|去死/,
  /未成年.*(色情|性)|儿童.*(色情|性)/,
  /制作.*(炸弹|毒品)|买卖.*(毒品|枪支)/,
];

const containsBlockedKeyword = (message: string) => sensitiveKeywordPatterns.some(pattern => pattern.test(message));

// 句子级流式TTS辅助函数
const punctuations = ['，', '。', '！', '？', '、', '；', '：'];
const pythonPath = process.env.PYTHON_PATH || 'python';

/**
 * 快速合成音频（使用临时文件，兼容 Windows）
 */
async function synthesizeAudioQuick(text: string, voice: string): Promise<Buffer> {
  const tmpFile = join(tmpdir(), `tts_chat_${randomUUID()}.mp3`);
  const args = [
    '-m', 'edge_tts',
    '--text', text.trim().substring(0, 500),
    '--voice', voice,
    '--write-media', tmpFile,
  ];
  
  await execAsync(pythonPath, args, { timeout: 30000 });
  const buffer = await readFile(tmpFile);
  await unlink(tmpFile).catch(() => {});
  return buffer;
}

// ============================================================
// 路由
// ============================================================

export async function chatRoutes(fastify: FastifyInstance) {

  // 内部函数：复用 SSE 聊天逻辑
  async function handleChatStream(request: any, reply: any, routePersonaId?: string) {
    const parsedBody = chatStreamBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'BAD_REQUEST', message: '消息不能为空，且长度不能超过 500 字。' });
    }

    const { sessionId, message, personaId, aiModel, userEmotion, userEmotionConfidence, userEmotionSource, userEmotionConsistency, userEmotionAiResolved, userEmotionTextSentiment } = parsedBody.data;
    if (containsBlockedKeyword(message)) {
      return reply.status(400).send({ error: 'CONTENT_BLOCKED', message: '消息包含不适合的内容，请换一种表达。' });
    }
    const userId = request.user!.userId;
    // URL 里的 personaId 优先级高于 body 里的
    const effectivePersonaId = routePersonaId || personaId || 'default';
    const effectiveSessionId = sessionId && sessionId.trim()
      ? sessionId
      : `chat-${effectivePersonaId}-${Date.now()}`;

    const requestOrigin = request.headers.origin || '';
    const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174,http://localhost:4174')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const corsOrigin = allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Credentials': 'true',
    });

    try {
      // 1. 保存用户消息（角色专属）
      await prisma.personaConversation.create({
        data: {
          userId,
          personaId: effectivePersonaId,
          sessionId: effectiveSessionId,
          role: 'user',
          content: message,
        }
      });

      // 2. 获取角色信息（包括 Skills 配置）
      let personaPrompt = '';
      let personaName = '';
      let modelPath = DEFAULT_PERSONA_MODEL_PATH;
      let skillsJson: SkillName[] = ['MemoryRetriever', 'EmotionAdapter', 'Validator', 'Decider'];
      let voiceId = 'zh-CN-XiaoxiaoNeural';
      let live2dModelId = 'kei_basic_free';

      if (effectivePersonaId && effectivePersonaId !== 'default') {
        const persona = await prisma.persona.findFirst({
          where: {
            id: effectivePersonaId,
            OR: [{ userId }, { user: { role: 'admin' } }],
          },
        });
        if (persona) {
          personaPrompt = persona.systemPrompt || persona.promptTemplate || '';
          personaName = persona.name;
          modelPath = persona.modelPath || DEFAULT_PERSONA_MODEL_PATH;
          
          // 解析 Skills 配置
          try {
            const parsedSkills = persona.skillsJson;
            if (Array.isArray(parsedSkills)) {
              skillsJson = parsedSkills as SkillName[];
            }
          } catch {
            skillsJson = ['MemoryRetriever', 'EmotionAdapter', 'Validator', 'Decider'];
          }
          
          // 获取音色配置
          voiceId = persona.voiceId || 'zh-CN-XiaoxiaoNeural';
          live2dModelId = persona.live2dModelId || 'kei_basic_free';
        }
      }

      // ===== 3. 获取完整历史 + 智能压缩（核心亮点）=====
      const allHistory = await prisma.personaConversation.findMany({
        where: { userId, personaId: effectivePersonaId, sessionId: effectiveSessionId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });

      // 读取用户的 AI Provider（需要在压缩前获取，以便摘要时使用）
      const defaultProvider = await prisma.aiProvider.findFirst({
        where: { userId, isDefault: true, isActive: true }
      });

      const fallbackProvider = defaultProvider || await prisma.aiProvider.findFirst({
        where: { userId, isActive: true }
      });

      let effectiveApiKey: string | undefined;
      if (fallbackProvider?.apiKey) {
        try {
          const parsed = JSON.parse(fallbackProvider.apiKey);
          if (parsed.iv && parsed.data && parsed.tag) {
            const { createDecipheriv, createHash } = await import('node:crypto');
            const key = createHash('sha256').update(process.env.ENCRYPTION_KEY || 'dev-encryption-key-32chars!!').digest();
            const iv = Buffer.from(parsed.iv, 'base64');
            const authTag = Buffer.from(parsed.tag, 'base64');
            const data = Buffer.from(parsed.data, 'base64');
            const decipher = createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(authTag);
            effectiveApiKey = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
          } else {
            effectiveApiKey = fallbackProvider.apiKey;
          }
        } catch {
          effectiveApiKey = undefined;
        }
      }

      const effectiveBaseUrl = fallbackProvider?.baseUrl || fastify.config.MODEL_BASE_URL;
      const effectiveProvider = fallbackProvider?.type || fastify.config.MODEL_PROVIDER || 'ollama';
      const effectiveModel = aiModel && aiModel !== 'default'
        ? aiModel
        : (fallbackProvider?.model || fastify.config.MODEL_NAME);

      // 尝试读取已保存的摘要（减少重复生成）
      const savedSummary = await prisma.conversationSummary.findUnique({
        where: { sessionId: effectiveSessionId }
      }).catch(() => null);

      // 如果已有摘要且消息数没变化太多，直接复用
      const historyForCompress = savedSummary && allHistory.length <= savedSummary.messageCount + 3
        ? allHistory.slice(-(allHistory.length - savedSummary.messageCount))
        : allHistory;

      const { processedMessages: compressed, wasCompressed, summaryText } = await compressConversationContext(
        historyForCompress.map(h => ({ id: h.id, role: h.role, content: h.content, createdAt: h.createdAt })),
        effectiveBaseUrl,
        effectiveModel,
        effectiveProvider,
        effectiveApiKey,
        2500,
        8
      );

      // 持久化摘要（异步，不阻塞回复）
      if (wasCompressed && summaryText) {
        prisma.conversationSummary.upsert({
          where: { sessionId: effectiveSessionId },
          create: { sessionId: effectiveSessionId, personaId: effectivePersonaId, userId, content: summaryText, messageCount: allHistory.length },
          update: { content: summaryText, messageCount: allHistory.length, updatedAt: new Date() }
        }).catch(err => logger.warn('[Summary] 保存失败:', err));
      }

      const summaryMsg = compressed.find(m => m.role === 'system');
      const recentMsgs = compressed.filter(m => m.role !== 'system');

      // 4. 获取全局记忆、角色专属记忆与当前好感度
      const globalMemories = await prisma.memory.findMany({
        where: {
          userId,
          memoryType: 'memory',
          deletedAt: null,
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      });

      const { recallMemories } = await import('../services/memory-recall.js');
      const personaMemories = await recallMemories(message, effectivePersonaId, userId, 8);

      const currentAffection = await getOrCreateAffection(effectivePersonaId, userId);
      const inferredEmotion = inferEmotion(message) as UserEmotion;
      const timeMode = getTimeMode();
      const aiEmotion = determineAIEmotion(inferredEmotion, currentAffection.level, timeMode);

      // ========== Skills 系统处理 ==========
      const skillContext: SkillContext = {
        userId,
        personaId: effectivePersonaId,
        message,
        userEmotion: userEmotion || inferredEmotion,
        aiEmotion,
        conversationHistory: recentMsgs.map(item => ({ role: item.role, content: item.content }))
      };

      let enhancedSystemPrompt = await SkillsSystem.buildSystemPrompt(
        skillsJson,
        skillContext,
        allHistory.length,
        personaPrompt
      );

      if (summaryMsg) {
        enhancedSystemPrompt += `\n\n${summaryMsg.content}\n（以上为之前对话的压缩摘要，请基于这些信息保持上下文连贯，不要向用户提及"摘要"二字。）`;
      }

      // 获取情绪适配信息（用于语音）
      const emotionConfig = EmotionAdapter.adaptAIEmotion(aiEmotion);

      // 5. 构造消息
      const composed = composeCompanionMessages({
        userId,
        message,
        emotion: inferredEmotion,
        shortTermSummary: recentMsgs.map(item => `${normalizeRole(item.role)}: ${item.content}`),
        longTermSummary: [
          ...personaMemories.map((item, idx) => ({
            id: item.id,
            score: (item.importance ?? item.priority ?? 0),
            mode: 'persona-memory',
            reasons: [`category:${item.category}`, `importance:${item.importance}`, `accessCount:${item.accessCount}`],
            payload: {
              rank: idx,
              content: item.content,
              category: item.category,
              importance: item.importance,
              accessCount: item.accessCount,
              priority: item.priority,
              tags: item.tags,
            },
          })),
          ...globalMemories.map((item, idx) => ({
            id: item.id,
            score: 0,
            mode: 'memory',
            reasons: [],
            payload: {
              rank: idx + personaMemories.length,
              ...(typeof item.contentJson === 'object' && item.contentJson !== null
                ? item.contentJson
                : { content: item.contentJson }),
            },
          })),
        ],
        channel: 'text',
        personaPrompt: enhancedSystemPrompt,
        personaName,
      });

      if (composed.length > 0 && composed[0].role === 'system') {
        composed[0].content += `\n【当前时间段】${timeModePrompts[timeMode]}`;
        composed[0].content += `\n【你当前状态】${emotionPrompts[aiEmotion]}`;
        composed[0].content += `\n【你们的关系】好感度等级 ${currentAffection.level}（${AFFECTION_LEVEL_NAMES[currentAffection.level]}），分数 ${currentAffection.score}。请自然体现熟悉程度，不要直接报数值。`;
        if (userEmotion && userEmotion !== 'neutral') {
          const confidencePct = userEmotionConfidence ? `${(userEmotionConfidence * 100).toFixed(0)}%` : '未知';
          const sourceLabel = userEmotionSource === 'server-ai' ? 'AI语义仲裁' : userEmotionSource === 'text+fused' ? '文字+语音+视频综合' : userEmotionSource === 'text' ? '文字语义' : userEmotionSource === 'fused' ? '语音+视频融合' : userEmotionSource === 'voice' ? '语音特征' : userEmotionSource === 'video' ? '视频表情' : userEmotionSource || '未知';
          let emotionDetail = `\n【用户当前情绪】${userEmotion}（置信度 ${confidencePct}，来源：${sourceLabel}）`;
          if (userEmotionAiResolved) {
            emotionDetail += `\n【AI仲裁】信号冲突时由AI模型统一判断`;
          }
          if (userEmotionConsistency) {
            const consistencyLabel = userEmotionConsistency === 'consistent' ? '一致' : userEmotionConsistency === 'conflict' ? '矛盾' : '部分一致';
            emotionDetail += `\n【多模态一致性】${consistencyLabel}`;
          }
          if (userEmotionTextSentiment) {
            const sentimentValence = userEmotionTextSentiment.valence > 0.3 ? '正面' : userEmotionTextSentiment.valence < -0.3 ? '负面' : '中性';
            const sentimentArousal = userEmotionTextSentiment.arousal > 0.6 ? '激动' : userEmotionTextSentiment.arousal > 0.3 ? '中等' : '平静';
            emotionDetail += `\n【文字情感分析】${sentimentValence}，${sentimentArousal}`;
            if (userEmotionTextSentiment.keywords.length > 0) {
              emotionDetail += `，关键词：${userEmotionTextSentiment.keywords.join('、')}`;
            }
          }
          emotionDetail += `\n请根据用户的情绪调整你的回应语气和情绪。回复时请在最开头用 [emotion:情绪] 标记你的情绪，可选：neutral, happy, sad, angry, surprised, fearful, disgusted, thinking。例如：[emotion:happy] 太好了！`;
          composed[0].content += emotionDetail;
        }
      }

      // 记录使用的 Provider 配置（用于调试）
      logger.info(`[ChatStream] Using provider: ${effectiveProvider}, baseUrl: ${effectiveBaseUrl}, model: ${effectiveModel}, isDefault: ${!!defaultProvider}, fallback: ${!defaultProvider && !!fallbackProvider}`);

      const stream = generateModelReplyStream({
        baseUrl: effectiveBaseUrl,
        model: effectiveModel,
        provider: effectiveProvider,
        apiKey: effectiveApiKey,
        messages: composed,
        fallbackReply: '我还在整理思路，稍后再好好回答你。',
      });

      let fullReply = '';
      let tokenCount = 0;
      let hasReceivedToken = false;
      // 句子级TTS流式缓冲
      let sentenceBuffer = '';
      const MIN_SENTENCE_LENGTH = 5; // 最小句子长度

      reply.raw.write(`event: connected\ndata: ${JSON.stringify({
        type: 'connected',
        content: '',
        sessionId: effectiveSessionId,
        persona: personaName,
        model: effectiveModel,
        modelPath,
        emotion: aiEmotion,
        affection: { level: currentAffection.level, score: currentAffection.score },
        timeMode,
        // ========== 新增：Skills 相关信息 ==========
        skills: {
          enabled: skillsJson,
          voiceId,
          live2dModelId,
          emotionTone: emotionConfig.toneAdjustment
        }
      })}\n\n`);

      for await (const chunk of stream) {
        if (chunk.error) {
          // 错误时把已生成的文字也带过去
          reply.raw.write(`event: error\ndata: ${JSON.stringify({
            error: chunk.error,
            content: fullReply,
          })}\n\n`);
          break;
        }
        if (chunk.token) {
          hasReceivedToken = true;
          fullReply += chunk.token;
          sentenceBuffer += chunk.token;
          tokenCount++;
          
          // 发送文本token
          reply.raw.write(`event: token\ndata: ${JSON.stringify({
            type: 'delta',
            content: chunk.token,
            token: chunk.token,
            emotion: aiEmotion,
          })}\n\n`);
          
          // 句子级TTS：检测标点符号触发成句
          const hasPunctuation = punctuations.some(p => chunk.token.includes(p));
          if (hasPunctuation && sentenceBuffer.trim().length >= MIN_SENTENCE_LENGTH) {
            try {
              // 异步合成当前句子音频
              const audioBuffer = await synthesizeAudioQuick(sentenceBuffer.trim(), voiceId);
              const base64Audio = audioBuffer.toString('base64');
              reply.raw.write(`event: audio_chunk\ndata: ${JSON.stringify({
                type: 'audio_chunk',
                text: sentenceBuffer.trim(),
                audio: base64Audio,
              })}\n\n`);
              sentenceBuffer = '';
            } catch (ttsError) {
              logger.warn('[ChatStream] 句子TTS合成失败:', ttsError);
              sentenceBuffer = '';
            }
          }
        }
        if (chunk.done) {
          const finalEmotion = inferEmotion(fullReply) || aiEmotion;
          
          // 处理剩余未发送的句子
          if (sentenceBuffer.trim().length > 0) {
            try {
              const audioBuffer = await synthesizeAudioQuick(sentenceBuffer.trim(), voiceId);
              const base64Audio = audioBuffer.toString('base64');
              reply.raw.write(`event: audio_chunk\ndata: ${JSON.stringify({
                type: 'audio_chunk',
                text: sentenceBuffer.trim(),
                audio: base64Audio,
              })}\n\n`);
            } catch (ttsError) {
              logger.warn('[ChatStream] 剩余句子TTS合成失败:', ttsError);
            }
          }
          
          reply.raw.write(`event: done\ndata: ${JSON.stringify({
            type: 'done',
            content: fullReply.trim(),
            reply: fullReply.trim(),
            emotion: finalEmotion,
            tokenCount,
            model: {
              provider: fastify.config.MODEL_PROVIDER,
              name: effectiveModel,
              fallbackUsed: !hasReceivedToken,
            },
            affection: { level: currentAffection.level, score: currentAffection.score },
            timeMode,
            // ========== 新增：语音配置 ==========
            voice: {
              voiceId,
              toneAdjustment: emotionConfig.toneAdjustment
            }
          })}\n\n`);
          break;
        }
      }

      // 保存 AI 回复
      await prisma.personaConversation.create({
        data: {
          userId,
          personaId: effectivePersonaId,
          sessionId: effectiveSessionId,
          role: 'assistant',
          content: fullReply.trim(),
          emotion: aiEmotion,
        },
      });

      const [memoryResult, affectionResult] = await Promise.all([
        extractAndStoreMemory(
          effectivePersonaId,
          userId,
          message,
          fullReply.trim(),
          effectiveProvider !== 'ollama' ? {
            baseUrl: effectiveBaseUrl,
            model: effectiveModel,
            provider: effectiveProvider,
            apiKey: effectiveApiKey,
          } : undefined
        ),
        updateAffectionAfterChat(effectivePersonaId, userId, message),
      ]);

      if (memoryResult.stored > 0 || affectionResult.delta !== 0) {
        await prisma.auditLog.create({
          data: {
            userId,
            action: 'chat.post_process',
            targetType: 'persona',
            targetId: effectivePersonaId,
            metadataJson: {
              memoryStored: memoryResult.stored,
              affectionDelta: affectionResult.delta,
              affectionReasons: affectionResult.reasons,
            },
          },
        }).catch(() => undefined);
      }

      reply.raw.end();
    } catch (error) {
      logger.error('SSE chat error:', error);
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: '模型响应失败' })}\n\n`);
      reply.raw.end();
    }

    request.raw.on('close', () => {
      logger.info(`SSE connection closed for session ${effectiveSessionId}`);
    });
  }

  // 1. 原有 SSE 路由
  fastify.post('/api/chat/stream', { preHandler: requireAuth }, async (request, reply) => {
    return handleChatStream(request, reply);
  });

  // 1a. 统一情绪语义理解 API：前端多模态信号冲突时调用 AI 做最终判断
  const emotionAnalyzeSchema = z.object({
    text: z.string().min(1).max(500),
    voiceEmotion: z.object({
      pitchMean: z.number(),
      pitchVariance: z.number(),
      energyMean: z.number(),
      speechRate: z.number(),
    }).optional(),
    videoEmotion: z.object({
      expression: z.string(),
      intensity: z.number().min(0).max(1),
    }).optional(),
    videoExpression: z.string().optional(),
    localEmotion: z.string().optional(),
    localConfidence: z.number().min(0).max(1).optional(),
    consistency: z.string().optional(),
  });

  fastify.post('/api/emotion/analyze', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = emotionAnalyzeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: '参数错误', details: parsed.error.flatten() });
    }

    const { text, voiceEmotion, videoEmotion, videoExpression, localEmotion, localConfidence, consistency } = parsed.data;
    const userId = request.user!.userId;

    try {
      const defaultProvider = await prisma.aiProvider.findFirst({ where: { userId, isDefault: true } });
      const fallbackProvider = await prisma.aiProvider.findFirst({ where: { userId, isDefault: false } });
      const provider = defaultProvider || fallbackProvider;

      if (!provider) {
        return reply.send({ emotion: localEmotion || 'neutral', confidence: localConfidence || 0.3, source: 'no-provider', aiResolved: false });
      }

      let apiKey: string | undefined;
      if (provider.apiKey) {
        try {
          const parsed = JSON.parse(provider.apiKey);
          if (parsed.iv && parsed.data && parsed.tag) {
            const { createDecipheriv, createHash } = await import('node:crypto');
            const key = createHash('sha256').update(process.env.ENCRYPTION_KEY || 'dev-encryption-key-32chars!!').digest();
            const iv = Buffer.from(parsed.iv, 'base64');
            const authTag = Buffer.from(parsed.tag, 'base64');
            const data = Buffer.from(parsed.data, 'base64');
            const decipher = createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(authTag);
            apiKey = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
          } else {
            apiKey = provider.apiKey;
          }
        } catch { apiKey = undefined; }
      }

      const baseUrl = provider.baseUrl || 'http://localhost:11434';
      const model = provider.model || 'qwen2.5:7b';
      const isOllama = baseUrl.includes('localhost') || baseUrl.includes('11434');

      const signalParts: string[] = [];
      signalParts.push(`用户说的话：「${text}」`);
      if (voiceEmotion) {
        signalParts.push(`语音特征：音高${voiceEmotion.pitchMean.toFixed(0)}Hz，能量${(voiceEmotion.energyMean * 100).toFixed(0)}%，语速${voiceEmotion.speechRate.toFixed(1)}`);
      }
      if (videoEmotion) {
        signalParts.push(`视频表情：${videoEmotion.expression}（强度${(videoEmotion.intensity * 100).toFixed(0)}%）`);
      }
      if (videoExpression) {
        signalParts.push(`视频详细表情数据：${videoExpression}`);
      }
      if (localEmotion) {
        signalParts.push(`本地规则初步判断：${localEmotion}（置信度${((localConfidence || 0) * 100).toFixed(0)}%，一致性：${consistency || 'unknown'}）`);
      }
      signalParts.push(`请综合以上所有信号判断用户最可能的真实情绪。当信号冲突时，文字语义通常最可靠。`);

      const systemPrompt = `你是一个情绪语义分析专家。你需要从用户的话语中提取隐含的情绪，而不是简单匹配关键词。
正常人说话时很少直接说"我好开心"或"我很生气"，而是通过叙述事情来表达情绪。
例如：
- "今天终于把那个bug修好了" → relieved/proud（不是neutral）
- "他又迟到了" → frustrated/angry（不是neutral）
- "你说我们以后会怎样呢" → curious/nostalgic（不是neutral）
- "算了，不说了" → sad/frustrated（不是neutral）
- "这个方案我觉得还可以再优化一下" → thinking/curious（不是neutral）

可选情绪：neutral, happy, sad, angry, surprised, fearful, disgusted, excited, shy, thinking, confused, bored, relieved, frustrated, nostalgic, curious, apologetic, proud, warm, concerned, sleepy, tsundere

请严格按照以下JSON格式回复，不要有任何其他文字：
{"emotion":"情绪","confidence":0.8,"reasoning":"简短理由"}`;

      let aiContent = '';

      if (isOllama) {
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: signalParts.join('\n') },
            ],
            stream: false,
            options: { temperature: 0.3, num_predict: 100 },
          }),
          signal: AbortSignal.timeout(5000),
        });
        const data = await res.json() as { message?: { content?: string } };
        aiContent = data?.message?.content || '';
      } else {
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: signalParts.join('\n') },
            ],
            temperature: 0.3,
            max_tokens: 100,
          }),
          signal: AbortSignal.timeout(5000),
        });
        const data = await res.json() as { choices?: { message?: { content?: string } }[] };
        aiContent = data?.choices?.[0]?.message?.content || '';
      }

      const jsonMatch = aiContent.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const validEmotions = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'fearful', 'disgusted', 'excited', 'shy', 'thinking', 'confused', 'bored', 'relieved', 'frustrated', 'nostalgic', 'curious', 'apologetic', 'proud', 'warm', 'concerned', 'sleepy', 'tsundere'];
        if (validEmotions.includes(parsed.emotion)) {
          return reply.send({
            emotion: parsed.emotion,
            confidence: Math.min(1.0, Math.max(0.1, parsed.confidence || 0.5)),
            reasoning: parsed.reasoning || '',
            source: 'ai-resolved',
            aiResolved: true,
          });
        }
      }

      return reply.send({
        emotion: localEmotion || 'neutral',
        confidence: localConfidence || 0.3,
        source: 'ai-fallback',
        aiResolved: false,
      });
    } catch (err) {
      logger.warn('[EmotionAnalyze] AI调用失败:', err);
      return reply.send({
        emotion: localEmotion || 'neutral',
        confidence: localConfidence || 0.3,
        source: 'ai-error',
        aiResolved: false,
      });
    }
  });

  // 1b. 兼容路由：/api/personas/:personaId/chat
  fastify.post('/api/personas/:personaId/chat', { preHandler: requireAuth }, async (request, reply) => {
    const { personaId } = request.params as { personaId: string };
    return handleChatStream(request, reply, personaId);
  });

  // 1c. 兼容路由：获取指定角色/会话的对话历史
  fastify.get('/api/personas/:personaId/conversations', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const { personaId } = request.params as { personaId: string };
    const { sessionId } = request.query as { sessionId?: string };

    const conversations = await prisma.personaConversation.findMany({
      where: {
        userId,
        personaId,
        ...(sessionId ? { sessionId } : {}),
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({ conversations, data: conversations });
  });

  // 1d. 兼容路由：清空指定角色的对话历史
  fastify.delete('/api/personas/:personaId/conversations', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const { personaId } = request.params as { personaId: string };
    const { sessionId } = request.query as { sessionId?: string };

    await prisma.personaConversation.updateMany({
      where: {
        userId,
        personaId,
        ...(sessionId ? { sessionId } : {}),
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });

    return reply.send({ success: true });
  });

  // ==========================================================
  // 1. 对话管理 API (/api/chats) — 前端 ChatContext 需要
  // ==========================================================

  // GET /api/chats?personaId=xxx — 获取用户的对话列表
  fastify.get('/api/chats', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { personaId } = request.query as { personaId?: string };

    const where: any = { userId, deletedAt: null };
    if (personaId) where.personaId = personaId;

    // 按 sessionId 分组，获取每个对话的最后一条消息作为标题
    const conversations = await prisma.personaConversation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // 按 sessionId 分组
    const sessionMap = new Map<string, typeof conversations>();
    for (const msg of conversations) {
      if (!sessionMap.has(msg.sessionId)) {
        sessionMap.set(msg.sessionId, []);
      }
      sessionMap.get(msg.sessionId)!.push(msg);
    }

    const chatList = Array.from(sessionMap.entries()).map(([sessionId, messages]) => {
      const firstUserMsg = messages.find(m => m.role === 'user');
      const lastMsg = messages[messages.length - 1];
      return {
        id: sessionId,                    // chatId 就是 sessionId
        sessionId,
        personaId: messages[0].personaId,
        title: firstUserMsg?.content.slice(0, 30) || '新对话',
        lastMessage: lastMsg?.content.slice(0, 50) || '',
        updatedAt: lastMsg?.createdAt.toISOString() || new Date().toISOString(),
        messageCount: messages.length,
      };
    });

    return reply.send({ chats: chatList });
  });

  // POST /api/chats — 创建新对话
  fastify.post('/api/chats', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const parsed = z.object({
      personaId: z.string().min(1),
      title: z.string().optional(),
    }).safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'BAD_REQUEST', message: '需要 personaId' });
    }

    const { personaId, title } = parsed.data;
    const sessionId = `chat-${personaId}-${Date.now()}`;

    // 可选：插入一条 system 占位消息来标记对话创建
    // 或者什么都不做，等用户发第一条消息时自然创建

    return reply.status(201).send({
      chat: {
        id: sessionId,
        sessionId,
        personaId,
        title: title || '新对话',
        lastMessage: '',
        updatedAt: new Date().toISOString(),
        messageCount: 0,
      },
    });
  });

  // GET /api/chats/:chatId/messages — 获取某对话的所有消息
  fastify.get('/api/chats/:chatId/messages', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { chatId } = request.params as { chatId: string };

    const messages = await prisma.personaConversation.findMany({
      where: { userId, sessionId: chatId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        emotion: m.emotion,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  });

  // DELETE /api/chats/:chatId — 软删除对话
  fastify.delete('/api/chats/:chatId', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { chatId } = request.params as { chatId: string };

    // 软删除：给该 sessionId 下的所有消息标记 deletedAt
    await prisma.personaConversation.updateMany({
      where: { userId, sessionId: chatId },
      data: { deletedAt: new Date() },
    });

    return reply.send({ success: true });
  });

  // POST /api/chats/:chatId/restore — 恢复对话
  fastify.post('/api/chats/:chatId/restore', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const { chatId } = request.params as { chatId: string };

    await prisma.personaConversation.updateMany({
      where: { userId, sessionId: chatId },
      data: { deletedAt: null },
    });

    return reply.send({ success: true });
  });

  // ==========================================================
  // 3. 兼容旧路由（可选，如果前端还有其他地方在用）
  // ==========================================================

  // 兼容：/api/chat/history/:personaId → 直接查询对话历史
  fastify.get('/api/chat/history/:personaId', { preHandler: requireAuth }, async (request, reply) => {
    const { personaId } = request.params as { personaId: string };
    const userId = request.user!.userId;
    const { sessionId } = request.query as { sessionId?: string };

    const where: { userId: string; personaId: string; sessionId?: string } = { userId, personaId };
    if (sessionId) where.sessionId = sessionId;

    const history = await prisma.personaConversation.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    return reply.send({ history });
  });

}