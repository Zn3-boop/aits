/**
 * TTSManager - 统一 TTS 播放管理器（单例）
 *
 * 所有 TTS 播放都通过这个管理器：
 * - 后端推送的 audio_chunk
 * - 消息朗读按钮的文本合成
 * - 全局开关控制
 * - 播放进度报告（供时间轴同步）
 */
import { expressionBus } from '../../features/expression-bus';
import { apiFetch } from '../../utils/auth';

class TTSManager {
  private static instance: TTSManager;
  private enabled = true;
  private currentAudio: HTMLAudioElement | null = null;
  private queue: string[] = [];
  private isPlaying = false;
  private abortController: AbortController | null = null;

  private progressListeners: Set<(elapsedMs: number, totalMs: number) => void> = new Set();
  private elapsedTime = 0;
  private totalEstimatedTime = 0;
  private chunkStartTime = 0;

  private constructor() {}

  static getInstance(): TTSManager {
    if (!TTSManager.instance) {
      TTSManager.instance = new TTSManager();
    }
    return TTSManager.instance;
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (!v) {
      this.stop();
      console.log('[TTSManager] TTS 已关闭');
    } else {
      console.log('[TTSManager] TTS 已开启');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  play(base64: string): void {
    if (!this.enabled) {
      console.log('[TTSManager] TTS 已关闭，丢弃音频');
      return;
    }

    this.queue.push(base64);
    console.log('[TTSManager] 加入队列，当前队列长度:', this.queue.length);

    if (!this.isPlaying) {
      this.playNext();
    }
  }

  async playText(text: string): Promise<void> {
    if (!this.enabled || !text.trim()) {
      console.log('[TTSManager] TTS 已关闭或文本为空');
      return;
    }

    console.log('[TTSManager] 开始合成文本:', text.slice(0, 50) + '...');

    try {
      const res = await apiFetch('/api/tts/synthesize', {
        method: 'POST',
        body: JSON.stringify({
          text: text.slice(0, 500),
          voiceId: 'zh-CN-XiaoxiaoNeural'
        }),
        signal: this.abortController?.signal,
      });

      if (!res.ok) {
        throw new Error(`TTS合成失败: ${res.status}`);
      }

      const blob = await res.blob();
      const reader = new FileReader();

      return new Promise((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          this.play(base64);
          resolve();
        };
        reader.onerror = () => {
          console.error('[TTSManager] 读取音频失败');
          reject(reader.error);
        };
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('[TTSManager] TTS 合成失败:', err);
      }
    }
  }

  onProgress(callback: (elapsedMs: number, totalMs: number) => void): () => void {
    this.progressListeners.add(callback);
    return () => this.progressListeners.delete(callback);
  }

  getElapsedTime(): number {
    if (this.currentAudio && !this.currentAudio.paused && isFinite(this.currentAudio.currentTime)) {
      return this.elapsedTime + (this.currentAudio.currentTime * 1000);
    }
    return this.elapsedTime;
  }

  getTotalEstimatedTime(): number {
    return this.totalEstimatedTime;
  }

  private notifyProgress(): void {
    const elapsed = this.getElapsedTime();
    this.progressListeners.forEach(cb => {
      try { cb(elapsed, this.totalEstimatedTime); } catch { /* ignore */ }
    });
  }

  private resetPlaybackTime(): void {
    this.elapsedTime = 0;
    this.totalEstimatedTime = 0;
    this.chunkStartTime = 0;
  }

  private playNext(): void {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      this.currentAudio = null;
      expressionBus.stopTimeline();
      expressionBus.listening();
      window.dispatchEvent(new CustomEvent('ai-speech-ended', {}));
      console.log('[TTSManager] 队列播放完毕');
      return;
    }

    const isFirstChunk = !this.isPlaying;
    this.isPlaying = true;
    expressionBus.speaking();

    const base64 = this.queue.shift()!;
    console.log('[TTSManager] 播放音频，剩余队列:', this.queue.length);

    try {
      const audio = new Audio(`data:audio/mp3;base64,${base64}`);
      this.currentAudio = audio;

      if (isFirstChunk) {
        this.resetPlaybackTime();
        window.dispatchEvent(new CustomEvent('ai-speech-started', {
          detail: { audioElement: audio }
        }));
      }

      audio.onloadedmetadata = () => {
        if (audio.duration && isFinite(audio.duration)) {
          this.totalEstimatedTime += audio.duration * 1000;
        }
      };

      this.chunkStartTime = Date.now();

      audio.onended = () => {
        const chunkDuration = Date.now() - this.chunkStartTime;
        this.elapsedTime += chunkDuration;
        this.notifyProgress();
        console.log('[TTSManager] 音频播放结束, 累计时间:', this.elapsedTime, 'ms');
        this.currentAudio = null;
        this.playNext();
      };

      audio.onerror = () => {
        console.error('[TTSManager] 音频播放错误');
        this.currentAudio = null;
        this.playNext();
      };

      audio.play().catch((err) => {
        console.error('[TTSManager] 音频播放失败:', err);
        this.currentAudio = null;
        this.playNext();
      });
    } catch (err) {
      console.error('[TTSManager] 创建音频失败:', err);
      this.currentAudio = null;
      this.playNext();
    }
  }

  stop(): void {
    console.log('[TTSManager] 停止播放');

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }

    this.queue = [];
    this.isPlaying = false;
    this.abortController?.abort();
    this.abortController = null;

    this.resetPlaybackTime();
    expressionBus.stopTimeline();
    expressionBus.listening();
    window.dispatchEvent(new CustomEvent('ai-speech-ended', {}));
  }

  interrupt(): void {
    console.log('[TTSManager] 打断播放');
    this.stop();
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}

export const ttsManager = TTSManager.getInstance();