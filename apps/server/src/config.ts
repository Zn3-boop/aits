export const config = {
  llmProvider: (process.env.MODEL_PROVIDER as 'ollama' | 'openai') || 'ollama',
  modelBaseUrl: process.env.MODEL_BASE_URL || 'http://127.0.0.1:11434',
  defaultModel: process.env.MODEL_NAME || 'llama3.1:8b',

  ttsProvider: (process.env.TTS_PROVIDER as 'edge' | 'coqui') || 'edge',

  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',

  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  databaseUrl: process.env.DATABASE_URL || 'file:./prisma/dev.db',

  port: parseInt(process.env.PORT || '8787', 10),
  host: process.env.HOST || '0.0.0.0',

  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  encryptionKey: process.env.ENCRYPTION_KEY || 'dev-encryption-key-32chars!!',
};