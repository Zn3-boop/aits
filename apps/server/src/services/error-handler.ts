import type { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';


/**
 * 自定义应用错误类
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * 统一错误响应格式化
 */
export const formatErrorResponse = (
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
) => {
  const response: Record<string, unknown> = {
    error: code,
    message,
    timestamp: new Date().toISOString(),
  };
  if (details) {
    response.details = details;
  }
  return response;
};

/**
 * 处理 Prisma 错误
 */
export const handlePrismaError = (error: unknown): AppError => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return new AppError(409, 'CONFLICT', '记录已存在');
      case 'P2025':
        return new AppError(404, 'NOT_FOUND', '记录不存在');
      default:
        return new AppError(400, 'DATABASE_ERROR', '数据库操作失败');
    }
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    return new AppError(400, 'VALIDATION_ERROR', '数据验证失败');
  }
  return new AppError(500, 'INTERNAL_ERROR', '数据库错误');
};

/**
 * 处理 Zod 验证错误
 */
export const handleZodError = (error: { issues: { path: PropertyKey[]; message: string }[] }): AppError => {
  const messages = error.issues.map(e => {
    const path = e.path.map(String).join('.');
    return path ? `${path}: ${e.message}` : e.message;
  });
  return new AppError(400, 'VALIDATION_ERROR', '参数校验失败', messages);
};

/**
 * 全局错误处理中间件
 */
export const errorHandler = (
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  // 记录错误日志
  request.log.error(error);

  // AppError - 自定义应用错误
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send(
      formatErrorResponse(error.statusCode, error.code, error.message, error.details)
    );
  }

  // Prisma 错误
  if (error instanceof Prisma.PrismaClientKnownRequestError || 
      error instanceof Prisma.PrismaClientValidationError) {
    const appError = handlePrismaError(error);
    return reply.status(appError.statusCode).send(
      formatErrorResponse(appError.statusCode, appError.code, appError.message, appError.details)
    );
  }

  // JWT 错误
  if (error instanceof Error && error.name === 'JsonWebTokenError') {
    return reply.status(401).send(
      formatErrorResponse(401, 'UNAUTHORIZED', '无效的认证令牌')
    );
  }

  if (error instanceof Error && error.name === 'TokenExpiredError') {
    return reply.status(401).send(
      formatErrorResponse(401, 'UNAUTHORIZED', '认证令牌已过期')
    );
  }

  // 默认内部服务器错误
  return reply.status(500).send(
    formatErrorResponse(
      500,
      'INTERNAL_SERVER_ERROR',
      error instanceof Error ? error.message : '未知错误'
    )
  );
};