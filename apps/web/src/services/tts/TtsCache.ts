/**
 * TTS 缓存管理器
 * 用于缓存音频数据和词边界信息，避免重复请求相同文本
 */

interface CacheEntry {
  audioUrl: string;
  wordBoundaries: Array<{ offset_ms: number; duration_ms: number; text: string }>;
  timestamp: number;
}

class TtsCacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private maxAge: number = 30 * 60 * 1000; // 30分钟过期
  private maxSize: number = 50; // 最多缓存50条

  /**
   * 生成缓存键
   * @param text 文本内容
   * @param voiceId 声音ID
   * @returns 缓存键
   */
  private generateKey(text: string, voiceId: string): string {
    return `${text.substring(0, 100)}:${voiceId}`;
  }

  /**
   * 获取缓存
   * @param text 文本内容
   * @param voiceId 声音ID
   * @returns 缓存条目或 null
   */
  get(text: string, voiceId: string): CacheEntry | null {
    const key = this.generateKey(text, voiceId);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // 检查是否过期
    const now = Date.now();
    if (now - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      // 释放 Blob URL
      URL.revokeObjectURL(entry.audioUrl);
      return null;
    }

    // 重新插入，使其成为最近使用的
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }

  /**
   * 设置缓存
   * @param text 文本内容
   * @param voiceId 声音ID
   * @param audioUrl 音频 URL
   * @param wordBoundaries 词边界信息
   */
  set(text: string, voiceId: string, audioUrl: string, wordBoundaries: Array<{ offset_ms: number; duration_ms: number; text: string }>): void {
    const key = this.generateKey(text, voiceId);

    // 如果已存在，先删除旧的
    if (this.cache.has(key)) {
      const oldEntry = this.cache.get(key)!;
      URL.revokeObjectURL(oldEntry.audioUrl);
      this.cache.delete(key);
    }

    // 如果超过最大大小，删除最旧的项
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        const oldEntry = this.cache.get(firstKey)!;
        URL.revokeObjectURL(oldEntry.audioUrl);
        this.cache.delete(firstKey);
      }
    }

    // 添加新条目
    this.cache.set(key, {
      audioUrl,
      wordBoundaries,
      timestamp: Date.now()
    });
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.forEach((entry) => {
      URL.revokeObjectURL(entry.audioUrl);
    });
    this.cache.clear();
  }

  /**
   * 清理过期条目
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > this.maxAge) {
        keysToDelete.push(key);
        URL.revokeObjectURL(entry.audioUrl);
      }
    });

    keysToDelete.forEach((key) => {
      this.cache.delete(key);
    });
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size;
  }
}

// 导出单例
export const ttsCache = new TtsCacheManager();
