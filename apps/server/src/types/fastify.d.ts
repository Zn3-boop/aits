import 'fastify';
import type { AuthUser } from '../auth.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: {
      CORS_ORIGIN: string;
      MODEL_NAME: string;
      MODEL_PROVIDER: string;
      MODEL_BASE_URL: string;
      JWT_SECRET: string;
      HOST: string;
      PORT: string;
    };
  }

  interface FastifyRequest {
    user?: AuthUser;
  }
}
