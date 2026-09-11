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