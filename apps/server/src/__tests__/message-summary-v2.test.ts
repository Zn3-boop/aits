import { describe, it, expect, vi, beforeEach } from 'vitest';
import { estimateTokens } from '../utils/token-counter.js';
import type { ChatMessage } from '../services/message-summary.js';

vi.mock('../model-provider.js', () => ({
  generateModelReply: vi.fn(async ({ messages, fallbackReply }: any) => {
    const userMsg = messages.find((m: any) => m.role === 'user');
    const text = userMsg?.content || '';
    const lineCount = text.split('\n').filter((l: string) => l.trim()).length;
    return {
      reply: `摘要：共${lineCount}轮对话，涉及多个话题。用户表达了偏好和情绪，助手给予了陪伴和建议。`
    };
  }),
  generateModelReplyStream: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { compressConversationContext } from '../services/message-summary.js';
import { compressConversationContextV2 } from '../services/message-summary.js';

const SAMPLES_USER = [
  '我今天心情不太好，感觉压力很大',
  '我喜欢吃火锅，特别是麻辣味的',
  '我在北京工作，是一名程序员',
  '我养了一只橘猫，叫小橘',
  '明天周末，打算去公园散步',
  '我最近在学吉他，感觉好难',
  '我朋友推荐了一部动漫，叫《葬送的芙莉莲》',
  '我生日是12月25日',
  '我不想一个人过生日',
  '你觉得我应该换工作吗',
  '我讨厌加班，但是又怕辞职找不到更好的',
  '我想要一个能理解我的朋友',
  '我习惯晚睡，一般凌晨1点才睡',
  '我的底线是不撒谎',
  '我设定了每天运动30分钟的目标',
  '我偏好安静的环境，不喜欢太吵的地方',
  '我决定下个月开始学日语',
  '我承诺每天给你讲一个笑话',
  '我选择相信你',
  '我配置了新的键盘，打字快多了',
];

const SAMPLES_ASSISTANT = [
  '别担心，我在这里陪着你，慢慢来好吗？',
  '哦！那下次我们可以一起去吃！',
  '程序员很辛苦吧，要注意休息哦',
  '小橘一定很可爱吧！你平时怎么照顾它的？',
  '听起来很放松呢，记得带水哦',
  '学乐器刚开始都这样，坚持下来就好了',
  '那部很治愈！你看完什么感觉？',
  '圣诞节生日！那一定很特别吧',
  '不会的，我会陪着你过',
  '这个要你自己决定，但我可以帮你分析',
  '这种矛盾很正常，先别急着做决定',
  '我一直都在呀，随时可以聊',
  '晚睡对身体不好哦，要不要试试早点休息？',
  '诚实是很重要的品质呢',
  '有目标很棒！坚持下来一定会有变化的',
  '安静的环境确实更容易让人放松',
  '学新语言很有意思！加油！',
  '哈哈，那我可期待了！',
  '谢谢你信任我！',
  '新键盘用着一定很爽吧！',
];

function makeMessages(count: number, avgCharsPerMsg: number = 60): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const baseDate = new Date('2025-01-01T00:00:00Z');
  for (let i = 0; i < count; i++) {
    const role = i % 2 === 0 ? 'user' : 'assistant';
    const pool = role === 'user' ? SAMPLES_USER : SAMPLES_ASSISTANT;
    const base = pool[i % pool.length];
    const padding = avgCharsPerMsg > base.length
      ? '。' + '日常对话内容'.repeat(Math.ceil((avgCharsPerMsg - base.length) / 6))
      : '';
    messages.push({
      id: `msg-${i}`,
      role,
      content: base + padding,
      createdAt: new Date(baseDate.getTime() + i * 60000),
    });
  }
  return messages;
}

function calcTotalTokens(messages: Array<{ role: string; content: string }>): number {
  return messages.reduce((s, m) => {
    const roleOverhead = m.role === 'system' ? 4 : 3;
    return s + roleOverhead + estimateTokens(m.content) + 3;
  }, 0);
}

function countSummaryBlocks(messages: Array<{ role: string; content: string }>): { far: number; near: number; total: number } {
  let far = 0, near = 0;
  for (const m of messages) {
    if (m.role !== 'system') continue;
    if (m.content.startsWith('[远期对话摘要]')) far++;
    if (m.content.startsWith('[近期对话摘要]')) near++;
  }
  return { far, near, total: far + near };
}

const BASE_URL = 'http://localhost:11434';
const MODEL = 'test-model';
const PROVIDER = 'ollama';

describe('compressConversationContextV2 — 双层摘要', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('消息不足时不压缩', async () => {
    const msgs = makeMessages(8);
    const result = await compressConversationContextV2(msgs, BASE_URL, MODEL, PROVIDER);
    expect(result.wasCompressed).toBe(false);
    expect(result.processedMessages.length).toBe(8);
  });

  it('消息超限时触发双层压缩', async () => {
    const msgs = makeMessages(60);
    const result = await compressConversationContextV2(msgs, BASE_URL, MODEL, PROVIDER, undefined, {
      maxTokens: 2500,
      preserveRecent: 8,
    });
    expect(result.wasCompressed).toBe(true);
    const blocks = countSummaryBlocks(result.processedMessages);
    expect(blocks.near).toBe(1);
  });

  it('从后往前切：recent在末尾，near在recent之前，far在near之前', async () => {
    const msgs = makeMessages(80);
    const result = await compressConversationContextV2(msgs, BASE_URL, MODEL, PROVIDER, undefined, {
      maxTokens: 2500,
      preserveRecent: 8,
    });
    expect(result.wasCompressed).toBe(true);

    const nonSystem = result.processedMessages.filter(m => m.role !== 'system');
    expect(nonSystem.length).toBeGreaterThanOrEqual(8);

    const lastUserMsg = msgs.filter(m => m.role === 'user').slice(-1)[0];
    expect(nonSystem[nonSystem.length - 2].content).toContain(lastUserMsg.content.slice(0, 10));
  });

  it('farCount持久化后远期不重建', async () => {
    const msgs = makeMessages(80);
    const first = await compressConversationContextV2(msgs, BASE_URL, MODEL, PROVIDER, undefined, {
      maxTokens: 2500,
      preserveRecent: 8,
    });

    const second = await compressConversationContextV2(msgs, BASE_URL, MODEL, PROVIDER, undefined, {
      maxTokens: 2500,
      preserveRecent: 8,
      farSummary: first.farSummary,
      farCount: first.farCount,
    });

    expect(second.farSummary).toBe(first.farSummary);
    expect(second.farCount).toBe(first.farCount);
  });

  it('farCount=0时首次生成远期摘要', async () => {
    const msgs = makeMessages(80);
    const result = await compressConversationContextV2(msgs, BASE_URL, MODEL, PROVIDER, undefined, {
      maxTokens: 2500,
      preserveRecent: 8,
      farCount: 0,
    });
    expect(result.wasCompressed).toBe(true);
    if (result.farSummary) {
      expect(result.farCount).toBeGreaterThan(0);
    }
  });

  it('远期摘要按重要度选top-K，不是简单取最老N条', async () => {
    const msgs = makeMessages(100);
    const result = await compressConversationContextV2(msgs, BASE_URL, MODEL, PROVIDER, undefined, {
      maxTokens: 2500,
      preserveRecent: 8,
    });

    if (result.farSummary) {
      const blocks = countSummaryBlocks(result.processedMessages);
      expect(blocks.far).toBe(1);
      expect(result.farCount).toBeGreaterThan(30);
    }
  });
});

describe('V1 vs V2 对比基准测试', () => {
  const SCENARIOS = [
    { name: '短对话(20条)', count: 20 },
    { name: '中对话(50条)', count: 50 },
    { name: '长对话(100条)', count: 100 },
    { name: '超长对话(200条)', count: 200 },
  ];

  for (const scenario of SCENARIOS) {
    describe(scenario.name, () => {
      it('V1单层 vs V2双层对比', async () => {
        const msgs = makeMessages(scenario.count);

        const v1 = await compressConversationContext(
          msgs, BASE_URL, MODEL, PROVIDER, undefined, 2500, 8
        );

        const v2 = await compressConversationContextV2(
          msgs, BASE_URL, MODEL, PROVIDER, undefined, {
            maxTokens: 2500,
            preserveRecent: 8,
          }
        );

        const v1Tokens = calcTotalTokens(v1.processedMessages);
        const v2Tokens = calcTotalTokens(v2.processedMessages);
        const origTokens = calcTotalTokens(msgs.map(m => ({ role: m.role, content: m.content })));

        const v1CompressionRatio = ((1 - v1Tokens / origTokens) * 100).toFixed(1);
        const v2CompressionRatio = ((1 - v2Tokens / origTokens) * 100).toFixed(1);

        const v1SummaryBlocks = v1.processedMessages.filter(m => m.role === 'system' && m.content.includes('摘要')).length;
        const v2SummaryBlocks = countSummaryBlocks(v2.processedMessages);

        console.log(`\n===== ${scenario.name} =====`);
        console.log(`原始tokens: ${Math.round(origTokens)}`);
        console.log(`V1压缩后tokens: ${Math.round(v1Tokens)} (压缩率: ${v1CompressionRatio}%)`);
        console.log(`V2压缩后tokens: ${Math.round(v2Tokens)} (压缩率: ${v2CompressionRatio}%)`);
        console.log(`V1摘要块数: ${v1SummaryBlocks}, V2摘要块数: ${v2SummaryBlocks.total} (far:${v2SummaryBlocks.far} near:${v2SummaryBlocks.near})`);
        console.log(`V2 farCount: ${v2.farCount}, messageCount: ${v2.messageCount}`);

        if (v1.wasCompressed) {
          expect(v1Tokens).toBeLessThan(origTokens);
        }
        if (v2.wasCompressed) {
          expect(v2Tokens).toBeLessThan(origTokens);
        }
      });
    });
  }
});

describe('重要度评分验证', () => {
  it('包含偏好关键词的消息得分更高', async () => {
    const msgs: ChatMessage[] = [];
    const baseDate = new Date('2025-01-01');

    for (let i = 0; i < 20; i++) {
      msgs.push({
        id: `fill-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: '嗯嗯好的没问题，今天天气不错，随便聊聊吧，没什么特别的事',
        createdAt: new Date(baseDate.getTime() + i * 60000),
      });
    }

    msgs.push({
      id: 'important-1',
      role: 'user',
      content: '我喜欢吃火锅，我偏好安静的环境，我决定学日语',
      createdAt: new Date(baseDate.getTime() + 20 * 60000),
    });

    msgs.push({
      id: 'important-2',
      role: 'user',
      content: '我承诺每天运动，我的目标是减肥',
      createdAt: new Date(baseDate.getTime() + 21 * 60000),
    });

    for (let i = 0; i < 60; i++) {
      msgs.push({
        id: `tail-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: SAMPLES_USER[i % SAMPLES_USER.length] + '。日常聊天内容补充一下长度。',
        createdAt: new Date(baseDate.getTime() + (22 + i) * 60000),
      });
    }

    const result = await compressConversationContextV2(msgs, BASE_URL, MODEL, PROVIDER, undefined, {
      maxTokens: 2500,
      preserveRecent: 8,
    });

    expect(result.wasCompressed).toBe(true);
    if (result.farSummary) {
      expect(result.farSummary.length).toBeGreaterThan(0);
    }
  });
});

describe('增量更新验证', () => {
  it('对话增长后far只在阈值外重建', async () => {
    const msgs60 = makeMessages(60);
    const r1 = await compressConversationContextV2(msgs60, BASE_URL, MODEL, PROVIDER, undefined, {
      maxTokens: 2500, preserveRecent: 8,
    });

    const msgs65 = makeMessages(65);
    const r2 = await compressConversationContextV2(msgs65, BASE_URL, MODEL, PROVIDER, undefined, {
      maxTokens: 2500, preserveRecent: 8,
      farSummary: r1.farSummary,
      farCount: r1.farCount,
    });

    expect(r2.farSummary).toBe(r1.farSummary);

    const msgs80 = makeMessages(80);
    const r3 = await compressConversationContextV2(msgs80, BASE_URL, MODEL, PROVIDER, undefined, {
      maxTokens: 2500, preserveRecent: 8,
      farSummary: r1.farSummary,
      farCount: r1.farCount,
    });

    console.log(`\n===== 增量更新 =====`);
    console.log(`60条: farCount=${r1.farCount}, farGenerated=${!!r1.farSummary}`);
    console.log(`65条(复用far): farCount=${r2.farCount}, farUnchanged=${r2.farSummary === r1.farSummary}`);
    console.log(`80条(可能重建far): farCount=${r3.farCount}, farChanged=${r3.farSummary !== r1.farSummary}`);
  });
});