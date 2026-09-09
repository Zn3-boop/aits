export type UserEmotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'fearful' | 'disgusted';

export type AIEmotion = 'warm' | 'shy' | 'tsundere' | 'sad' | 'happy' | 'neutral' | 'concerned' | 'sleepy';

export type ExtendedEmotion = UserEmotion | 'warm' | 'shy' | 'thinking' | 'embarrassed';

// 聊天相关类型
export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
};

// 对话相关类型
export type Chat = {
  id: string;
  personaId: string;
  title: string;
  createdAt: string;
  lastMessage?: string;
};

// 消息相关类型
export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  emotion?: 'warm' | 'shy' | 'tsundere' | 'sad' | 'happy' | 'neutral';
  createdAt: string;
};

// 角色相关类型
export type Persona = {
  id: string;
  name: string;
  subtitle: string;
  avatar?: string;
  accent?: string;
  intro?: string;
  modelKey?: string;
  modelPath?: string;
  description?: string;
  speakingStyle?: string;
  systemPrompt?: string;
  extensible?: boolean;
  isSystem?: boolean;
};

export type ChatApiResponse = {
  reply: string;
  inference?: {
    emotion?: string;
    shortTermSummary?: string[];
    longTermSummary?: unknown[];
  };
  model?: {
    provider?: string;
    name?: string;
    fallbackUsed?: boolean;
    raw?: unknown;
  };
  error?: string;
  message?: string;
};

// 记忆相关类型
export type MemoryItem = {
  id: string;
  payload: {
    topic?: string;
    content?: string;
    timestamp?: string;
  };
};

// 语音相关类型
export type VoiceJob = {
  id: string;
  sampleCount: number;
  sampleFiles: Array<{ filename: string; contentBase64: string }>;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt?: string;
};

export type Recording = {
  id: string;
  url: string;
  blob: Blob;
};

// 角色相关类型
export type PersonaConfig = {
  name: string;
  personality: string;
  tone: string;
  background: string;
  interests: string[];
  relationship: 'assistant' | 'friend' | 'mentor' | 'companion' | 'other';
};

export type PersonaApi = Persona & {
  description?: string;
  speakingStyle?: string;
  systemPrompt: string;
};

// 设置相关类型
export type Settings = {
  apiUrl: string;
  wsUrl: string;
  modelProvider: string;
  modelName: string;
  theme: 'light' | 'dark' | 'auto';
  language: 'zh-CN' | 'en-US';
  notifications: boolean;
  autoScroll: boolean;
};

// Live2D 相关类型
export type Live2DSession = {
  sessionId: string;
  avatarModel?: string;
  lipSyncSource?: string;
  multiUserScope?: string;
};

// WebSocket 消息类型
export type WebSocketMessage = {
  type: 'chat' | 'live2d' | 'voice' | 'memory' | 'system';
  data: unknown;
  timestamp: number;
};

// API 错误类型
export type ApiError = {
  message: string;
  statusCode?: number;
  data?: unknown;
};

// 页面类型
export type PageId = 'chat' | 'memory' | 'voice' | 'live2d' | 'persona' | 'settings';