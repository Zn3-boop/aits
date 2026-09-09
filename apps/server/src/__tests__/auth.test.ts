import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';

// 面试常考：JWT Token 测试
describe('JWT Authentication', () => {
  const JWT_SECRET = 'test-secret-key';
  const TEST_USER = { id: 1, username: 'testuser' };

  it('应该生成有效的 JWT token', () => {
    const token = jwt.sign(TEST_USER, JWT_SECRET, { expiresIn: '1h' });
    
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // JWT 有三部分
  });

  it('应该正确验证 token', () => {
    const token = jwt.sign(TEST_USER, JWT_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, JWT_SECRET) as typeof TEST_USER;
    
    expect(decoded.id).toBe(TEST_USER.id);
    expect(decoded.username).toBe(TEST_USER.username);
  });

  it('应该拒绝过期 token', () => {
    const token = jwt.sign(TEST_USER, JWT_SECRET, { expiresIn: '-1s' });
    
    expect(() => jwt.verify(token, JWT_SECRET)).toThrow();
  });

  it('应该拒绝无效签名', () => {
    const token = jwt.sign(TEST_USER, JWT_SECRET, { expiresIn: '1h' });
    
    expect(() => jwt.verify(token, 'wrong-secret')).toThrow();
  });
});

// 面试常考：密码哈希测试
describe('Password Hashing', () => {
  // 使用简单的哈希模拟 bcrypt
  const hashPassword = (password: string): string => {
    // 实际项目使用 bcrypt: await bcrypt.hash(password, 10)
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(password).digest('hex');
  };

  const verifyPassword = (password: string, hash: string): boolean => {
    return hashPassword(password) === hash;
  };

  it('应该正确哈希密码', () => {
    const password = 'mySecurePassword123';
    const hash = hashPassword(password);
    
    expect(hash).not.toBe(password);
    expect(hash.length).toBe(64); // SHA256 产生 64 字符的十六进制
  });

  it('应该正确验证密码', () => {
    const password = 'mySecurePassword123';
    const hash = hashPassword(password);
    
    expect(verifyPassword(password, hash)).toBe(true);
    expect(verifyPassword('wrongPassword', hash)).toBe(false);
  });
});

// 面试常考：Rate Limiting 测试
describe('Rate Limiting', () => {
  // 简单的速率限制实现
  class RateLimiter {
    private requests: Map<string, number[]> = new Map();
    private limit: number;
    private windowMs: number;

    constructor(limit: number, windowMs: number) {
      this.limit = limit;
      this.windowMs = windowMs;
    }

    isAllowed(clientId: string): boolean {
      const now = Date.now();
      const clientRequests = this.requests.get(clientId) || [];
      
      // 清理过期的请求
      const validRequests = clientRequests.filter(
        time => now - time < this.windowMs
      );
      
      if (validRequests.length >= this.limit) {
        return false;
      }
      
      validRequests.push(now);
      this.requests.set(clientId, validRequests);
      return true;
    }

    getRemainingRequests(clientId: string): number {
      const now = Date.now();
      const clientRequests = this.requests.get(clientId) || [];
      const validRequests = clientRequests.filter(
        time => now - time < this.windowMs
      );
      return Math.max(0, this.limit - validRequests.length);
    }
  }

  it('应该允许在限制内的请求', () => {
    const limiter = new RateLimiter(3, 60000); // 1 分钟内最多 3 次
    
    expect(limiter.isAllowed('user1')).toBe(true);
    expect(limiter.isAllowed('user1')).toBe(true);
    expect(limiter.isAllowed('user1')).toBe(true);
  });

  it('应该拒绝超过限制的请求', () => {
    const limiter = new RateLimiter(2, 60000);
    
    limiter.isAllowed('user1');
    limiter.isAllowed('user1');
    expect(limiter.isAllowed('user1')).toBe(false);
  });

  it('不同用户应该有独立的限制', () => {
    const limiter = new RateLimiter(1, 60000);
    
    limiter.isAllowed('user1');
    expect(limiter.isAllowed('user2')).toBe(true);
  });

  it('应该正确计算剩余请求数', () => {
    const limiter = new RateLimiter(5, 60000);
    
    limiter.isAllowed('user1');
    limiter.isAllowed('user1');
    expect(limiter.getRemainingRequests('user1')).toBe(3);
  });
});