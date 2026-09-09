import type { FastifyReply, FastifyRequest } from 'fastify';
import { type ZodSchema } from 'zod';

/**
 * 创建请求体校验中间件
 * 用于 POST/PUT/PATCH 请求的 body 校验
 */
export const validateBody = <T>(schema: ZodSchema<T>) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const result = schema.safeParse(request.body);
    
    if (!result.success) {
      const messages = result.error.issues.map((e) => {
        const path = e.path.map(String).join('.');
        return path ? `${path}: ${e.message}` : e.message;
      });
      
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: '请求参数校验失败',
        details: messages,
      });
    }
    
    request.body = result.data;
  };
};

/**
 * 创建查询参数校验中间件
 * 用于 GET 请求的 query 校验
 */
export const validateQuery = <T>(schema: ZodSchema<T>) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const result = schema.safeParse(request.query);
    
    if (!result.success) {
      const messages = result.error.issues.map((e) => {
        const path = e.path.map(String).join('.');
        return path ? `${path}: ${e.message}` : e.message;
      });
      
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: '查询参数校验失败',
        details: messages,
      });
    }
    
    request.query = result.data as typeof request.query;
  };
};

/**
 * 创建 URL 参数校验中间件
 * 用于路由参数校验
 */
export const validateParams = <T>(schema: ZodSchema<T>) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const result = schema.safeParse(request.params);
    
    if (!result.success) {
      const messages = result.error.issues.map((e) => {
        const path = e.path.map(String).join('.');
        return path ? `${path}: ${e.message}` : e.message;
      });
      
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: '路由参数校验失败',
        details: messages,
      });
    }
  };
};

/**
 * 统一错误格式化函数
 * 用于将 ZodError 格式化为用户友好的错误消息
 */
export const formatZodError = (error: { issues: { path: PropertyKey[]; message: string }[] }): string => {
  return error.issues
    .map((e) => {
      const path = e.path.map(String).join('.');
      return path ? `${path}: ${e.message}` : e.message;
    })
    .join('; ');
};