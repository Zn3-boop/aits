/**
 * Skills System - 角色内置技能系统
 * 
 * 四个核心 Skill：
 * 1. MemoryRetriever - 记忆检索者
 * 2. EmotionAdapter - 情绪适配者
 * 3. Validator - 内容校验者
 * 4. Decider - 对话决策者
 */

import { prisma } from '../db.js';

import type { UserEmotion, AIEmotion } from '../types/emotion.js';

export type { UserEmotion, AIEmotion };

export type SkillName = 'MemoryRetriever' | 'EmotionAdapter' | 'Validator' | 'Decider';

export interface SkillContext {
  userId: string;
  personaId: string;
  message: string;
  userEmotion?: string;
  aiEmotion?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
}

export interface SkillResult {
  skill: SkillName;
  success: boolean;
  output: unknown;
  error?: string;
}

export class MemoryRetriever {
  /**
   * 检索与当前对话相关的记忆
   */
  static async retrieve(context: SkillContext): Promise<{
    personaMemories: Array<{ content: string; priority: number; tags: unknown }>;
    globalMemories: Array<{ content: string; priority: number }>;
    relevantFacts: string[];
  }> {
    const { userId, personaId, message } = context;

    // 提取关键词用于记忆检索
    const keywords = this.extractKeywords(message);

    // 检索角色专属记忆
    const personaMemories = await prisma.personaMemory.findMany({
      where: {
        personaId,
        userId,
        OR: keywords.length > 0
          ? keywords.map(kw => ({ content: { contains: kw } }))
          : [{ content: { not: '' } }]
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 5,
      select: { content: true, priority: true, tags: true }
    });

    // 检索全局记忆 - 简化查询，直接获取最近的记忆
    const globalMemories = await prisma.memory.findMany({
      where: {
        userId,
        memoryType: 'memory',
        deletedAt: null,
      },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 3,
      select: { contentJson: true, priority: true }
    });

    // 格式化记忆为可读文本
    const relevantFacts = [
      ...personaMemories.map(m => m.content),
      ...globalMemories.map(m => {
        const json = m.contentJson as Record<string, unknown>;
        return typeof json === 'object' && json !== null
          ? (json.content as string) || JSON.stringify(json)
          : String(json);
      })
    ];

    return {
      personaMemories: personaMemories.map(m => ({
        content: m.content,
        priority: m.priority,
        tags: m.tags
      })),
      globalMemories: globalMemories.map(m => {
        const json = m.contentJson as Record<string, unknown>;
        return {
          content: typeof json === 'object' && json !== null
            ? (json.content as string) || JSON.stringify(json)
            : String(json),
          priority: m.priority
        };
      }),
      relevantFacts
    };
  }

  /**
   * 从消息中提取关键词
   */
  private static extractKeywords(message: string): string[] {
    // 简单关键词提取：人名、爱好、情绪词等
    const patterns = [
      /[爱好坏讨厌想要希望]/g,
      /[学业工作生活]/g,
      /(我叫|我叫|我在|我住)/g,
      /[生日年龄]/g
    ];

    const keywords: string[] = [];
    for (const pattern of patterns) {
      const matches = message.match(pattern);
      if (matches) {
        keywords.push(...matches);
      }
    }

    // 去重并限制数量
    return [...new Set(keywords)].slice(0, 5);
  }

  /**
   * 将记忆格式化为提示词片段
   */
  static formatMemoryPrompt(context: SkillContext): Promise<string> {
    return this.retrieve(context).then(result => {
      if (result.relevantFacts.length === 0) {
        return '';
      }

      return `\n【相关记忆】\n${result.relevantFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
    });
  }
}

// ============================================================
// Skill 2: EmotionAdapter - 情绪适配者
// ============================================================

export class EmotionAdapter {
  // 情绪对应的语气调整
  private static emotionToneMap: Record<UserEmotion, { speed: 'slow' | 'normal' | 'fast'; volume: 'soft' | 'normal' | 'loud'; tone: string }> = {
    neutral: { speed: 'normal', volume: 'normal', tone: '平稳温和' },
    happy: { speed: 'normal', volume: 'normal', tone: '愉悦轻快' },
    sad: { speed: 'slow', volume: 'soft', tone: '温柔安慰' },
    angry: { speed: 'slow', volume: 'soft', tone: '柔和安抚' },
    surprised: { speed: 'normal', volume: 'normal', tone: '好奇关注' },
    fearful: { speed: 'slow', volume: 'soft', tone: '稳定安心' },
    disgusted: { speed: 'normal', volume: 'normal', tone: '理解共情' },
    tired: { speed: 'slow', volume: 'soft', tone: '轻声细语' }
  };

  /**
   * 根据用户情绪获取语气调整指令
   */
  static adapt(userEmotion: UserEmotion): {
    speechPrompt: string;
    toneAdjustment: string;
  } {
    const config = this.emotionToneMap[userEmotion] || this.emotionToneMap.neutral;

    const speechPrompt = this.generateSpeechPrompt(userEmotion, config);

    return {
      speechPrompt,
      toneAdjustment: config.tone
    };
  }

  /**
   * 生成语音提示词
   */
  private static generateSpeechPrompt(
    emotion: UserEmotion,
    config: { speed: string; volume: string; tone: string }
  ): string {
    const prompts: Record<UserEmotion, string> = {
      neutral: '语气平稳，语速适中。',
      happy: '语气轻快活泼，可以适当表现出开心。',
      sad: '语气温柔缓慢，多用安慰性词汇，如"别难过"、"我在这里"。',
      angry: '语气柔和缓慢，避免刺激，表达理解和接纳。',
      surprised: '语气带有好奇和关注，表示理解对方的惊讶。',
      fearful: '语气稳定平和，给予安全感，避免吓唬对方。',
      disgusted: '语气带有共情，表达理解对方的感受。',
      tired: '语气轻柔缓慢，表达关心，建议休息但不强求。'
    };

    return `\n【语气调整】${prompts[emotion] || prompts.neutral}\n【语速】${config.speed === 'slow' ? '稍慢' : config.speed === 'fast' ? '稍快' : '适中'}，【音量】${config.volume === 'soft' ? '轻柔' : config.volume === 'loud' ? '适度提高' : '正常'}。`;
  }

  /**
   * 将情绪适配指令格式化为提示词
   */
  static formatEmotionPrompt(userEmotion: UserEmotion | undefined): string {
    if (!userEmotion) return '';
    
    const { speechPrompt } = this.adapt(userEmotion);
    return `\n【情绪适配】${speechPrompt}`;
  }

  private static aiEmotionToneMap: Record<AIEmotion, { speed: 'slow' | 'normal' | 'fast'; volume: 'soft' | 'normal' | 'loud'; tone: string }> = {
    warm:      { speed: 'slow', volume: 'soft', tone: '温柔安慰' },
    shy:       { speed: 'slow', volume: 'soft', tone: '害羞轻声' },
    tsundere:  { speed: 'normal', volume: 'normal', tone: '傲娇关心' },
    sad:       { speed: 'slow', volume: 'soft', tone: '低落克制' },
    happy:     { speed: 'normal', volume: 'normal', tone: '愉悦轻快' },
    neutral:   { speed: 'normal', volume: 'normal', tone: '平稳温和' },
    concerned: { speed: 'slow', volume: 'soft', tone: '担心安抚' },
    sleepy:    { speed: 'slow', volume: 'soft', tone: '困倦慵懒' },
  };

  // [P1-5] AIEmotion → TTS 语音参数映射：speechRate(语速倍率) / pitchShift(音高偏移半音) / volumeBoost(音量增益)
  private static aiEmotionTtsMap: Record<AIEmotion, { speechRate: number; pitchShift: number; volumeBoost: number }> = {
    warm:      { speechRate: 0.9,  pitchShift: 2,  volumeBoost: 0.05 },
    shy:       { speechRate: 0.85, pitchShift: 3,  volumeBoost: -0.1 },
    tsundere:  { speechRate: 1.0,  pitchShift: 0,  volumeBoost: 0.1 },
    sad:       { speechRate: 0.9,  pitchShift: -2, volumeBoost: -0.1 },
    happy:     { speechRate: 1.05, pitchShift: 1,  volumeBoost: 0.1 },
    neutral:   { speechRate: 1.0,  pitchShift: 0,  volumeBoost: 0 },
    concerned: { speechRate: 0.9,  pitchShift: -1, volumeBoost: -0.05 },
    sleepy:    { speechRate: 0.8,  pitchShift: -1, volumeBoost: -0.15 },
  };

  static adaptAIEmotion(aiEmotion: AIEmotion): {
    speechPrompt: string;
    toneAdjustment: string;
    ttsParams: { speechRate: number; pitchShift: number; volumeBoost: number };
  } {
    const config = this.aiEmotionToneMap[aiEmotion] || this.aiEmotionToneMap.neutral;
    const ttsParams = this.aiEmotionTtsMap[aiEmotion] || this.aiEmotionTtsMap.neutral;
    const speedLabel = config.speed === 'slow' ? '稍慢' : config.speed === 'fast' ? '稍快' : '适中';
    const volumeLabel = config.volume === 'soft' ? '轻柔' : config.volume === 'loud' ? '适度提高' : '正常';
    return {
      speechPrompt: `\n【语气调整】角色当前情绪为${aiEmotion}，语气${config.tone}。\n【语速】${speedLabel}，【音量】${volumeLabel}。`,
      toneAdjustment: config.tone,
      ttsParams,
    };
  }

  static formatAIEmotionPrompt(aiEmotion: AIEmotion): string {
    const { speechPrompt } = this.adaptAIEmotion(aiEmotion);
    return `\n【情绪适配】${speechPrompt}`;
  }
}

// ============================================================
// Skill 3: Validator - 内容校验者
// ============================================================

export class Validator {
  // 敏感词列表
  private static sensitiveKeywords = [
    '傻逼', '滚', '废物', '垃圾', '去死',
    '未成年色情', '儿童色情',
    '制作炸弹', '制作毒品', '买卖毒品', '买卖枪支'
  ];

  // 越界话题关键词（需要特殊处理）
  private static boundaryKeywords = [
    '政治', '宗教', '自杀', '自残'
  ];

  /**
   * 校验用户消息
   */
  static validateUserMessage(message: string): {
    isValid: boolean;
    reason?: string;
    sanitized?: string;
  } {
    // 检查敏感词
    for (const keyword of this.sensitiveKeywords) {
      if (message.includes(keyword)) {
        return {
          isValid: false,
          reason: `消息包含不适合讨论的内容：${keyword}`
        };
      }
    }

    // 检查边界话题
    for (const keyword of this.boundaryKeywords) {
      if (message.includes(keyword)) {
        return {
          isValid: true,
          sanitized: message // 允许但需要AI注意
        };
      }
    }

    return { isValid: true, sanitized: message };
  }

  /**
   * 校验 AI 回复
   */
  static validateAIResponse(reply: string, systemPrompt: string): {
    isValid: boolean;
    issues: string[];
    sanitized?: string;
  } {
    const issues: string[] = [];

    // 检查是否偏离人设
    if (this.isDeviatedFromPersona(reply, systemPrompt)) {
      issues.push('回复可能偏离角色人设');
    }

    // 检查是否自曝AI身份
    if (this.isSelfExposingAI(reply)) {
      issues.push('回复中可能暴露AI身份');
    }

    // 检查回复长度
    if (reply.length > 500) {
      issues.push('回复过长，建议简洁');
    }

    // 过滤敏感词
    let sanitized = reply;
    for (const keyword of this.sensitiveKeywords) {
      if (sanitized.includes(keyword)) {
        sanitized = sanitized.replace(keyword, '***');
        issues.push(`已过滤敏感词：${keyword}`);
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      sanitized
    };
  }

  /**
   * 检查回复是否偏离人设
   */
  private static isDeviatedFromPersona(reply: string, _systemPrompt: string): boolean {
    // 简单的偏离检测：如果回复中提到自己是AI、助手等
    const aiIndicators = ['我是AI', '我是助手', '作为一个语言模型', '我的训练数据'];
    return aiIndicators.some(indicator => reply.includes(indicator));
  }

  /**
   * 检查是否自曝AI身份
   */
  private static isSelfExposingAI(reply: string): boolean {
    const patterns = [
      /我是(一个)?(AI|人工智能|语言模型|助手)/i,
      /作为(一个)?(AI|人工智能|语言模型|助手)/i,
      /我的(训练|数据|模型)(来自|基于)/i
    ];

    return patterns.some(pattern => pattern.test(reply));
  }

  /**
   * 生成校验提示词
   */
  static formatValidationPrompt(): string {
    return `\n【内容校验】请确保回复符合以下要求：
1. 不暴露AI身份，不使用"我是AI"、"作为语言模型"等表述
2. 保持角色人设一致性
3. 避免敏感话题，保持对话安全
4. 回复简洁有力，不过度解释`;
  }
}

// ============================================================
// Skill 4: Decider - 对话决策者
// ============================================================

export class Decider {
  // 对话策略
  static decide(
    context: SkillContext,
    conversationLength: number
  ): {
    strategy: 'continue' | 'deepen' | 'conclude' | 'redirect';
    reason: string;
    suggestions?: string[];
  } {
    const { message } = context;

    // 检查是否要结束对话
    if (this.shouldConclude(message)) {
      return {
        strategy: 'conclude',
        reason: '用户似乎想结束对话',
        suggestions: ['做个温暖的收尾', '简单道别', '表达期待下次见面']
      };
    }

    // 检查是否需要深入
    if (this.shouldDeepen(message, conversationLength)) {
      return {
        strategy: 'deepen',
        reason: '话题有深入空间',
        suggestions: ['追问细节', '表达共情', '分享相关经历']
      };
    }

    // 检查是否需要转移话题
    if (this.shouldRedirect(message)) {
      return {
        strategy: 'redirect',
        reason: '当前话题可能让用户不适',
        suggestions: ['温和转移话题', '表达理解后换话题', '用轻松话题缓和气氛']
      };
    }

    // 默认继续对话
    return {
      strategy: 'continue',
      reason: '继续自然对话'
    };
  }

  /**
   * 判断是否应该结束对话
   */
  private static shouldConclude(message: string): boolean {
    const patterns = [
      /再见|拜拜|走了|先走了/i,
      /下次再聊|改天再聊/i,
      /我先去|先去/i,
      /困了|睡觉|晚安/i
    ];

    return patterns.some(p => p.test(message));
  }

  /**
   * 判断是否应该深入话题
   */
  private static shouldDeepen(message: string, conversationLength: number): boolean {
    // 对话刚开始，鼓励多说
    if (conversationLength < 3) return false;

    const deepPatterns = [
      /为什么|怎么|如何/,
      /觉得|感觉|认为/,
      /因为|所以|其实/
    ];

    const hasDeepIndicator = deepPatterns.some(p => p.test(message));
    return hasDeepIndicator && conversationLength < 20;
  }

  /**
   * 判断是否需要转移话题
   */
  private static shouldRedirect(message: string): boolean {
    const uncomfortablePatterns = [
      /不想说|算了|别问了/i,
      /尴尬|无聊/i,
      /转移话题/i
    ];

    return uncomfortablePatterns.some(p => p.test(message));
  }

  /**
   * 格式化决策提示词
   */
  static formatDecisionPrompt(context: SkillContext, conversationLength: number): string {
    const { strategy, reason, suggestions } = this.decide(context, conversationLength);

    let prompt = `\n【对话策略】${reason}`;
    
    if (strategy === 'conclude') {
      prompt += '\n建议：做一个温暖的收尾，表达期待下次见面。';
    } else if (strategy === 'deepen') {
      prompt += `\n建议：${suggestions?.join('、') || '可以追问细节或表达共情'}`;
    } else if (strategy === 'redirect') {
      prompt += `\n建议：${suggestions?.join('、') || '温和地转移话题'}`;
    }

    return prompt;
  }
}

// ============================================================
// Skills 系统主入口
// ============================================================

export class SkillsSystem {
  /**
   * 执行所有启用的技能
   */
  static async execute(
    enabledSkills: SkillName[],
    context: SkillContext,
    conversationLength: number
  ): Promise<Map<SkillName, SkillResult>> {
    const results = new Map<SkillName, SkillResult>();

    for (const skillName of enabledSkills) {
      try {
        let result: SkillResult;

        switch (skillName) {
          case 'MemoryRetriever': {
            const memories = await MemoryRetriever.retrieve(context);
            result = { skill: 'MemoryRetriever', success: true, output: memories };
            break;
          }

          case 'EmotionAdapter': {
            const emotionOutput = context.aiEmotion
              ? EmotionAdapter.adaptAIEmotion(context.aiEmotion as AIEmotion)
              : EmotionAdapter.adapt((context.userEmotion as UserEmotion) || 'neutral');
            result = { skill: 'EmotionAdapter', success: true, output: emotionOutput };
            break;
          }

          case 'Validator': {
            const validation = Validator.validateUserMessage(context.message);
            result = { skill: 'Validator', success: true, output: validation };
            break;
          }

          case 'Decider': {
            const decision = Decider.decide(context, conversationLength);
            result = { skill: 'Decider', success: true, output: decision };
            break;
          }

          default:
            result = { skill: skillName, success: false, output: null, error: 'Unknown skill' };
        }

        results.set(skillName, result);
      } catch (error) {
        results.set(skillName, {
          skill: skillName,
          success: false,
          output: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  /**
   * 生成完整的系统提示词（包含所有启用的技能指令）
   */
  static async buildSystemPrompt(
    enabledSkills: SkillName[],
    context: SkillContext,
    conversationLength: number,
    basePrompt: string
  ): Promise<string> {
    const skillInstructions: string[] = [];
    const memoryFacts = await MemoryRetriever.formatMemoryPrompt(context);

    // MemoryRetriever: 添加记忆上下文
    if (enabledSkills.includes('MemoryRetriever') && memoryFacts) {
      skillInstructions.push(memoryFacts);
    }

    // EmotionAdapter: 添加情绪适配
    if (enabledSkills.includes('EmotionAdapter')) {
      if (context.aiEmotion) {
        skillInstructions.push(EmotionAdapter.formatAIEmotionPrompt(context.aiEmotion as AIEmotion));
      } else {
        skillInstructions.push(EmotionAdapter.formatEmotionPrompt(context.userEmotion as UserEmotion));
      }
    }

    // Validator: 添加内容校验规则
    if (enabledSkills.includes('Validator')) {
      skillInstructions.push(Validator.formatValidationPrompt());
    }

    // Decider: 添加对话策略
    if (enabledSkills.includes('Decider')) {
      skillInstructions.push(Decider.formatDecisionPrompt(context, conversationLength));
    }

    return basePrompt + skillInstructions.join('\n');
  }
}

// 导出默认配置
export const DEFAULT_SKILLS: SkillName[] = [
  'MemoryRetriever',
  'EmotionAdapter',
  'Validator',
  'Decider'
];