import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export interface HealthCheckResult {
  ollama: boolean;
  edgeTts: boolean;
  database: boolean;
}

export async function checkProviders(): Promise<HealthCheckResult> {
  const checks: HealthCheckResult = {
    ollama: false,
    edgeTts: false,
    database: false
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${config.modelBaseUrl}/api/tags`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    checks.ollama = response.ok;
    if (!checks.ollama) {
      logger.error('Ollama 连接失败，请检查 MODEL_BASE_URL');
    }
  } catch (error) {
    logger.error('Ollama 连接失败，请检查 MODEL_BASE_URL:', String(error));
  }

  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    await execAsync('python3 --version', { timeout: 5000 });
    checks.edgeTts = true;
  } catch {
    logger.error('Edge TTS 不可用，请确保 Python3 已安装');
  }

  try {
    const { prisma } = await import('../db.js');
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (error) {
    logger.error('数据库连接失败:', String(error));
  }

  return checks;
}

export function printHealthCheck(results: HealthCheckResult): void {
  logger.info('=== 健康检查结果 ===');
  logger.info(`Ollama: ${results.ollama ? '✓' : '✗'}`);
  logger.info(`Edge TTS: ${results.edgeTts ? '✓' : '✗'}`);
  logger.info(`数据库: ${results.database ? '✓' : '✗'}`);
  logger.info('==================');
}