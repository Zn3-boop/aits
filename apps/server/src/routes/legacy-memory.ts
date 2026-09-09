import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { requireAuth } from '../auth.js';

export async function legacyMemoryRoutes(fastify: FastifyInstance) {

  fastify.get('/api/memory/:scope', { preHandler: requireAuth }, async (request, reply) => {
    const params = request.params as { scope: string };
    if (params.scope !== 'memory') {
      return reply.status(410).send({ error: 'DEPRECATED_SCOPE', message: '已迁移到 Prisma 表' });
    }
    const userId = request.user!.userId;
    const query = (request.query as { query?: string }).query?.trim().toLowerCase();
    const records = await prisma.memory.findMany({
      where: { userId, memoryType: 'memory', deletedAt: null },
      orderBy: { updatedAt: 'desc' }
    });
    const mapped = records.map(item => ({
      id: item.id,
      userId: item.userId,
      scope: 'memory',
      payload: item.contentJson,
      tags: item.tags,
      priority: item.priority,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      deletedAt: item.deletedAt?.toISOString() ?? null
    })).filter(item => {
      if (!query) return true;
      return JSON.stringify(item.payload).toLowerCase().includes(query);
    });
    return reply.send({ records: mapped });
  });

  fastify.post('/api/memory/:scope', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.userId;
    const body = request.body as { id?: string; payload?: Record<string, unknown> };
    if (!body?.id || !body?.payload) {
      return reply.status(400).send({ error: 'BAD_REQUEST', message: 'Invalid payload' });
    }
    const memory = await prisma.memory.create({
      data: { id: body.id, userId, memoryType: 'memory', contentJson: body.payload as Prisma.InputJsonValue, tags: [], priority: 0 }
    });
    return reply.send({ record: { id: memory.id, scope: 'memory', payload: memory.contentJson } });
  });

  fastify.put('/api/memory/:scope/:id', { preHandler: requireAuth }, async (request, reply) => {
    const params = request.params as { scope: string; id: string };
    const body = request.body as { payload?: Record<string, unknown>; deletedAt?: string | null };
    const userId = request.user!.userId;
    const existing = await prisma.memory.findFirst({ where: { id: params.id, userId, memoryType: 'memory' } });
    if (!existing) return reply.status(404).send({ error: 'NOT_FOUND' });
    const memory = await prisma.memory.update({
      where: { id: existing.id },
      data: {
        contentJson: (body.payload ?? existing.contentJson) as Prisma.InputJsonValue,
        deletedAt: body.deletedAt === undefined ? existing.deletedAt : body.deletedAt === null ? null : new Date(body.deletedAt)
      }
    });
    return reply.send({ record: { id: memory.id, scope: 'memory', payload: memory.contentJson } });
  });

  fastify.delete('/api/memory/:scope/:id', { preHandler: requireAuth }, async (request, reply) => {
    const params = request.params as { scope: string; id: string };
    const userId = request.user!.userId;
    const existing = await prisma.memory.findFirst({ where: { id: params.id, userId, memoryType: 'memory' } });
    if (!existing) return reply.status(404).send({ error: 'NOT_FOUND' });
    const memory = await prisma.memory.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    return reply.send({ record: { id: memory.id, scope: 'memory', payload: memory.contentJson } });
  });
}