/**
 * Espeak TTS Provider
 * 使用系统级 espeak 命令进行语音合成（作为 Edge-TTS 的降级方案）
 */
import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { logger } from '../../utils/logger.js';
import type { TtsSynthesisResult } from './types.js';

export class EspeakTtsProvider {
  private voice: string;
  private speed: number;
  private pitch: number;

  constructor(options?: { voice?: string; speed?: number; pitch?: number }) {
    this.voice = options?.voice || 'zh-CN';
    this.speed = options?.speed || 170;
    this.pitch = options?.pitch || 50;
  }

  /**
   * 使用 espeak 合成语音
   * @param text 要合成的文本
   * @param voice 语音名称
   * @returns 音频 Buffer
   */
  async synthesize(text: string, voice?: string): Promise<Buffer> {
    const selectedVoice = voice || this.voice;
    const tempFile = join(tmpdir(), `espeak_${Date.now()}.wav`);

    return new Promise((resolve, reject) => {
      // 构造 espeak 命令参数
      const args = [
        '-w', tempFile,           // 输出到临时文件
        '-s', String(this.speed),  // 速度 (words per minute)
        '-p', String(this.pitch),  // 音调 (0-99)
        '-v', selectedVoice,      // 语音
        text                      // 要合成的文本
      ];

      logger.info(`[EspeakTtsProvider] Running: espeak ${args.join(' ')}`);

      const espeak = spawn('espeak', args);

      let errorOutput = '';

      espeak.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      espeak.on('close', (code) => {
        if (code === 0 && existsSync(tempFile)) {
          try {
            const { readFileSync } = require('fs');
            const audioBuffer = readFileSync(tempFile);
            unlinkSync(tempFile); // 清理临时文件
            resolve(audioBuffer);
          } catch (err) {
            reject(new Error(`Failed to read temp audio file: ${err}`));
          }
        } else {
          logger.error(`[EspeakTtsProvider] espeak exited with code ${code}: ${errorOutput}`);
          reject(new Error(`espeak synthesis failed: ${errorOutput || `exit code ${code}`}`));
        }
      });

      espeak.on('error', (err) => {
        logger.error(`[EspeakTtsProvider] Failed to spawn espeak: ${err.message}`);
        reject(new Error(`espeak not found or not executable. Please install espeak: ${err.message}`));
      });

      // 设置超时
      setTimeout(() => {
        espeak.kill();
        reject(new Error('espeak synthesis timeout (>30s)'));
      }, 30000);
    });
  }

  /**
   * 获取支持的语音列表
   */
  async getAvailableVoices(): Promise<string[]> {
    // espeak --voices 可以列出所有可用语音
    return new Promise((resolve) => {
      const espeak = spawn('espeak', ['--voices']);
      let output = '';

      espeak.stdout.on('data', (data) => {
        output += data.toString();
      });

      espeak.on('close', () => {
        const voices = output
          .split('\n')
          .filter(line => line.includes('zh')) // 只返回中文语音
          .map(line => {
            const parts = line.trim().split(/\s+/);
            return parts[1] || ''; // 语言代码在第二列
          })
          .filter(Boolean);
        resolve(voices);
      });

      espeak.on('error', () => {
        resolve([]); // espeak 不可用时返回空数组
      });
    });
  }
}
