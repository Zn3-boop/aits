import Fastify from 'fastify';
import cors from '@fastify/cors';
import envPlugin from '@fastify/env';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { envSchema } from './config/env-schema.js';
import { prisma } from './db.js';
import { writeStartupAudit } from './local-audit.js';
import { registerSecurityHooks } from './security.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { legacyMemoryRoutes } from './routes/legacy-memory.js';
import { modelApiRoutes } from './routes/model-api.js';
import { personaRoutes } from './routes/personas.js';
import { adminRoutes } from './routes/admin.js';
import { chatRoutes } from './routes/chats.js';
import { modelRoutes } from './routes/models.js';
import { memoryRoutes } from './routes/memories.js';
import { live2dRoutes } from './routes/live2d-models.js';
import { sttRoutes } from './routes/stt.js';
import { providerRoutes } from './routes/providers.js';
import { aiProviderRoutes } from './routes/ai-providers.js';
import { voiceRoutes } from './routes/voice.js';
import { default as sttWsRoutes } from './routes/stt-ws.js';
import websocket from '@fastify/websocket';
import { default as chatStreamRoutes } from './routes/chat-stream.js';
import { default as ttsApiRoutes } from './routes/tts-api.js';
import { default as voiceWSRoutes } from './routes/voice-ws.js';

const createApp = async () => {
  const app = Fastify({ logger: true, bodyLimit: 100 * 1024 * 1024 });

  await app.register(envPlugin, {
    schema: envSchema,
    dotenv: true,
    data: process.env
  });

  // 解析允许的 CORS 来源，支持通配符和多个域名
  const allowedOrigins = (app.config.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174,http://localhost:4174')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const allowAll = allowedOrigins.includes('*');

  await app.register(cors, {
    origin: (origin, cb) => {
      // 无 origin（如同源请求）或允许所有，直接通过
      if (!origin) {
        cb(null, true);
      } else if (allowAll || allowedOrigins.includes(origin)) {
        // credentials: true 时必须返回具体 origin，不能是 *
        cb(null, origin);
      } else {
        cb(new Error('CORS origin not allowed'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-persona-id'],
    // 确保预检请求被正确处理
    strictPreflight: false,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024 }
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      if (request.url.startsWith('/live2d/')) return `static:${request.ip}`;
      return request.ip;
    },
  });
  await app.register(sensible);

  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, bodyStr, done) => {
    try {
      if (!bodyStr || req.method === 'DELETE') {
        done(null, {});
      } else {
        done(null, JSON.parse(bodyStr as string));
      }
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  const live2dDir = join(process.cwd(), '../web/public/live2d');
  if (existsSync(live2dDir)) {
    await app.register(fastifyStatic, {
      root: live2dDir,
      prefix: '/live2d/',
      setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
      },
    });
  }

  registerSecurityHooks(app);

  await app.register(websocket);

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(legacyMemoryRoutes);
  await app.register(modelApiRoutes);
  await app.register(personaRoutes);
  await app.register(adminRoutes);
  await app.register(chatRoutes);
  await app.register(modelRoutes);
  await app.register(memoryRoutes);
  await app.register(live2dRoutes);
  await app.register(sttRoutes);
  await app.register(providerRoutes);
  await app.register(aiProviderRoutes);
  await app.register(voiceRoutes);
  await app.register(sttWsRoutes);
  await app.register(chatStreamRoutes);
  await app.register(voiceWSRoutes);
  await app.register(ttsApiRoutes);

  app.get('/health', async () => ({
    status: 'ok',
    model: app.config.MODEL_NAME,
    provider: app.config.MODEL_PROVIDER
  }));

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    reply.status(500).send({ error: 'INTERNAL_SERVER_ERROR', message: error instanceof Error ? error.message : 'Unknown error' });
  });

  return app;
};

const start = async () => {
  const app = await createApp();

  const isProduction = process.env.NODE_ENV === 'production';

  if (app.config.JWT_SECRET === 'dev-secret-change-in-production') {
    if (isProduction) {
      app.log.fatal('[SECURITY] JWT_SECRET is still the default value. Refusing to start in production!');
      process.exit(1);
    }
    app.log.warn('[SECURITY] Using default JWT_SECRET — set a strong secret in production!');
  }
  if ((process.env.ENCRYPTION_KEY || 'dev-encryption-key-32chars!!') === 'dev-encryption-key-32chars!!') {
    if (isProduction) {
      app.log.fatal('[SECURITY] ENCRYPTION_KEY is still the default value. Refusing to start in production!');
      process.exit(1);
    }
    app.log.warn('[SECURITY] Using default ENCRYPTION_KEY — set a strong key in production!');
  }

  try {
    await prisma.$connect();
    await writeStartupAudit({ service: 'server', message: 'Fastify API server started.' });
    await app.listen({ host: app.config.HOST, port: Number(app.config.PORT) });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();