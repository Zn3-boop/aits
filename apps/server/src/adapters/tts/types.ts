
/**
 * TTS服务接口定义
 */
export type { WordBoundary } from './utils.js';
import type { WordBoundary } from './utils.js';

export interface TtsProvider {
  /**
   * 合成语音
   * @param text 要合成的文本
   * @param voice 语音ID
   * @returns 音频Buffer
   */
  synthesize(text: string, voice?: string): Promise<Buffer>;

  /**
   * 获取词边界时间戳
   * @param text 要合成的文本
   * @param voice 语音ID
   * @returns 标准化的词边界数组
   */
  getWordBoundaries(text: string, voice?: string): Promise<WordBoundary[]>;
}

/**
 * TTS合成结果
 */
export interface TtsSynthesisResult {
  audioBuffer: Buffer;
  wordBoundaries: WordBoundary[];
  voice: string;
}
