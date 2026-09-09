import { storage } from './storage';

export const API_BASE_URL =
  import.meta.env.MODE === 'development'
    ? ''
    : import.meta.env.VITE_API_BASE_URL ?? '';

type StoredUser = {
  id?: string;
  username?: string;
  nickname?: string;
};

const USER_KEY = 'user';
const TOKEN_KEY = 'auth_token';

export const getToken = (): string | null => storage.getPrimitive(TOKEN_KEY);

export const setToken = (token: string): void => {
  storage.setPrimitive(TOKEN_KEY, token);
};

export const clearToken = (): void => {
  const token = getToken();
  storage.removeItem(TOKEN_KEY);
  if (token) {
    fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      credentials: 'include',
    }).catch(() => {});
  }
};

export const getUserRaw = (): string | null => storage.getPrimitive(USER_KEY);

export const setUserRaw = (raw: string): void => storage.setPrimitive(USER_KEY, raw);

export const clearUser = (): void => storage.removeItem(USER_KEY);

export const clearAuth = (): void => {
  clearToken();
  clearUser();
};

export const readJsonStorage = <T,>(key: string, fallback: T): T => {
  return storage.getItem<T>(key, fallback);
};

export const getAuthHeaders = (includeContentType = true): Record<string, string> => {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (includeContentType) {
    headers['content-type'] = 'application/json';
  }
  return headers;
};

export const checkAuth = (): boolean => {
  const user = readJsonStorage<Pick<StoredUser, 'id'> | null>('user', null);
  return !!user?.id;
};

export const checkAuthAsync = async (): Promise<boolean> => {
  try {
    const res = await apiFetch('/api/auth/me');
    if (!res.ok) return false;
    const data = await res.json();
    if (data.user) {
      setUserRaw(JSON.stringify(data.user));
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

/** 通用 401/403 处理：清除登录态并跳转 */
export const handleAuthError = () => {
  clearAuth();
  window.location.href = '/login';
};

/**
 * 统一 API 错误
 */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * 统一认证 fetch 封装
 * - Token 通过 HttpOnly Cookie 自动携带（credentials: 'include'）
 * - 401 时直接抛出 ApiError，调用方 catch 后跳登录
 * - FormData 时不加 Content-Type，让浏览器自动填 boundary
 */
export const getApiBaseUrl = (): string => {
  const stored = storage.getItem<{ apiUrl?: string }>(storage.KEYS.SETTINGS, { apiUrl: '' });
  const customUrl = stored?.apiUrl?.trim();
  if (customUrl) return customUrl;
  return import.meta.env.MODE === 'development'
    ? ''
    : import.meta.env.VITE_API_BASE_URL ?? '';
};

export const apiFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const isFormData = options.body instanceof FormData;

  const incoming = (options.headers as Record<string, string>) || {};
  const safeHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (isFormData && k.toLowerCase() === 'content-type') continue;
    safeHeaders[k] = v;
  }

  // Cookie 认证：不需要手动添加 Authorization Header，Cookie 会自动发送
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json; charset=utf-8' }),
    ...safeHeaders,
  };

  const baseUrl = getApiBaseUrl();

  const response = await fetch(`${baseUrl}${url}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401) {
    clearAuth();
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new ApiError(401, '登录已过期，请重新登录');
  }

  return response;
};

/**
 * 统一解析 API 错误响应，防止乱码
 * 优先从 JSON 中提取 message/error 字段，兜底用状态码
 */
export const parseApiError = async (res: Response): Promise<string> => {
  try {
    const data = await res.json();
    return data?.message || data?.error || `请求失败 (${res.status})`;
  } catch {
    return `请求失败 (${res.status})`;
  }
};