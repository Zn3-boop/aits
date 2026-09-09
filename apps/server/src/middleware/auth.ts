import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';

export interface AuthUser {
  userId: string;
  username: string;
  role: 'admin' | 'user';
}

export const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
  const token = request.headers.authorization?.replace('Bearer ', '').trim();
  if (!token) {
    return reply.status(401)
      .header('Content-Type', 'application/json; charset=utf-8')
      .send({ error: '未登录', message: '请先登录' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthUser;
    request.user = decoded;
    return null;
  } catch {
    return reply.status(401)
      .header('Content-Type', 'application/json; charset=utf-8')
      .send({ error: 'token无效或已过期', message: '登录已过期，请重新登录' });
  }
};

export const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const authError = await requireAuth(request, reply);
  if (authError) return authError;

  if (request.user?.role !== 'admin') {
      return reply.status(403).send({ error: '需要管理员权限' });
  }

  return null;
};

export const requireOwnerOrAdmin = (getUserId: (req: FastifyRequest) => string) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authError = await requireAuth(request, reply);
    if (authError) return authError;

    if (request.user?.role === 'admin') return null;

    const resourceUserId = getUserId(request);
    if (request.user?.userId !== resourceUserId) {
        return reply.status(403).send({ error: '无权操作' });
    }

  return null;
  };
};
