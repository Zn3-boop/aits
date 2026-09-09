// apps/server/src/routes/personas.ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../auth.js';
import type { SkillName } from '../services/skills.js';

// ============================================================
// 工具函数
// ============================================================

const DEFAULT_SKILLS: SkillName[] = ['MemoryRetriever', 'EmotionAdapter', 'Validator', 'Decider'];

const parseSkills = (skillsJson: unknown): SkillName[] => {
  if (Array.isArray(skillsJson)) {
    return skillsJson.filter((s): s is SkillName =>
      typeof s === 'string' && DEFAULT_SKILLS.includes(s as SkillName)
    );
  }
  return DEFAULT_SKILLS;
};

// ============================================================
// Schema 验证
// ============================================================

const createPersonaSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  subtitle: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  speakingStyle: z.string().max(200).optional(),
  systemPrompt: z.string().max(5000).optional(),
  modelKey: z.string().optional(),
  modelPath: z.string().optional(),
  avatar: z.string().max(500).optional().nullable(),
  accent: z.string().optional().nullable(),
  intro: z.string().optional().nullable(),
  isSystem: z.boolean().optional(),
  extensible: z.boolean().optional(),
  skills: z.array(z.string()).optional(),
  voiceId: z.string().optional(),
  live2dModelId: z.string().optional(),
  profileJson: z.record(z.unknown()).optional(),
  styleJson: z.record(z.unknown()).optional(),
});

const updatePersonaSchema = createPersonaSchema.partial().extend({
  modelPath: z.string().optional().nullable(),
});

// ============================================================
// 路由
// ============================================================

export async function personaRoutes(fastify: FastifyInstance) {

  // GET /api/personas — 获取用户的所有角色
  fastify.get('/api/personas', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const personas = await prisma.persona.findMany({
      where: {
        OR: [{ userId }, { isSystem: true }],
      },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'desc' }],
    });
    return reply.send({ personas });
  });

  // GET /api/personas/:id — 获取单个角色详情
  fastify.get('/api/personas/:id', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    const persona = await prisma.persona.findFirst({
      where: {
        id,
        OR: [{ userId }, { isSystem: true }],
      },
      include: {
        memories: {
          orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
          take: 20,
        },
        _count: {
          select: { conversations: true, memories: true },
        },
      },
    });

    if (!persona) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '角色不存在' });
    }

    return reply.send({
      persona: {
        ...persona,
        skills: parseSkills(persona.skillsJson),
        // 不返回敏感字段
        encryptedBlob: undefined,
      },
    });
  });

  // POST /api/personas — 创建角色
  fastify.post('/api/personas', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const parsed = createPersonaSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.issues });
    }

    const data = parsed.data;

    const persona = await prisma.persona.create({
      data: {
        userId,
        name: data.name || '新角色',
        subtitle: data.subtitle || '',
        description: data.description || '',
        speakingStyle: data.speakingStyle || '',
        systemPrompt: data.systemPrompt || '',
        modelKey: data.modelKey || 'default',
        modelPath: data.modelPath || '/live2d/models/kei_basic_free/runtime/kei_basic_free.model3.json',
        avatar: data.avatar || null,
        accent: data.accent || null,
        intro: data.intro || null,
        isSystem: data.isSystem || false,
        extensible: data.extensible ?? true,
        // ========== 新增字段 ==========
        skillsJson: data.skills || DEFAULT_SKILLS,
        voiceId: data.voiceId || 'zh-CN-XiaoxiaoNeural',
        live2dModelId: data.live2dModelId || 'kei_basic_free',
        profileJson: data.profileJson ?? {
          avatar: data.avatar ?? null,
          intro: data.intro ?? null,
        },
        styleJson: data.styleJson ?? {
          accent: data.accent ?? null,
        },
      },
    });

    return reply.status(201).send({
      persona: {
        ...persona,
        skills: parseSkills(persona.skillsJson),
        encryptedBlob: undefined,
      },
    });
  });

  // PUT /api/personas/:id — 更新角色
  fastify.put('/api/personas/:id', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    const parsed = updatePersonaSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parsed.error.issues });
    }

    const data = parsed.data;

    // 检查权限
    const existing = await prisma.persona.findFirst({
      where: { id, OR: [{ userId }, { isSystem: true }] },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '角色不存在' });
    }

    // 所有登录用户都可修改角色

    const updateData: Record<string, unknown> = {};

    // 只更新提供的字段
    if (data.name !== undefined) updateData.name = data.name;
    if (data.subtitle !== undefined) updateData.subtitle = data.subtitle;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.speakingStyle !== undefined) updateData.speakingStyle = data.speakingStyle;
    if (data.systemPrompt !== undefined) updateData.systemPrompt = data.systemPrompt;
    if (data.modelKey !== undefined) updateData.modelKey = data.modelKey;
    if (data.modelPath !== undefined) updateData.modelPath = data.modelPath ?? '';
    if (data.avatar !== undefined) updateData.avatar = data.avatar;
    if (data.accent !== undefined) updateData.accent = data.accent;
    if (data.intro !== undefined) updateData.intro = data.intro;
    if (data.extensible !== undefined) updateData.extensible = data.extensible;

    if (data.skills !== undefined) updateData.skillsJson = data.skills;
    if (data.voiceId !== undefined) updateData.voiceId = data.voiceId;
    if (data.live2dModelId !== undefined) updateData.live2dModelId = data.live2dModelId;
    if (data.profileJson !== undefined) updateData.profileJson = data.profileJson;
    if (data.styleJson !== undefined) updateData.styleJson = data.styleJson;

    const updated = await prisma.persona.update({
      where: { id },
      data: updateData,
    });

    return reply.send({
      persona: {
        ...updated,
        skills: parseSkills(updated.skillsJson),
        encryptedBlob: undefined,
      },
    });
  });

  // DELETE /api/personas/:id — 删除角色
  fastify.delete('/api/personas/:id', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    const persona = await prisma.persona.findFirst({
      where: { id, OR: [{ userId }, { isSystem: true }] },
    });

    if (!persona) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '角色不存在' });
    }

    if (persona.isSystem) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: '系统预设角色无法删除' });
    }

    const [conversationCount, memoryCount] = await Promise.all([
      prisma.personaConversation.count({ where: { personaId: id, userId } }),
      prisma.personaMemory.count({ where: { personaId: id } }),
    ]);

    if (conversationCount > 0 || memoryCount > 0) {
      return reply.status(409).send({
        error: 'PERSONA_IN_USE',
        message: `该人设有 ${conversationCount} 条对话和 ${memoryCount} 条记忆，删除后将永久清空。确认要继续吗？`,
        conversationCount,
        memoryCount,
      });
    }

    await prisma.persona.delete({ where: { id } });

    return reply.send({ success: true });
  });

  // GET /api/personas/:id/memories — 获取角色的记忆列表
  fastify.get('/api/personas/:id/memories', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    const { keyword, limit = '20', offset = '0' } = request.query as {
      keyword?: string;
      limit?: string;
      offset?: string;
    };

    const persona = await prisma.persona.findFirst({
      where: { id, OR: [{ userId }, { isSystem: true }] },
    });

    if (!persona) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '角色不存在' });
    }

    const where: Record<string, unknown> = { personaId: id };
    if (keyword) {
      where.content = { contains: keyword };
    }

    const [memories, total] = await Promise.all([
      prisma.personaMemory.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      prisma.personaMemory.count({ where }),
    ]);

    return reply.send({
      memories,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + memories.length < total,
      },
    });
  });

  // GET /api/personas/:id/affection — 获取好感度
  fastify.get('/api/personas/:id/affection', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    const affection = await prisma.personaAffection.findUnique({
      where: { personaId_userId: { personaId: id, userId } },
    });

    if (!affection) {
      return reply.send({
        affection: {
          level: 0,
          score: 0,
          unlocked: false,
        },
      });
    }

    return reply.send({
      affection: {
        level: affection.level,
        score: affection.score,
        unlocked: affection.level > 0,
        updatedAt: affection.updatedAt,
      },
    });
  });

  // GET /api/personas/:id/stats — 获取角色统计数据
  fastify.get('/api/personas/:id/stats', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    const [persona, conversationCount, memoryCount, affection] = await Promise.all([
      prisma.persona.findFirst({
        where: { id, OR: [{ userId }, { isSystem: true }] },
      }),
      prisma.personaConversation.count({
        where: { personaId: id, userId },
      }),
      prisma.personaMemory.count({
        where: { personaId: id },
      }),
      prisma.personaAffection.findUnique({
        where: { personaId_userId: { personaId: id, userId } },
      }),
    ]);

    if (!persona) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '角色不存在' });
    }

    return reply.send({
      stats: {
        conversationCount,
        memoryCount,
        affectionLevel: affection?.level || 0,
        affectionScore: affection?.score || 0,
        createdAt: persona.createdAt,
        updatedAt: persona.updatedAt,
      },
    });
  });

}