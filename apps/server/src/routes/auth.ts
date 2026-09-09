import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { requireAuth, signAuthToken, setAuthCookie, clearAuthCookie } from '../auth.js';
import { config } from '../config.js';

export async function authRoutes(fastify: FastifyInstance) {

  fastify.post('/api/auth/register', async (request, reply) => {
    try {
      const body = request.body as { username?: string; password?: string; nickname?: string };
      if (!body?.username || !body?.password) {
        return reply.status(400).send({ error: 'BAD_REQUEST', message: '请输入用户名和密码' });
      }
      const existing = await prisma.user.findUnique({ where: { username: body.username } });
      if (existing) {
        return reply.status(409).send({ error: 'CONFLICT', message: '用户名已存在' });
      }
      const hashed = await bcrypt.hash(body.password, 12);
      const user = await prisma.user.create({
        data: { username: body.username, password: hashed, nickname: body.nickname || body.username }
      });
      const token = signAuthToken(
        { userId: user.id, username: user.username, role: 'user' },
        config.jwtSecret
      );
      // 设置 Cookie + 返回 token（双保险）
      setAuthCookie(reply, token);
      return reply.send({
        token,  // 返回 token 给前端存储
        user: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, role: user.role }
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: '注册失败，请重试' });
    }
  });

  fastify.post('/api/auth/login', async (request, reply) => {
    try {
      const body = request.body as { username?: string; password?: string };
      if (!body?.username || !body?.password) {
        return reply.status(400).send({ error: 'BAD_REQUEST', message: '请输入用户名和密码' });
      }
      const user = await prisma.user.findUnique({ where: { username: body.username } });
      if (!user) {
        return reply.status(401).send({ error: 'UNAUTHORIZED', message: '用户名或密码错误' });
      }
      const valid = await bcrypt.compare(body.password, user.password);
      if (!valid) {
        return reply.status(401).send({ error: 'UNAUTHORIZED', message: '用户名或密码错误' });
      }
      const token = signAuthToken(
        { userId: user.id, username: user.username, role: user.role === 'admin' ? 'admin' : 'user' },
        config.jwtSecret
      );
      // 设置 Cookie + 返回 token（双保险）
      setAuthCookie(reply, token);
      return reply.send({
        token,  // 返回 token 给前端存储
        user: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, role: user.role }
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'INTERNAL_ERROR', message: '服务器内部错误' });
    }
  });

  fastify.get('/api/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.userId },
      select: { id: true, username: true, nickname: true, avatar: true, role: true, createdAt: true }
    });
    if (!user) return reply.status(404).send({ error: 'NOT_FOUND' });
    return reply.send({ user });
  });

  fastify.post('/api/auth/logout', { preHandler: requireAuth }, async (_request, reply) => {
    // 清除 Cookie
    clearAuthCookie(reply);
    return reply.send({ success: true, message: '退出登录成功' });
  });
}
