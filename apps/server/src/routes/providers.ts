import type { FastifyInstance } from 'fastify';

export async function providerRoutes(fastify: FastifyInstance) {
  fastify.get('/api/providers/current', async (_request, reply) => {
    return reply.status(410).send({
      error: 'DEPRECATED',
      message: 'This endpoint is deprecated. Use /api/ai-providers instead.'
    });
  });
}