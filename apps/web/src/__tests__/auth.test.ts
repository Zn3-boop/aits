/**
 * 前端认证工具测试
 * 面试常考：localStorage 操作、Token 管理
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// 测试目标：auth 工具函数（实际项目中应从 utils/auth 导入）
// 这里展示测试模式，真实实现见 apps/web/src/utils/auth.ts

describe('Token 管理', () => {
  const TOKEN_KEY = 'token';
  const USER_KEY = 'user';

  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('Token 存储', () => {
    it('应该正确存储 token', () => {
      const token = 'test-jwt-token-123';
      localStorage.setItem(TOKEN_KEY, token);
      
      expect(localStorage.getItem(TOKEN_KEY)).toBe(token);
      expect(localStorage.setItem).toHaveBeenCalledWith(TOKEN_KEY, token);
    });

    it('应该正确读取 token', () => {
      const token = 'test-jwt-token-456';
      localStorage.setItem(TOKEN_KEY, token);
      
      const stored = localStorage.getItem(TOKEN_KEY);
      expect(stored).toBe(token);
    });

    it('token 不存在时返回 null', () => {
      const stored = localStorage.getItem(TOKEN_KEY);
      expect(stored).toBeNull();
    });

    it('应该正确删除 token', () => {
      localStorage.setItem(TOKEN_KEY, 'test-token');
      localStorage.removeItem(TOKEN_KEY);
      
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    });
  });

  describe('用户信息存储', () => {
    it('应该正确存储用户信息', () => {
      const user = { id: '123', username: 'testuser', nickname: 'Test User' };
      const userJson = JSON.stringify(user);
      
      localStorage.setItem(USER_KEY, userJson);
      
      const stored = localStorage.getItem(USER_KEY);
      expect(stored).toBe(userJson);
      expect(JSON.parse(stored!)).toEqual(user);
    });

    it('应该正确解析用户信息', () => {
      const user = { id: '456', username: 'john', nickname: 'John Doe' };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      
      const stored = localStorage.getItem(USER_KEY);
      const parsed = stored ? JSON.parse(stored) : null;
      
      expect(parsed).toEqual(user);
      expect(parsed?.username).toBe('john');
    });
  });

  describe('认证状态检查', () => {
    it('有 token 时应视为已登录', () => {
      localStorage.setItem(TOKEN_KEY, 'valid-token');
      
      const hasToken = localStorage.getItem(TOKEN_KEY) !== null;
      expect(hasToken).toBe(true);
    });

    it('无 token 时应视为未登录', () => {
      const hasToken = localStorage.getItem(TOKEN_KEY) !== null;
      expect(hasToken).toBe(false);
    });

    it('应能同时检查 token 和用户信息', () => {
      const token = 'test-token';
      const user = { id: '1', username: 'test' };
      
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      
      const hasToken = localStorage.getItem(TOKEN_KEY) !== null;
      const hasUser = localStorage.getItem(USER_KEY) !== null;
      
      expect(hasToken && hasUser).toBe(true);
    });
  });
});

describe('HttpOnly Cookie 迁移场景', () => {
  const TOKEN_KEY = 'token';
  const USER_KEY = 'user';

  beforeEach(() => {
    localStorageMock.clear();
  });
  
  /**
   * 面试常问：从 localStorage 迁移到 HttpOnly Cookie 的原因
   * 
   * localStorage 的问题：
   * 1. 可被 XSS 攻击读取
   * 2. 任何运行的 JS 都能访问
   * 
   * HttpOnly Cookie 的优势：
   * 1. JS 无法访问（XSS 无法读取）
   * 2. 自动随请求发送
   * 3. 可设置过期时间
   */
  
  it('模拟：Cookie 模式下不应在 localStorage 存储 token', () => {
    // 迁移后：只存储 user 信息，不存储 token
    const user = { id: '123', username: 'testuser' };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    
    // token 应该通过 Set-Cookie 设置，由浏览器自动管理
    const storedToken = localStorage.getItem(TOKEN_KEY);
    expect(storedToken).toBeNull();
    
    const storedUser = localStorage.getItem(USER_KEY);
    expect(storedUser).not.toBeNull();
  });

  it('模拟：credentials: include 自动发送 Cookie', () => {
    // 使用 credentials: 'include' 会自动发送 Cookie
    const requestInit = {
      method: 'GET',
      credentials: 'include' as RequestCredentials,
    };
    
    expect(requestInit.credentials).toBe('include');
    // 实际项目中：fetch('/api/user', requestInit)
  });
});