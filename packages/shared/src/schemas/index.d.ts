import { z } from 'zod';
export declare const RegisterSchema: z.ZodObject<{
    username: z.ZodString;
    password: z.ZodString;
    nickname: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    username: string;
    password: string;
    nickname?: string | undefined;
}, {
    username: string;
    password: string;
    nickname?: string | undefined;
}>;
export declare const LoginSchema: z.ZodObject<{
    username: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    username: string;
    password: string;
}, {
    username: string;
    password: string;
}>;
export declare const UserSchema: z.ZodObject<{
    id: z.ZodString;
    username: z.ZodString;
    nickname: z.ZodString;
    avatar: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    role: z.ZodEnum<["admin", "user"]>;
    createdAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    username: string;
    nickname: string;
    id: string;
    role: "admin" | "user";
    avatar?: string | null | undefined;
    createdAt?: string | undefined;
}, {
    username: string;
    nickname: string;
    id: string;
    role: "admin" | "user";
    avatar?: string | null | undefined;
    createdAt?: string | undefined;
}>;
export declare const AuthResponseSchema: z.ZodObject<{
    token: z.ZodString;
    user: z.ZodObject<{
        id: z.ZodString;
        username: z.ZodString;
        nickname: z.ZodString;
        avatar: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        role: z.ZodEnum<["admin", "user"]>;
        createdAt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        username: string;
        nickname: string;
        id: string;
        role: "admin" | "user";
        avatar?: string | null | undefined;
        createdAt?: string | undefined;
    }, {
        username: string;
        nickname: string;
        id: string;
        role: "admin" | "user";
        avatar?: string | null | undefined;
        createdAt?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    user: {
        username: string;
        nickname: string;
        id: string;
        role: "admin" | "user";
        avatar?: string | null | undefined;
        createdAt?: string | undefined;
    };
    token: string;
}, {
    user: {
        username: string;
        nickname: string;
        id: string;
        role: "admin" | "user";
        avatar?: string | null | undefined;
        createdAt?: string | undefined;
    };
    token: string;
}>;
export declare const ChatMessageSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    role: z.ZodEnum<["user", "assistant", "system"]>;
    content: z.ZodString;
    createdAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    role: "user" | "assistant" | "system";
    content: string;
    id?: string | undefined;
    createdAt?: string | undefined;
}, {
    role: "user" | "assistant" | "system";
    content: string;
    id?: string | undefined;
    createdAt?: string | undefined;
}>;
export declare const ChatStreamRequestSchema: z.ZodObject<{
    message: z.ZodString;
    personaId: z.ZodOptional<z.ZodString>;
    sessionId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    message: string;
    personaId?: string | undefined;
    sessionId?: string | undefined;
}, {
    message: string;
    personaId?: string | undefined;
    sessionId?: string | undefined;
}>;
export declare const ChatStreamResponseSchema: z.ZodObject<{
    sessionId: z.ZodString;
    message: z.ZodString;
    done: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    message: string;
    sessionId: string;
    done: boolean;
}, {
    message: string;
    sessionId: string;
    done: boolean;
}>;
export declare const MemoryRecordSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    scope: z.ZodEnum<["user", "system", "session"]>;
    key: z.ZodString;
    payload: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    createdAt: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    scope: "session" | "user" | "system";
    key: string;
    payload: Record<string, unknown>;
    id?: string | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
}, {
    scope: "session" | "user" | "system";
    key: string;
    payload: Record<string, unknown>;
    id?: string | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
}>;
export declare const MemoryWriteSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    payload: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    payload: Record<string, unknown>;
    id?: string | undefined;
}, {
    payload: Record<string, unknown>;
    id?: string | undefined;
}>;
export declare const MemoryReadQuerySchema: z.ZodObject<{
    scope: z.ZodOptional<z.ZodEnum<["user", "system", "session"]>>;
    key: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    scope?: "session" | "user" | "system" | undefined;
    key?: string | undefined;
}, {
    scope?: "session" | "user" | "system" | undefined;
    key?: string | undefined;
}>;
export declare const PersonaSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    avatar: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    model: z.ZodOptional<z.ZodString>;
    personality: z.ZodOptional<z.ZodString>;
    skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    createdAt: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    avatar?: string | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
    description?: string | undefined;
    model?: string | undefined;
    personality?: string | undefined;
    skills?: string[] | undefined;
}, {
    id: string;
    name: string;
    avatar?: string | null | undefined;
    createdAt?: string | undefined;
    updatedAt?: string | undefined;
    description?: string | undefined;
    model?: string | undefined;
    personality?: string | undefined;
    skills?: string[] | undefined;
}>;
export declare const PersonaCreateSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    avatar: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    model: z.ZodOptional<z.ZodString>;
    personality: z.ZodOptional<z.ZodString>;
    skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    avatar?: string | null | undefined;
    description?: string | undefined;
    model?: string | undefined;
    personality?: string | undefined;
    skills?: string[] | undefined;
}, {
    name: string;
    avatar?: string | null | undefined;
    description?: string | undefined;
    model?: string | undefined;
    personality?: string | undefined;
    skills?: string[] | undefined;
}>;
export declare const PersonaUpdateSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    avatar: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    model: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    personality: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    skills: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
}, "strip", z.ZodTypeAny, {
    avatar?: string | null | undefined;
    name?: string | undefined;
    description?: string | undefined;
    model?: string | undefined;
    personality?: string | undefined;
    skills?: string[] | undefined;
}, {
    avatar?: string | null | undefined;
    name?: string | undefined;
    description?: string | undefined;
    model?: string | undefined;
    personality?: string | undefined;
    skills?: string[] | undefined;
}>;
export declare const VoiceProfileSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    provider: z.ZodEnum<["edge", "coqui", "espeak"]>;
    voiceId: z.ZodString;
    settings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    createdAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    provider: "edge" | "coqui" | "espeak";
    voiceId: string;
    createdAt?: string | undefined;
    settings?: Record<string, unknown> | undefined;
}, {
    id: string;
    name: string;
    provider: "edge" | "coqui" | "espeak";
    voiceId: string;
    createdAt?: string | undefined;
    settings?: Record<string, unknown> | undefined;
}>;
export declare const LLMProviderSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["ollama", "openai", "llamacpp"]>;
    name: z.ZodString;
    baseUrl: z.ZodString;
    apiKey: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    defaultModel: z.ZodString;
    enabled: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    type: "ollama" | "openai" | "llamacpp";
    id: string;
    name: string;
    baseUrl: string;
    defaultModel: string;
    enabled: boolean;
    apiKey?: string | null | undefined;
}, {
    type: "ollama" | "openai" | "llamacpp";
    id: string;
    name: string;
    baseUrl: string;
    defaultModel: string;
    apiKey?: string | null | undefined;
    enabled?: boolean | undefined;
}>;
export declare const ModelConfigSchema: z.ZodObject<{
    provider: z.ZodString;
    model: z.ZodString;
    temperature: z.ZodOptional<z.ZodNumber>;
    maxTokens: z.ZodOptional<z.ZodNumber>;
    topP: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    model: string;
    provider: string;
    temperature?: number | undefined;
    maxTokens?: number | undefined;
    topP?: number | undefined;
}, {
    model: string;
    provider: string;
    temperature?: number | undefined;
    maxTokens?: number | undefined;
    topP?: number | undefined;
}>;
export declare const AuditEventSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    timestamp: z.ZodString;
    level: z.ZodEnum<["info", "warn", "error"]>;
    service: z.ZodString;
    message: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    message: string;
    timestamp: string;
    level: "info" | "warn" | "error";
    service: string;
    id?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    message: string;
    timestamp: string;
    level: "info" | "warn" | "error";
    service: string;
    id?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export declare const ApiSuccessResponseSchema: <T extends z.ZodTypeAny>(dataSchema: T) => z.ZodObject<{
    success: z.ZodLiteral<true>;
    data: T;
}, "strip", z.ZodTypeAny, z.objectUtil.addQuestionMarks<z.baseObjectOutputType<{
    success: z.ZodLiteral<true>;
    data: T;
}>, any> extends infer T_1 ? { [k in keyof T_1]: T_1[k]; } : never, z.baseObjectInputType<{
    success: z.ZodLiteral<true>;
    data: T;
}> extends infer T_2 ? { [k_1 in keyof T_2]: T_2[k_1]; } : never>;
export declare const ApiErrorResponseSchema: z.ZodObject<{
    success: z.ZodLiteral<false>;
    error: z.ZodString;
    message: z.ZodString;
    details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    message: string;
    error: string;
    success: false;
    details?: Record<string, unknown> | undefined;
}, {
    message: string;
    error: string;
    success: false;
    details?: Record<string, unknown> | undefined;
}>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type User = z.infer<typeof UserSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatStreamRequest = z.infer<typeof ChatStreamRequestSchema>;
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;
export type Persona = z.infer<typeof PersonaSchema>;
export type PersonaCreate = z.infer<typeof PersonaCreateSchema>;
export type PersonaUpdate = z.infer<typeof PersonaUpdateSchema>;
export type VoiceProfile = z.infer<typeof VoiceProfileSchema>;
export type LLMProvider = z.infer<typeof LLMProviderSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
//# sourceMappingURL=index.d.ts.map