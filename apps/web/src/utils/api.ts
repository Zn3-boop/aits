import { API_BASE_URL, clearAuth } from './auth';

class ApiError extends Error {
  statusCode?: number;
  data?: unknown;

  constructor(
    message: string,
    statusCode?: number,
    data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.data = data;
  }
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const isFormData = options.body instanceof FormData;

    const incoming = (options.headers as Record<string, string>) || {};
    const safeHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(incoming)) {
      if (isFormData && k.toLowerCase() === 'content-type') continue;
      safeHeaders[k] = v;
    }

    const headers: Record<string, string> = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
      ...safeHeaders,
    };

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({
        message: `请求失败 (${response.status})`
      }));

      if (response.status === 401) {
        clearAuth();
        window.location.href = '/login';
      }

      throw new ApiError(
        (errData as { message?: string; error?: string })?.message
        || (errData as { error?: string })?.error
        || '请求失败',
        response.status,
        errData
      );
    }

    return response.json() as T;
  }

  // 聊天相关
  async sendMessage(params: {
    userId: string;
    sessionId: string;
    message: string;
    channel?: string;
    semantic?: boolean;
    retrieval?: {
      limit: number;
      minPriority: number;
    };
  }) {
    return this.request('/api/chat/message', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  // 记忆相关
  async getMemory(scope: string = 'memory') {
    return this.request(`/api/memory/${scope}`);
  }

  async saveMemory(scope: string, data: { id: string; payload: Record<string, unknown> }) {
    return this.request(`/api/memory/${scope}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // Live2D 相关
  async createLive2DSession() {
    return this.request('/api/live2d/session', {
      method: 'POST'
    });
  }

  // 语音克隆相关
  async createVoiceCloneJob(params: {
    sampleCount: number;
    sampleFiles: Array<{ filename: string; contentBase64: string }>;
  }) {
    return this.request('/api/voice-clone/jobs', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  // 健康检查
  async healthCheck() {
    return this.request('/health');
  }
}

// 创建单例实例
let apiClient: ApiClient | null = null;

export const getApiClient = (baseUrl?: string): ApiClient => {
  if (!apiClient) {
    apiClient = new ApiClient(baseUrl);
  }
  return apiClient;
};

export { ApiError };