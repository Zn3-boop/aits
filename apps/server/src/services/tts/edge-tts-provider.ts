import { exec } from 'child_process';
import { promisify } from 'util';
import type { TtsProvider, TtsResponse } from './types.js';
import { logger } from '../../utils/logger.js';

const execAsync = promisify(exec);

export class EdgeTtsProvider implements TtsProvider {
  private pythonPath: string;
  private scriptPath: string;

  constructor(pythonPath: string = 'python3', scriptPath: string = './scripts/edge-tts.py') {
    this.pythonPath = pythonPath;
    this.scriptPath = scriptPath;
  }

  async synthesize(text: string, voice: string = 'zh-CN-XiaoxiaoNeural'): Promise<TtsResponse> {
    try {
      const { stdout } = await execAsync(
        `${this.pythonPath} ${this.scriptPath} --text "${text}" --voice ${voice}`,
        { encoding: 'buffer' as BufferEncoding }
      );

      return {
        audioBuffer: stdout as unknown as Buffer,
        wordBoundaries: undefined // Edge TTS 不提供词边界信息
      };
    } catch (error) {
      logger.error('Edge TTS synthesis error:', String(error));
      throw new Error('Edge TTS 合成失败', { cause: error });
    }
  }

  async getVoices(): Promise<string[]> {
    // 常用的中文声音
    return [
      'zh-CN-XiaoxiaoNeural',
      'zh-CN-YunxiNeural',
      'zh-CN-YunyangNeural',
      'zh-CN-XiaoyiNeural',
      'zh-CN-YunjianNeural'
    ];
  }

  async healthCheck(): Promise<boolean> {
    try {
      await execAsync(`${this.pythonPath} --version`);
      return true;
    } catch {
      return false;
    }
  }
}