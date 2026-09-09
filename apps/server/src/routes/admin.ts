import { FastifyInstance } from 'fastify';
import { requireAdmin } from '../middleware/auth.js';
import { syncModelRegistry, getAllModels, deleteCustomModel } from '../services/model-registry.js';
import { prisma } from '../db.js';

/**
 * 注册管理员相关路由
 */
export async function adminRoutes(fastify: FastifyInstance) {
  // 获取所有注册模型
  fastify.get('/api/admin/models', {
    preHandler: requireAdmin
  }, async (request, reply) => {
    try {
      const models = await getAllModels();
      return { success: true, models };
    } catch (error) {
      reply.status(500).send({ 
        success: false, 
        error: '获取模型列表失败' 
      });
    }
  });

  // 手动同步模型注册表
  fastify.post('/api/admin/models/sync', {
    preHandler: requireAdmin
  }, async (request, reply) => {
    try {
      await syncModelRegistry();
      return { success: true, message: '模型注册表同步完成' };
    } catch (error) {
      reply.status(500).send({ 
        success: false, 
        error: '同步模型注册表失败' 
      });
    }
  });

  // 删除自定义模型
  fastify.delete('/api/admin/models/:key', {
    preHandler: requireAdmin
  }, async (request, reply) => {
    try {
      const { key } = request.params as { key: string };
      await deleteCustomModel(key);
      return { success: true, message: '模型删除成功' };
    } catch (error: any) {
      const statusCode = error.message.includes('内置模型') ? 403 : 500;
      reply.status(statusCode).send({ 
        success: false, 
        error: error.message || '删除模型失败' 
      });
    }
  });

  // 获取所有用户
  fastify.get('/api/admin/users', {
    preHandler: requireAdmin
  }, async (request, reply) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          username: true,
          nickname: true,
          role: true,
          avatar: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return { success: true, users };
    } catch (error) {
      reply.status(500).send({ 
        success: false, 
        error: '获取用户列表失败' 
      });
    }
  });

  // 获取系统统计信息
  fastify.get('/api/admin/stats', {
    preHandler: requireAdmin
  }, async (request, reply) => {
    try {
      const [userCount, conversationCount, modelCount] = await Promise.all([
        prisma.user.count(),
        prisma.personaConversation.count(),
        getAllModels().then((models) => models.length),
      ]);

      return {
        success: true,
        stats: {
          users: userCount,
          chats: conversationCount,
          messages: conversationCount,
          models: modelCount
        }
      };
    } catch (error) {
      reply.status(500).send({ 
        success: false, 
        error: '获取统计信息失败' 
      });
    }
  });
}
