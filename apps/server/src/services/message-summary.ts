import { generateModelReply } from '../model-provider.js';
import { logger } from '../utils/logger.js';
import { estimateTokens } from '../utils/token-counter.js';

function estimateMessageTokens(msg: { role: string; content: string }): number {
  const roleOverhead = msg.role === 'system' ? 4 : 3;
  return roleOverhead + estimateTokens(msg.content) + 3;
}

export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
}

const SUMMARY_PROMPT = `你是对话压缩专家。将以下历史对话压缩为 1 段摘要，要求：
1. 保留用户关键信息、偏好、情绪转折
2. 保留助手的重要承诺和态度
3. 删除寒暄、重复、口水话
4. 第三人称客观叙述，≤180字`;

export async function generateConversationSummary(
  messages: ChatMessage[],
  baseUrl: string,
  model: string,
  provider: string,
  apiKey?: string
): Promise<string> {
  if (messages.length === 0) return '';

  const text = messages
    .map(m => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
    .join('\n');

  try {
    const res = await generateModelReply({
      baseUrl,
      model,
      provider,
      apiKey,
      messages: [
        { role: 'system', content: SUMMARY_PROMPT },
        { role: 'user', content: `请摘要：\n\n${text}` }
      ],
      fallbackReply: '对话历史较长，涉及多个话题。'
    });
    return res.reply?.trim() || '';
  } catch (err) {
    logger.error('[Summary] LLM摘要失败:', err);
    const first = messages[0];
    const topics = messages.slice(-3).map(m => m.content.slice(0, 12)).join('、');
    return `历史共${messages.length}轮(${first.createdAt.toLocaleDateString()}起)，近期：${topics}...`;
  }
}

export interface CompressionResult {
  processedMessages: Array<{ role: string; content: string }>;
  wasCompressed: boolean;
  summaryText?: string;
}

const TAIL_TOKEN_LIMIT = 1200;

export async function compressConversationContext(
  messages: ChatMessage[],
  baseUrl: string,
  model: string,
  provider: string,
  apiKey?: string,
  maxTokens: number = 2500,
  preserveRecent: number = 8
): Promise<CompressionResult> {
  const systemMessages = messages.filter(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  const totalTokens = chatMessages.reduce((s, m) => s + estimateMessageTokens(m), 0)
    + systemMessages.reduce((s, m) => s + estimateMessageTokens(m), 0);

  if (totalTokens <= maxTokens || chatMessages.length <= preserveRecent + 2) {
    return {
      processedMessages: messages.map(m => ({ role: m.role, content: m.content })),
      wasCompressed: false
    };
  }

  logger.info(`[Compress] 触发压缩: ${messages.length}条(含${systemMessages.length}条system), ~${Math.round(totalTokens)}tokens`);

  let tailIndex = chatMessages.length;
  let tailTokenSum = 0;
  while (tailIndex > 0 && tailTokenSum < TAIL_TOKEN_LIMIT) {
    tailIndex -= 1;
    tailTokenSum += estimateMessageTokens(chatMessages[tailIndex]);
  }
  if (tailIndex < chatMessages.length - preserveRecent) {
    tailIndex = chatMessages.length - preserveRecent;
  }

  const recent = chatMessages.slice(tailIndex);
  const older = chatMessages.slice(0, tailIndex);

  const summary = await generateConversationSummary(older, baseUrl, model, provider, apiKey);

  return {
    processedMessages: [
      ...systemMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'system', content: `[历史摘要] ${summary}` },
      ...recent.map(m => ({ role: m.role, content: m.content }))
    ],
    wasCompressed: true,
    summaryText: summary
  };
}

// ================= 双层摘要 =================

export interface CompressionResultV2 {
  processedMessages: Array<{ role: string; content: string }>;
  wasCompressed: boolean;
  nearSummary?: string;
  farSummary?: string;
  farCount: number;
  messageCount: number;
}

const NEAR_WINDOW = 30;
const FAR_SELECT_TOP_K = 50;
const FAR_REGEN_THRESHOLD = 5;

const IMPORTANCE_PATTERNS = /喜欢|偏好|决定|承诺|重要|记住|讨厌|想要|需要|选择|设定|配置|目标|原则|底线|习惯|风格/;

function extractKeywords(messages: ChatMessage[]): Set<string> {
  const keywords = new Set<string>();
  for (const m of messages) {
    const words = m.content
      .replace(/[，。！？、；：""''（）【】《》…—～·\u200b]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);
    for (const w of words) keywords.add(w);
  }
  return keywords;
}

function scoreMessage(
  msg: ChatMessage,
  recentKeywords: Set<string>,
  maxContentLen: number
): number {
  let score = 0;

  score += Math.min(msg.content.length / 50, 3);

  if (IMPORTANCE_PATTERNS.test(msg.content)) score += 2;

  if (msg.role === 'user') score += 0.5;

  const msgWords = new Set(
    msg.content
      .replace(/[，。！？、；：""''（）【】《》…—～·\u200b]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2)
  );
  let overlap = 0;
  for (const w of msgWords) {
    if (recentKeywords.has(w)) overlap++;
  }
  score += overlap * 0.3;

  if (maxContentLen > 0) {
    score += (msg.content.length / maxContentLen) * 0.5;
  }

  return score;
}

function selectByImportance(
  messages: ChatMessage[],
  recentKeywords: Set<string>,
  topK: number
): ChatMessage[] {
  if (messages.length <= topK) return messages;

  const maxContentLen = Math.max(...messages.map(m => m.content.length), 1);

  const scored = messages.map((m, idx) => ({
    msg: m,
    score: scoreMessage(m, recentKeywords, maxContentLen) + (idx / messages.length) * 0.2,
  }));

  scored.sort((a, b) => b.score - a.score);

  const selected = scored.slice(0, topK).map(s => s.msg);
  selected.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return selected;
}

export async function compressConversationContextV2(
  messages: ChatMessage[],
  baseUrl: string,
  model: string,
  provider: string,
  apiKey?: string,
  opts: {
    maxTokens?: number;
    preserveRecent?: number;
    farSummary?: string;
    farCount?: number;
  } = {}
): Promise<CompressionResultV2> {
  const maxTokens = opts.maxTokens ?? 2500;
  const preserveRecent = opts.preserveRecent ?? 8;
  const savedFarSummary = opts.farSummary;
  const savedFarCount = opts.farCount ?? 0;

  const systemMessages = messages.filter(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  const totalTokens = chatMessages.reduce((s, m) => s + estimateMessageTokens(m), 0)
    + systemMessages.reduce((s, m) => s + estimateMessageTokens(m), 0);

  if (totalTokens <= maxTokens || chatMessages.length <= preserveRecent + 2) {
    return {
      processedMessages: messages.map(m => ({ role: m.role, content: m.content })),
      wasCompressed: false,
      farCount: savedFarCount,
      messageCount: chatMessages.length
    };
  }

  logger.info(`[CompressV2] 触发双层压缩: ${messages.length}条(含${systemMessages.length}条system), ~${Math.round(totalTokens)}tokens`);

  let tailIndex = chatMessages.length;
  let tailTokenSum = 0;
  while (tailIndex > 0 && tailTokenSum < TAIL_TOKEN_LIMIT) {
    tailIndex -= 1;
    tailTokenSum += estimateMessageTokens(chatMessages[tailIndex]);
  }
  if (tailIndex < chatMessages.length - preserveRecent) {
    tailIndex = chatMessages.length - preserveRecent;
  }

  const recent = chatMessages.slice(tailIndex);

  const nearEnd = tailIndex;
  const nearStart = Math.max(0, nearEnd - NEAR_WINDOW);
  const nearMessages = chatMessages.slice(nearStart, nearEnd);

  const farMessages = chatMessages.slice(0, nearStart);

  let farSummary: string | undefined = savedFarSummary;
  let farCount = savedFarCount;

  const shouldRegenFar = farMessages.length > 0 && (
    farCount === 0 ||
    farMessages.length > farCount + FAR_REGEN_THRESHOLD ||
    !savedFarSummary
  );

  if (shouldRegenFar) {
    const recentKeywords = extractKeywords([...nearMessages, ...recent]);
    const selected = selectByImportance(farMessages, recentKeywords, FAR_SELECT_TOP_K);
    if (selected.length > 0) {
      farSummary = await generateConversationSummary(selected, baseUrl, model, provider, apiKey);
      farCount = farMessages.length;
      logger.info(`[CompressV2] 远期摘要: ${farMessages.length}条中按重要度选出${selected.length}条生成`);
    }
  }

  let nearSummary: string | undefined;
  if (nearMessages.length > 0) {
    nearSummary = await generateConversationSummary(nearMessages, baseUrl, model, provider, apiKey);
    logger.info(`[CompressV2] 近期摘要: ${nearMessages.length}条 (第${nearStart + 1}~${nearEnd}条)`);
  }

  const resultMessages: Array<{ role: string; content: string }> = [
    ...systemMessages.map(m => ({ role: m.role, content: m.content })),
  ];

  if (farSummary) {
    resultMessages.push({ role: 'system', content: `[远期对话摘要] ${farSummary}` });
  }
  if (nearSummary) {
    resultMessages.push({ role: 'system', content: `[近期对话摘要] ${nearSummary}` });
  }

  resultMessages.push(...recent.map(m => ({ role: m.role, content: m.content })));

  return {
    processedMessages: resultMessages,
    wasCompressed: true,
    nearSummary,
    farSummary,
    farCount,
    messageCount: chatMessages.length
  };
}