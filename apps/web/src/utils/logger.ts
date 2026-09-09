/**
 * 统一日志管理
 * - 开发环境: 输出所有日志
 * - 生产环境: 仅输出 warn 和 error 级别
 */

const isDev = import.meta.env.DEV;

function noop() {}

export const logger = {
  /**
   * 普通日志 - 仅开发环境输出
   */
  log: isDev ? console.log.bind(console, '[LOG]') : noop,
  
  /**
   * 警告日志 - 始终输出
   */
  warn: console.warn.bind(console, '[WARN]'),
  
  /**
   * 错误日志 - 始终输出
   */
  error: console.error.bind(console, '[ERROR]'),
  
  /**
   * 调试日志 - 仅开发环境输出
   */
  debug: isDev ? console.debug.bind(console, '[DEBUG]') : noop,
  
  /**
   * 特定模块的日志实例
   */
  createModule: (module: string) => ({
    log: isDev ? console.log.bind(console, `[${module}]`) : noop,
    warn: console.warn.bind(console, `[${module}]`),
    error: console.error.bind(console, `[${module}]`),
    debug: isDev ? console.debug.bind(console, `[${module}]`) : noop,
  }),
};
