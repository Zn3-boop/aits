import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import { requireAuth } from '../auth.js';

const API_KEY_ALGORITHM = 'aes-256-gcm';
const API_KEY_IV_LENGTH = 12;

const getEncryptionKey = () => {
  const raw = process.env.ENCRYPTION_KEY || 'dev-encryption-key-32chars!!';
  return createHash('sha256').update(raw).digest();
};

const encryptApiKey = (apiKey: string): string => {
  const iv = randomBytes(API_KEY_IV_LENGTH);
  const cipher = createCipheriv(API_KEY_ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('base64'),
    data: encrypted.toString('base64'),
    tag: authTag.toString('base64'),
  });
};

const _decryptApiKey = (encrypted: string): string | null => {
  try {
    const parsed = JSON.parse(encrypted);
    const iv = Buffer.from(parsed.iv, 'base64');
    const authTag = Buffer.from(parsed.tag, 'base64');
    const data = Buffer.from(parsed.data, 'base64');
    const decipher = createDecipheriv(API_KEY_ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
};

const _isEncryptedApiKey = (value: string | null | undefined): boolean => {
  if (!value) return false;
  try {
    const parsed = JSON.parse(value);
    return !!(parsed.iv && parsed.data && parsed.tag);
  } catch {
    return false;
  }
};

const MASKED_API_KEY = '••••••••';

const providerSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['ollama', 'openai', 'anthropic', 'minimax', 'custom']),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  model: z.string().min(1).max(200),
  isDefault: z.boolean().optional(),
});

export async function aiProviderRoutes(fastify: FastifyInstance) {
  fastify.get('/api/ai-providers', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const providers = await prisma.aiProvider.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    const sanitized = providers.map(p => ({
      ...p,
      apiKey: p.apiKey ? MASKED_API_KEY : null,
    }));

    return reply.send({ providers: sanitized });
  });

  fastify.post('/api/ai-providers', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const parsed = providerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'BAD_REQUEST', message: '参数错误' });
    }

    const { isDefault, apiKey, ...data } = parsed.data;

    if (isDefault) {
      await prisma.aiProvider.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    const provider = await prisma.aiProvider.create({
      data: {
        ...data,
        apiKey: apiKey ? encryptApiKey(apiKey) : null,
        userId,
        isDefault: isDefault || false,
      },
    });

    return reply.status(201).send({
      provider: {
        ...provider,
        apiKey: provider.apiKey ? MASKED_API_KEY : null,
      }
    });
  });

  fastify.put('/api/ai-providers/:id', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };
    const parsed = providerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'BAD_REQUEST', message: '参数错误' });
    }

    const { isDefault, apiKey, ...data } = parsed.data;

    if (isDefault) {
      await prisma.aiProvider.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    const updateData: Record<string, unknown> = {
      ...data,
      isDefault: isDefault || false,
    };
    if (apiKey && apiKey !== MASKED_API_KEY) {
      updateData.apiKey = encryptApiKey(apiKey);
    }

    const provider = await prisma.aiProvider.update({
      where: { id, userId },
      data: updateData,
    });

    return reply.send({
      provider: {
        ...provider,
        apiKey: provider.apiKey ? MASKED_API_KEY : null,
      }
    });
  });

  fastify.delete('/api/ai-providers/:id', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    await prisma.aiProvider.delete({
      where: { id, userId },
    });

    return reply.send({ success: true });
  });

  fastify.post('/api/ai-providers/:id/set-default', { preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const { id } = request.params as { id: string };

    await prisma.aiProvider.updateMany({
      where: { userId },
      data: { isDefault: false },
    });

    const provider = await prisma.aiProvider.update({
      where: { id, userId },
      data: { isDefault: true },
    });

    return reply.send({ provider });
  });
}