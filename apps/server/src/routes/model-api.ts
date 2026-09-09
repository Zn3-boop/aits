import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth.js';
import { join } from 'node:path';
import { scanLive2DModels } from '../services/model-scanner.js';

export async function modelApiRoutes(fastify: FastifyInstance) {

  fastify.get('/api/models', { preHandler: requireAuth }, async () => {
    const publicDir = join(process.cwd(), '../web/public/live2d/models');
    const models = scanLive2DModels(publicDir);
    return { models };
  });

  fastify.get('/api/ai-models', { preHandler: requireAuth }, async (_request, reply) => {
    try {
      const res = await fetch(`${fastify.config.MODEL_BASE_URL}/api/tags`);
      if (!res.ok) {
        return reply.send({
          models: [{ id: 'default', name: `${fastify.config.MODEL_NAME}（默认）`, provider: fastify.config.MODEL_PROVIDER }]
        });
      }
      const data = await res.json() as { models: Array<{ name: string }> };
      const models = [
        { id: 'default', name: `${fastify.config.MODEL_NAME}（默认）`, provider: fastify.config.MODEL_PROVIDER },
        ...data.models.map(m => ({ id: m.name, name: m.name, provider: 'ollama' }))
      ];
      return reply.send({ models });
    } catch {
      return reply.send({
        models: [{ id: 'default', name: `${fastify.config.MODEL_NAME}（默认）`, provider: fastify.config.MODEL_PROVIDER }]
      });
    }
  });
}