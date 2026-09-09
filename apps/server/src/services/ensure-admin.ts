import { prisma } from '../db.js';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger.js';

export async function ensureAdmin(): Promise<void> {
  try {
    const admin = await prisma.user.findUnique({ 
      where: { username: 'admin' } 
    });

    if (!admin) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await prisma.user.create({
        data: { 
          username: 'admin', 
          password: hashedPassword, 
          nickname: '管理员', 
          role: 'admin' 
        }
      });
      logger.warn('默认管理员已创建: admin / admin123，请及时修改密码');
    } else {
      logger.info('管理员账号已存在');
    }
  } catch (error) {
    logger.error('创建或检查管理员账号失败:', String(error));
    throw error;
  }
}