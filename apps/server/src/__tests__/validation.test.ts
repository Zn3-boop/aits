import { describe, it, expect } from 'vitest';
import { z } from 'zod';

describe('Zod Schema Validation', () => {
  const CreatePersonaSchema = z.object({
    name: z.string().min(1, '名称不能为空').max(50, '名称太长'),
    subtitle: z.string().max(100).optional(),
    description: z.string().min(1, '描述不能为空').max(500),
    systemPrompt: z.string().min(1, '系统提示不能为空'),
    modelKey: z.string().min(1, '模型不能为空'),
    accent: z.string().optional(),
  });

  it('应该通过有效的 persona 数据', () => {
    const validData = {
      name: '小雪',
      subtitle: '温柔的AI助手',
      description: '一个温柔体贴的AI角色',
      systemPrompt: '你是一个温柔体贴的AI助手',
      modelKey: 'llama3',
    };
    const result = CreatePersonaSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('应该拒绝空名称', () => {
    const invalidData = {
      name: '',
      description: '描述',
      systemPrompt: '提示',
      modelKey: 'llama3',
    };
    const result = CreatePersonaSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('名称不能为空');
    }
  });

  it('应该拒绝缺少必填字段', () => {
    const invalidData = {
      name: '测试',
      description: '描述',
    };
    const result = CreatePersonaSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('应该接受可选字段缺失', () => {
    const minimalData = {
      name: '测试',
      description: '描述',
      systemPrompt: '提示',
      modelKey: 'llama3',
    };
    const result = CreatePersonaSchema.safeParse(minimalData);
    expect(result.success).toBe(true);
  });
});

describe('Input Validation', () => {
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  it('应该接受有效邮箱', () => {
    expect(validateEmail('test@example.com')).toBe(true);
  });

  it('应该拒绝无效邮箱', () => {
    expect(validateEmail('invalid-email')).toBe(false);
  });
});
