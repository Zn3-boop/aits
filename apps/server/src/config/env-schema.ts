export const envSchema = {
  type: 'object',
  required: [],
  properties: {
    PORT: { type: 'string', default: '8787' },
    HOST: { type: 'string', default: '0.0.0.0' },
    JWT_SECRET: { type: 'string', default: 'dev-secret-change-in-production' },
    ENCRYPTION_KEY: { type: 'string', default: 'dev-encryption-key-32chars!!' },
    MODEL_PROVIDER: { type: 'string', default: 'ollama' },
    MODEL_BASE_URL: { type: 'string', default: 'http://127.0.0.1:11434' },
    MODEL_NAME: { type: 'string', default: 'llama3.1:8b' },
    DATABASE_URL: { type: 'string', default: 'file:./prisma/dev.db' },
    CORS_ORIGIN: { type: 'string', default: 'http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:4173' }
  }
} as const;