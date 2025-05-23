/**
 * 日志工具，支持不同级别的日志输出
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

class Logger {
  private level: LogLevel = LogLevel.ERROR; // 默认只显示错误

  constructor() {
    // 从环境变量读取日志级别
    const envLevel = process.env.KOFFI_CURL_LOG_LEVEL?.toUpperCase();
    switch (envLevel) {
      case 'ERROR':
        this.level = LogLevel.ERROR;
        break;
      case 'WARN':
        this.level = LogLevel.WARN;
        break;
      case 'INFO':
        this.level = LogLevel.INFO;
        break;
      case 'DEBUG':
        this.level = LogLevel.DEBUG;
        break;
      default:
        // 检查是否为调试模式
        if (process.env.NODE_ENV === 'development' || 
            process.env.DEBUG === '1' || 
            process.env.DEBUG === 'koffi-curl') {
          this.level = LogLevel.DEBUG;
        }
        // 默认保持ERROR级别，不做任何改变
    }
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * 获取当前日志级别
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * 错误日志
   */
  error(...args: any[]): void {
    if (this.level >= LogLevel.ERROR) {
      console.error('[ERROR]', ...args);
    }
  }

  /**
   * 警告日志
   */
  warn(...args: any[]): void {
    if (this.level >= LogLevel.WARN) {
      console.warn('[WARN]', ...args);
    }
  }

  /**
   * 信息日志
   */
  info(...args: any[]): void {
    if (this.level >= LogLevel.INFO) {
      console.log('[INFO]', ...args);
    }
  }

  /**
   * 调试日志
   */
  debug(...args: any[]): void {
    if (this.level >= LogLevel.DEBUG) {
      console.log('[DEBUG]', ...args);
    }
  }

  /**
   * 检查是否启用了调试模式
   */
  isDebugEnabled(): boolean {
    return this.level >= LogLevel.DEBUG;
  }

  /**
   * 检查是否启用了警告模式
   */
  isWarnEnabled(): boolean {
    return this.level >= LogLevel.WARN;
  }
}

// 创建全局logger实例
export const logger = new Logger();

// 修复：直接绑定方法到实例，确保this上下文正确
export const error = (...args: any[]) => logger.error(...args);
export const warn = (...args: any[]) => logger.warn(...args);
export const info = (...args: any[]) => logger.info(...args);
export const debug = (...args: any[]) => logger.debug(...args);
