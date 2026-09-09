import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth } from '../auth.js';

export async function userRoutes(fastify: FastifyInstance) {

  fastify.get('/api/users/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.userId },
      select: { id: true, username: true, nickname: true, avatar: true }
    });
    if (!user) return reply.status(404).send({ error: 'NOT_FOUND' });
    return reply.send({ user });
  });

  fastify.put('/api/users/me', { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as { nickname?: string; username?: string };
    if (!body?.nickname || !body?.username) {
      return reply.status(400).send({ error: 'BAD_REQUEST' });
    }
    const updated = await prisma.user.update({
      where: { id: request.user!.userId },
      data: { nickname: body.nickname, username: body.username },
      select: { id: true, username: true, nickname: true, avatar: true }
    });
    return reply.send({ user: updated });
  });
}