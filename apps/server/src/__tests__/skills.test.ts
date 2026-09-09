import { describe, it, expect } from 'vitest';
import {
  EmotionAdapter,
  Validator,
  Decider,
  type SkillContext,
} from '../services/skills.js';

const baseContext: SkillContext = {
  userId: 'test-user',
  personaId: 'test-persona',
  message: '你好呀',
};

describe('EmotionAdapter', () => {
  it('adapts neutral emotion', () => {
    const result = EmotionAdapter.adapt('neutral');
    expect(result.toneAdjustment).toBe('平稳温和');
    expect(result.speechPrompt).toContain('语气平稳');
  });

  it('adapts happy emotion', () => {
    const result = EmotionAdapter.adapt('happy');
    expect(result.toneAdjustment).toBe('愉悦轻快');
    expect(result.speechPrompt).toContain('轻快活泼');
  });

  it('adapts sad emotion with soft tone', () => {
    const result = EmotionAdapter.adapt('sad');
    expect(result.toneAdjustment).toBe('温柔安慰');
    expect(result.speechPrompt).toContain('温柔缓慢');
  });

  it('formats emotion prompt for undefined', () => {
    const result = EmotionAdapter.formatEmotionPrompt(undefined);
    expect(result).toBe('');
  });

  it('formats emotion prompt for angry', () => {
    const result = EmotionAdapter.formatEmotionPrompt('angry');
    expect(result).toContain('情绪适配');
    expect(result).toContain('柔和');
  });
});

describe('Validator', () => {
  it('validates clean message', () => {
    const result = Validator.validateUserMessage('你好，今天天气真好');
    expect(result.isValid).toBe(true);
  });

  it('rejects message with sensitive keyword', () => {
    const result = Validator.validateUserMessage('你是傻逼');
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('不适合讨论的内容');
  });

  it('allows boundary topic but marks it', () => {
    const result = Validator.validateUserMessage('我想聊聊政治');
    expect(result.isValid).toBe(true);
  });

  it('detects AI self-exposure in reply', () => {
    const result = Validator.validateAIResponse('我是AI助手，很高兴为您服务', '你是一个角色');
    expect(result.issues).toContain('回复中可能暴露AI身份');
  });

  it('detects persona deviation', () => {
    const result = Validator.validateAIResponse('作为一个语言模型，我无法回答', '你是雾岛响');
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('flags overly long reply', () => {
    const longReply = '这是一段很长的回复'.repeat(60);
    const result = Validator.validateAIResponse(longReply, '你是角色');
    expect(result.issues).toContain('回复过长，建议简洁');
  });

  it('sanitizes sensitive words in AI reply', () => {
    const result = Validator.validateAIResponse('你这个傻逼', '你是角色');
    expect(result.sanitized).toContain('***');
  });

  it('formatValidationPrompt contains key rules', () => {
    const prompt = Validator.formatValidationPrompt();
    expect(prompt).toContain('不暴露AI身份');
    expect(prompt).toContain('保持角色人设');
  });
});

describe('Decider', () => {
  it('decides conclude when user says goodbye', () => {
    const result = Decider.decide(
      { ...baseContext, message: '再见啦' },
      5
    );
    expect(result.strategy).toBe('conclude');
  });

  it('decides conclude when user says goodnight', () => {
    const result = Decider.decide(
      { ...baseContext, message: '晚安' },
      5
    );
    expect(result.strategy).toBe('conclude');
  });

  it('decides redirect when user is uncomfortable', () => {
    const result = Decider.decide(
      { ...baseContext, message: '不想说了，别问了' },
      5
    );
    expect(result.strategy).toBe('redirect');
  });

  it('decides deepen when user asks why', () => {
    const result = Decider.decide(
      { ...baseContext, message: '为什么会这样呢' },
      5
    );
    expect(result.strategy).toBe('deepen');
  });

  it('decides continue for normal message', () => {
    const result = Decider.decide(
      { ...baseContext, message: '今天吃了什么' },
      5
    );
    expect(result.strategy).toBe('continue');
  });

  it('does not deepen in early conversation', () => {
    const result = Decider.decide(
      { ...baseContext, message: '为什么会这样呢' },
      2
    );
    expect(result.strategy).toBe('continue');
  });

  it('formatDecisionPrompt returns non-empty string', () => {
    const prompt = Decider.formatDecisionPrompt(baseContext, 5);
    expect(prompt).toContain('对话策略');
  });
});