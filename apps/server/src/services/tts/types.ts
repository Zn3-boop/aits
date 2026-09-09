export interface TtsWordBoundary {
  word: string;
  offset: number;
  duration: number;
}

export interface TtsResponse {
  audioBuffer: Buffer;
  wordBoundaries?: TtsWordBoundary[];
}

export interface TtsProvider {
  /**
   * 合成语音
   * @param text 要合成的文本
   * @param voice 声音ID
   * @returns 音频数据和词边界信息
   */
  synthesize(text: string, voice: string): Promise<TtsResponse>;

  /**
   * 获取可用的声音列表
   */
  getVoices(): Promise<string[]>;

  /**
   * 检查Provider是否可用
   */
  healthCheck(): Promise<boolean>;
}
