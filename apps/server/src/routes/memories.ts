import type { FastifyInstance } from 'fastify'
import { createHash } from 'node:crypto'
import { prisma } from '../db.js'
import { requireAuth } from '../auth.js'

const computeFingerprint = (content: string): string =>
  createHash('sha256').update(content).digest('hex')

export async function memoryRoutes(app: FastifyInstance) {

  // GET /api/memories/all — 获取当前用户所有角色记忆（MemoryPage 使用）
  app.get('/api/memories/all', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId
    const { keyword, limit = '50', offset = '0' } = request.query as {
      keyword?: string;
      limit?: string;
      offset?: string;
    };

    const where: Record<string, unknown> = { userId };
    if (keyword) {
      where.content = { contains: keyword };
    }

    const [memories, total] = await Promise.all([
      prisma.personaMemory.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
        include: { persona: { select: { id: true, name: true } } },
      }),
      prisma.personaMemory.count({ where }),
    ]);

    return reply.send({
      memories: memories.map(m => ({
        id: m.id,
        content: m.content,
        priority: m.priority,
        memoryType: (m.tags as Record<string, string>)?.type || 'memory',
        tags: m.tags,
        personaId: m.personaId,
        personaName: m.persona.name,
        createdAt: m.createdAt.toISOString(),
      })),
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + memories.length < total,
      },
    });
  });

  // GET /api/memories — 获取当前用户的全局记忆列表（MemoryPage 需要）
  app.get('/api/memories', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId
    const { keyword, limit = '20', offset = '0', type } = request.query as {
      keyword?: string;
      limit?: string;
      offset?: string;
      type?: string;
    };

    const where: Record<string, unknown> = { userId, deletedAt: null };
    if (keyword) {
      where.content = { contains: keyword };
    }
    if (type && type !== 'all') {
      where.memoryType = type;
    }

    const [memories, total] = await Promise.all([
      prisma.memory.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
      }),
      prisma.memory.count({ where }),
    ]);

    return reply.send({
      memories: memories.map(m => ({
        id: m.id,
        content: typeof m.contentJson === 'string' ? m.contentJson : JSON.stringify(m.contentJson),
        priority: m.priority,
        memoryType: m.memoryType,
        tags: m.tags || [],
        createdAt: m.createdAt.toISOString(),
      })),
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + memories.length < total,
      },
    });
  });

  // 前端兼容路由：ChatPage.tsx 调用的是 /api/persona-memories/:personaId
  app.get('/api/persona-memories/:personaId', { preHandler: requireAuth }, async (request, _reply) => {
    const { personaId } = request.params as { personaId: string }
    const userId = request.user!.userId

    const records = await prisma.personaMemory.findMany({
      where: { personaId, userId },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }]
    })

    return { memories: records }
  })

  // ========== 修复：使用 /memories 前缀，避免与 personaRoutes 冲突 ==========
  // GET /api/memories/personas/:personaId — 获取角色的记忆列表
  app.get('/api/memories/personas/:personaId', { preHandler: requireAuth }, async (request, reply) => {
    const { personaId } = request.params as { personaId: string }
    const userId = request.user!.userId
    const { keyword, limit = '20', offset = '0' } = request.query as {
      keyword?: string;
      limit?: string;
      offset?: string;
    };

    const persona = await prisma.persona.findFirst({
      where: { id: personaId, OR: [{ userId }, { isSystem: true }] },
    });

    if (!persona) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '角色不存在' });
    }

    const where: Record<string, unknown> = { personaId, userId };
    if (keyword) {
      where.content = { contains: keyword };
    }

    const [memories, total] = await Promise.all([
      prisma.personaMemory.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
      }),
      prisma.personaMemory.count({ where }),
    ]);

    return reply.send({
      memories,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + memories.length < total,
      },
    });
  })

  // POST /api/memories/personas/:personaId — 创建记忆
  app.post('/api/memories/personas/:personaId', { preHandler: requireAuth }, async (request, reply) => {
    const { personaId } = request.params as { personaId: string }
    const userId = request.user!.userId
    const body = request.body as { content?: string; tags?: string[]; priority?: number }

    if (!body?.content?.trim()) {
      return reply.status(400).send({ error: 'BAD_REQUEST', message: 'content is required' })
    }

    const persona = await prisma.persona.findFirst({
      where: { id: personaId, OR: [{ userId }, { isSystem: true }] },
    });

    if (!persona) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: '角色不存在' });
    }

    const record = await prisma.personaMemory.create({
      data: {
        personaId,
        userId,
        content: body.content.trim(),
        fingerprint: computeFingerprint(body.content.trim()),
        tags: body.tags || [],
        priority: body.priority ?? 0,
      }
    })

    return reply.status(201).send({ data: record })
  })

  // PUT /api/memories/personas/:personaId/:memoryId — 更新记忆
  app.put('/api/memories/personas/:personaId/:memoryId', { preHandler: requireAuth }, async (request, reply) => {
    const { memoryId } = request.params as { memoryId: string }
    const userId = request.user!.userId
    const body = request.body as Partial<{ content: string; tags: string[]; priority: number }>

    const existing = await prisma.personaMemory.findFirst({ where: { id: memoryId, userId } })
    if (!existing) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Memory not found' })

    const newContent = body.content ?? existing.content
    const updated = await prisma.personaMemory.update({
      where: { id: memoryId },
      data: {
        content: newContent,
        fingerprint: computeFingerprint(newContent),
        tags: (body.tags ?? existing.tags) as string[],
        priority: body.priority ?? existing.priority,
      }
    })

    return { data: updated }
  })

  // DELETE /api/memories/personas/:personaId/:memoryId — 删除记忆
  app.delete('/api/memories/personas/:personaId/:memoryId', { preHandler: requireAuth }, async (request, reply) => {
    const { memoryId } = request.params as { memoryId: string }
    const userId = request.user!.userId

    const existing = await prisma.personaMemory.findFirst({ where: { id: memoryId, userId } })
    if (!existing) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Memory not found' })

    await prisma.personaMemory.delete({ where: { id: memoryId } })
    return { success: true }
  })
}