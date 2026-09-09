import { z } from 'zod';
// ============ Auth Schemas ============
export const RegisterSchema = z.object({
    username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线'),
    password: z.string().min(6).max(128),
    nickname: z.string().min(1).max(64).optional(),
});
export const LoginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
});
export const UserSchema = z.object({
    id: z.string().uuid(),
    username: z.string(),
    nickname: z.string(),
    avatar: z.string().nullable().optional(),
    role: z.enum(['admin', 'user']),
    createdAt: z.string().datetime().optional(),
});
export const AuthResponseSchema = z.object({
    token: z.string(),
    user: UserSchema,
});
// ============ Chat Schemas ============
export const ChatMessageSchema = z.object({
    id: z.string().optional(),
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    createdAt: z.string().datetime().optional(),
});
export const ChatStreamRequestSchema = z.object({
    message: z.string().min(1).max(10000),
    personaId: z.string().optional(),
    sessionId: z.string().optional(),
});
export const ChatStreamResponseSchema = z.object({
    sessionId: z.string(),
    message: z.string(),
    done: z.boolean(),
});
// ============ Memory Schemas ============
export const MemoryRecordSchema = z.object({
    id: z.string().optional(),
    scope: z.enum(['user', 'system', 'session']),
    key: z.string().min(1).max(256),
    payload: z.record(z.unknown()),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
});
export const MemoryWriteSchema = z.object({
    id: z.string().optional(),
    payload: z.record(z.unknown()),
});
export const MemoryReadQuerySchema = z.object({
    scope: z.enum(['user', 'system', 'session']).optional(),
    key: z.string().optional(),
});
// ============ Persona Schemas ============
export const PersonaSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    avatar: z.string().url().nullable().optional(),
    model: z.string().optional(),
    personality: z.string().optional(),
    skills: z.array(z.string()).optional(),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
});
export const PersonaCreateSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(1000).optional(),
    avatar: z.string().url().nullable().optional(),
    model: z.string().optional(),
    personality: z.string().max(2000).optional(),
    skills: z.array(z.string()).optional(),
});
export const PersonaUpdateSchema = PersonaCreateSchema.partial();
// ============ Voice Schemas ============
export const VoiceProfileSchema = z.object({
    id: z.string(),
    name: z.string(),
    provider: z.enum(['edge', 'coqui', 'espeak']),
    voiceId: z.string(),
    settings: z.record(z.unknown()).optional(),
    createdAt: z.string().datetime().optional(),
});
// ============ Model Schemas ============
export const LLMProviderSchema = z.object({
    id: z.string(),
    type: z.enum(['ollama', 'openai', 'llamacpp']),
    name: z.string(),
    baseUrl: z.string().url(),
    apiKey: z.string().nullable().optional(),
    defaultModel: z.string(),
    enabled: z.boolean().default(true),
});
export const ModelConfigSchema = z.object({
    provider: z.string(),
    model: z.string(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    topP: z.number().min(0).max(1).optional(),
});
// ============ Audit Schemas ============
export const AuditEventSchema = z.object({
    id: z.string().optional(),
    timestamp: z.string().datetime(),
    level: z.enum(['info', 'warn', 'error']),
    service: z.string(),
    message: z.string(),
    metadata: z.record(z.unknown()).optional(),
});
// ============ API Response Wrappers ============
export const ApiSuccessResponseSchema = (dataSchema) => z.object({
    success: z.literal(true),
    data: dataSchema,
});
export const ApiErrorResponseSchema = z.object({
    success: z.literal(false),
    error: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
});
