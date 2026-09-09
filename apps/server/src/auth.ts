import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

const SALT_ROUNDS = 12;
const COOKIE_NAME = 'auth_token';

export const safeCompare = (left: string, right: string) => {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  return timingSafeEqual(leftBytes, rightBytes);
};

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export interface AuthUser {
  userId: string;
  username: string;
  role: 'admin' | 'user';
}

export const resolveUserId = (request: FastifyRequest) => {
  const userId = request.headers['x-user-id'];
  return typeof userId === 'string' && userId.trim() ? userId.trim() : null;
};

export const signAuthToken = (payload: AuthUser, secret: string) =>
  jwt.sign(payload, secret, { expiresIn: '7d' });

export const verifyAuthToken = (token: string, secret: string) => jwt.verify(token, secret) as AuthUser;

// 设置认证 Cookie (使用 Set-Cookie 响应头)
export const setAuthCookie = (reply: FastifyReply, token: string) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const secureFlag = isProduction ? 'Secure;' : '';
  const cookieValue = `${COOKIE_NAME}=${token}; Path=/; ${secureFlag} HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`;
  reply.header('Set-Cookie', cookieValue);
};

// 清除认证 Cookie
export const clearAuthCookie = (reply: FastifyReply) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const secureFlag = isProduction ? 'Secure;' : '';
  const cookieValue = `${COOKIE_NAME}=; Path=/; ${secureFlag} HttpOnly; SameSite=Lax; Max-Age=0`;
  reply.header('Set-Cookie', cookieValue);
};

// 从请求头获取 Cookie
const getTokenFromRequest = (request: FastifyRequest): string | null => {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;
  
  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    const eqIndex = cookie.indexOf('=');
    if (eqIndex === -1) continue;
    const name = cookie.slice(0, eqIndex);
    const rawValue = cookie.slice(eqIndex + 1);
    if (name === COOKIE_NAME && rawValue) {
      try {
        return decodeURIComponent(rawValue);
      } catch {
        return rawValue;
      }
    }
  }
  return null;
};

export const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
  const token = getTokenFromRequest(request);
  
  if (!token) {
    return reply.status(401)
      .header('Content-Type', 'application/json; charset=utf-8')
      .send({ error: 'UNAUTHORIZED', message: '请先登录' });
  }

  try {
    const payload = verifyAuthToken(token, config.jwtSecret);
    request.user = payload;
    return null;
  } catch (err) {
    const msg = err instanceof jwt.JsonWebTokenError
      ? (err instanceof jwt.TokenExpiredError ? '登录已过期，请重新登录' : '认证令牌无效')
      : '认证失败';
    return reply.status(401)
      .header('Content-Type', 'application/json; charset=utf-8')
      .send({ error: 'UNAUTHORIZED', message: msg });
  }
};

export const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const result = await requireAuth(request, reply);
  if (result) return result;
  if (request.user?.role !== 'admin') {
    return reply.status(403)
      .header('Content-Type', 'application/json; charset=utf-8')
      .send({ error: 'FORBIDDEN', message: '需要管理员权限' });
  }
  return null;
};

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}