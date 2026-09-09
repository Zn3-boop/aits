
/**
 * TTS服务主类
 * 提供文本转语音功能，包含缓存和错误处理
 */

import type { TtsSynthesisResult } from './types.js';
import { EspeakTtsProvider } from './espeak-tts-provider.js';
import { logger } from '../../utils/logger.js';

// 简单的LRU缓存实现
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;

  constructor(maxSize: number = 50) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // 重新插入，使其成为最近使用的
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // 如果已存在，先删除
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } 
    // 如果超过最大大小，删除最旧的项
    else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

// 生成hash的简单函数
function generateHash(text: string, voice: string): string {
  const str = `${text}-${voice}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

export class TtsService {
  private espeakProvider: EspeakTtsProvider;
  private cache: LRUCache<string, TtsSynthesisResult>;
  private tempFiles: Map<string, NodeJS.Timeout> = new Map();

  constructor(_providerType: string = 'espeak') {
    this.espeakProvider = new EspeakTtsProvider();
    this.cache = new LRUCache<string, TtsSynthesisResult>(50);
  }

  /**
   * 合成语音
   * @param text 要合成的文本
   * @param voice 语音ID
   * @returns 合成结果，包含音频Buffer和词边界
   */
  async synthesize(text: string, voice?: string): Promise<TtsSynthesisResult> {
    const selectedVoice = voice || 'cmn';

    // 截断过长的文本
    const truncatedText = text.length > 500 ? text.substring(0, 500) : text;

    // 检查缓存
    const cacheKey = generateHash(truncatedText, selectedVoice);
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      logger.info('[TtsService] Using cached audio');
      return cachedResult;
    }

    // 合成语音
    const audioBuffer = await this.espeakProvider.synthesize(truncatedText, selectedVoice);

    const result: TtsSynthesisResult = {
      audioBuffer,
      wordBoundaries: [],
      voice: selectedVoice
    };

    // 存入缓存
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * 清理临时文件
   * @param filePath 文件路径
   */
  scheduleFileCleanup(filePath: string, delayMs: number = 5 * 60 * 1000): void {
    // 清除之前的定时器
    if (this.tempFiles.has(filePath)) {
      clearTimeout(this.tempFiles.get(filePath)!);
    }

    // 设置新的定时器
    const timeout = setTimeout(() => {
      try {
        const fs = require('fs');
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          logger.info(`[TtsService] Cleaned up temp file: ${filePath}`);
        }
      } catch (error) {
        logger.error(`[TtsService] Failed to clean up temp file: ${filePath}`, error);
      }
      this.tempFiles.delete(filePath);
    }, delayMs);

    this.tempFiles.set(filePath, timeout);
  }

  /**
   * 清理所有资源
   */
  destroy(): void {
    // 清理所有定时器
    this.tempFiles.forEach((timeout, filePath) => {
      clearTimeout(timeout);
      try {
        const fs = require('fs');
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        logger.error(`[TtsService] Failed to clean up temp file during destroy: ${filePath}`, error);
      }
    });
    this.tempFiles.clear();

    // 清空缓存
    this.cache.clear();
  }
}

// 导出单例
let ttsServiceInstance: TtsService | null = null;

export const getTtsService = (providerType: string = 'edge'): TtsService => {
  if (!ttsServiceInstance) {
    ttsServiceInstance = new TtsService(providerType);
  }
  return ttsServiceInstance;
};