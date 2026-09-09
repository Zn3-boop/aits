/**
 * ============================================================
 *  LipSync Enhancer — 口型同步增强模块
 * ============================================================
 *
 * 功能：
 * 1. 基于音频频谱分析，同时驱动嘴巴开合 (MouthOpenY) 和嘴型形状 (MouthForm)
 * 2. 支持5种基本嘴型：A(大开口) / I(咧开) / U(圆唇) / E(扁口) / O(圆张)
 * 3. 修复TTS事件对接：监听 ai-speech-started / ended，确保口型真的驱动
 * 4. 静音 fallback：即使没有音频分析器，也能根据文本长度模拟自然口型节奏
 * 5. 平滑处理 + 噪音过滤，避免嘴型抖动
 *
 * 使用方式：
 *   import { lipSyncEnhancer } from './lipSyncEnhancer';
 *
 *   // 初始化（只需一次）
 *   lipSyncEnhancer.init({
 *     onMouthUpdate: (openY, form, shape) => {
 *       live2dDriver.setMouthOpen(openY);
 *       live2dDriver.setOverrideParam('ParamMouthForm', form);
 *     },
 *   });
 *
 *   // TTS 播放开始时调用（或监听 ai-speech-started 事件）
 *   lipSyncEnhancer.start(audioElement);
 *
 *   // 静音模式下模拟口型
 *   lipSyncEnhancer.startSilentSimulation(text, durationMs);
 * ============================================================
 */

import { logger } from '../../utils/logger';

export type MouthShape = 'A' | 'I' | 'U' | 'E' | 'O' | 'closed';

export interface LipSyncEnhancerOptions {
  /** 口型更新回调，每帧调用 */
  onMouthUpdate?: (openY: number, form: number, shape: MouthShape) => void;
  /** 平滑系数 (0-1)，越大越跟手但可能抖 */
  smoothing?: number;
  /** 开口阈值，低于此值视为闭嘴 */
  openThreshold?: number;
  /** 静音检测阈值 (0-255) */
  silenceThreshold?: number;
}

export class LipSyncEnhancer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private animationFrame: number | null = null;
  private isActive = false;

  private currentOpenY = 0;
  private currentForm = 0;
  private currentShape: MouthShape = 'closed';

  private options: Required<Omit<LipSyncEnhancerOptions, 'onMouthUpdate'>> & {
    onMouthUpdate?: LipSyncEnhancerOptions['onMouthUpdate'];
  } = {
    smoothing: 0.45,
    openThreshold: 0.08,
    silenceThreshold: 12,
  };

  private connectedElements = new WeakSet<HTMLAudioElement>();
  private currentAudio: HTMLAudioElement | null = null;

  // —— 静音模拟模式 ——
  private silentMode = false;
  private silentStartTime = 0;
  private silentDuration = 0;
  private silentText = '';
  private silentSyllables: number[] = []; // 每个音节的时间点 (ms)

  constructor() {
    this.setupGlobalListeners();
  }

  // ===== 初始化 =====

  init(options: LipSyncEnhancerOptions = {}): void {
    this.options = { ...this.options, ...options };
    logger.log('[LipSyncEnhancer] ✅ 已初始化');
  }

  /**
   * 监听全局 TTS 事件，自动对接口型
   * 兼容：ai-speech-started / ai-speech-ended / lipsync-start / lipsync-stop
   */
  private setupGlobalListeners(): void {
    if (typeof window === 'undefined') return;

    const handleSpeechStart = (e: Event) => {
      const customEvent = e as CustomEvent<{ audioElement?: HTMLAudioElement; audio?: HTMLAudioElement }>;
      const audioEl = customEvent.detail?.audioElement || customEvent.detail?.audio || null;
      if (audioEl) {
        this.start(audioEl as HTMLAudioElement).catch((err) => {
          logger.warn('[LipSyncEnhancer] 口型启动失败，降级到静音模拟:', err);
        });
      }
    };

    const handleSpeechEnd = () => {
      this.stop();
    };

    const handleLipSyncStart = (e: Event) => {
      const detail = (e as CustomEvent<{ wordBoundaries?: Array<{ offset_ms: number }> }>).detail;
      // 如果传了 wordBoundaries，也可以利用起来增强节奏
      if (detail?.wordBoundaries?.length) {
        logger.log(`[LipSyncEnhancer] 收到 ${detail.wordBoundaries.length} 个词边界`);
      }
    };

    window.addEventListener('ai-speech-started', handleSpeechStart as EventListener);
    window.addEventListener('ai-speech-ended', handleSpeechEnd as EventListener);
    window.addEventListener('lipsync-start', handleLipSyncStart as EventListener);
    window.addEventListener('lipsync-stop', handleSpeechEnd as EventListener);
  }

  // ===== 音频分析模式 =====

  async start(audioElement: HTMLAudioElement): Promise<void> {
    if (!audioElement) {
      logger.warn('[LipSyncEnhancer] audioElement 为空，跳过');
      return;
    }

    this.stop(); // 先停掉上一个
    this.silentMode = false;
    this.currentAudio = audioElement;

    // 创建 AudioContext
    if (!this.audioContext) {
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        logger.warn('[LipSyncEnhancer] 浏览器不支持 AudioContext，降级到静音模拟');
        this.startSilentFallback(audioElement);
        return;
      }
      this.audioContext = new AudioContextCtor();
    }

    // 确保处于运行状态
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch {
        logger.warn('[LipSyncEnhancer] AudioContext resume 失败');
      }
    }

    // 连接音频源（避免重复连接）
    if (!this.connectedElements.has(audioElement)) {
      try {
        this.sourceNode = this.audioContext.createMediaElementSource(audioElement);
        this.connectedElements.add(audioElement);
      } catch (error) {
        logger.warn('[LipSyncEnhancer] 创建音频源失败，可能已连接:', error);
      }
    }

    if (!this.analyser) {
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512; // 更高分辨率，用于嘴型分析
      this.analyser.smoothingTimeConstant = 0.6;
    }

    // 连接节点
    if (this.sourceNode) {
      try {
        this.sourceNode.connect(this.analyser);
      } catch {
        // 可能已经连接过，忽略
      }
    }
    try {
      this.analyser.connect(this.audioContext.destination);
    } catch {
      // 忽略
    }

    this.isActive = true;
    this.startFrameLoop();
    logger.log('[LipSyncEnhancer] 🎙️ 口型同步已启动（音频分析模式）');
  }

  private startFrameLoop(): void {
    const update = () => {
      if (!this.isActive || !this.analyser) return;

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      this.analyser.getByteFrequencyData(dataArray);

      // —— 计算开口度 ——
      // 人声频段大致在 80-1000Hz，取前几个 bin 的能量
      const sampleRate = this.audioContext?.sampleRate || 44100;
      const binHz = sampleRate / this.analyser.fftSize;
      const voiceEndBin = Math.min(Math.floor(1000 / binHz), bufferLength - 1);
      const bassEndBin = Math.min(Math.floor(200 / binHz), voiceEndBin);
      const midStartBin = bassEndBin + 1;

      let bassEnergy = 0;
      let midEnergy = 0;
      let highEnergy = 0;

      for (let i = 0; i <= bassEndBin; i++) bassEnergy += dataArray[i];
      bassEnergy /= bassEndBin + 1;

      for (let i = midStartBin; i <= voiceEndBin; i++) midEnergy += dataArray[i];
      midEnergy /= voiceEndBin - midStartBin + 1;

      // 高频段（用于判断嘴型）
      const highStartBin = voiceEndBin + 1;
      const highEndBin = Math.min(Math.floor(3000 / binHz), bufferLength - 1);
      if (highEndBin > highStartBin) {
        for (let i = highStartBin; i <= highEndBin; i++) highEnergy += dataArray[i];
        highEnergy /= highEndBin - highStartBin + 1;
      }

      const totalEnergy = (bassEnergy + midEnergy) / 2;

      // —— 开口度 ——
      let openY = Math.min(totalEnergy / 70, 1.0);
      openY = Math.max(0, openY);

      // 低于阈值视为闭嘴（防止噪音抖动）
      if (totalEnergy < this.options.silenceThreshold) {
        openY = 0;
      }

      // —— 嘴型形状推断 ——
      // 原理：不同元音的频谱特征不同
      // 低频强 → 圆唇 (O/U)，中频强 → 开口大 (A)，高频强 → 扁嘴 (I/E)
      const bassRatio = bassEnergy / (totalEnergy + 1);
      const midRatio = midEnergy / (totalEnergy + 1);
      const highRatio = highEnergy / (totalEnergy + 1);

      let form = 0; // MouthForm: -1=抿嘴/扁, 0=中性, 1=圆唇
      let shape: MouthShape = 'closed';

      if (openY > this.options.openThreshold) {
        if (bassRatio > 0.55 && openY < 0.6) {
          shape = 'U';
          form = 0.6; // 圆唇
        } else if (bassRatio > 0.45 && openY >= 0.6) {
          shape = 'O';
          form = 0.4;
        } else if (highRatio > 0.35 && openY < 0.5) {
          shape = 'I';
          form = -0.5; // 咧开/扁嘴
        } else if (midRatio > 0.4 && openY >= 0.5) {
          shape = 'A';
          form = 0.2; // 大开口
        } else if (highRatio > 0.3 && openY >= 0.4) {
          shape = 'E';
          form = -0.3;
        } else {
          shape = 'A';
          form = 0.1;
        }
      } else {
        shape = 'closed';
        form = 0;
      }

      // —— 平滑 ——
      const smoothFactor = this.options.smoothing;
      this.currentOpenY = this.currentOpenY * (1 - smoothFactor) + openY * smoothFactor;
      this.currentForm = this.currentForm * (1 - smoothFactor) + form * smoothFactor;

      if (openY < 0.02) {
        this.currentShape = 'closed';
      } else {
        this.currentShape = shape;
      }

      // —— 回调 ——
      this.options.onMouthUpdate?.(this.currentOpenY, this.currentForm, this.currentShape);

      // —— 检查是否已结束 ——
      if (this.currentAudio?.ended) {
        this.stop();
        return;
      }

      this.animationFrame = requestAnimationFrame(update);
    };

    this.animationFrame = requestAnimationFrame(update);
  }

  // ===== 静音模拟模式 =====
  // 当没有音频分析器或音频无法连接时，根据文本长度模拟自然口型

  /**
   * 启动静音模式口型模拟
   * @param text 文本内容，用于估算音节数量
   * @param durationMs 预计持续时间（毫秒），不传则自动估算
   */
  startSilentSimulation(text: string, durationMs?: number): void {
    this.stop();
    this.silentMode = true;
    this.silentText = text;
    this.silentStartTime = performance.now();

    // 估算时长：中文约 4-5 字/秒，英文约 12-15 词/秒
    if (!durationMs) {
      const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
      const englishWords = text.split(/\s+/).filter((w) => w.length > 0).length;
      const estimatedSeconds = chineseChars / 4.5 + englishWords / 12;
      durationMs = Math.max(800, estimatedSeconds * 1000);
    }
    this.silentDuration = durationMs;

    // 生成音节节奏（模拟自然说话的起伏）
    this.silentSyllables = this.generateSyllablePattern(text, durationMs);

    this.isActive = true;
    this.startSilentFrameLoop();
    logger.log(
      `[LipSyncEnhancer] 🤫 静音模拟模式启动: ${text.length}字, ${(durationMs / 1000).toFixed(1)}秒, ${this.silentSyllables.length}个音节`
    );
  }

  /**
   * 生成音节时间序列 — 模拟自然说话的口型节奏
   * 算法：
   * - 短文本用均匀分布 + 随机扰动
   * - 长文本用"词组分组"模式，每组有强弱变化
   * - 句末自然收束（开口度逐渐减小）
   */
  private generateSyllablePattern(text: string, durationMs: number): number[] {
    const syllables: number[] = [];

    // 估算音节数（中文按字数×0.7，英文按单词数）
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const totalSyllables = Math.max(3, Math.floor(chineseChars * 0.7 + text.split(/\s+/).length * 0.3));

    const avgInterval = durationMs / (totalSyllables + 1);

    let currentTime = avgInterval * 0.5; // 起始有个小延迟
    for (let i = 0; i < totalSyllables; i++) {
      // 每个音节的时间点，加入 ±25% 的随机扰动
      const jitter = (Math.random() - 0.5) * 0.5 * avgInterval;
      currentTime += avgInterval + jitter;
      if (currentTime < durationMs - 100) {
        syllables.push(currentTime);
      }
    }

    return syllables;
  }

  private startSilentFrameLoop(): void {
    const update = () => {
      if (!this.isActive || !this.silentMode) return;

      const elapsed = performance.now() - this.silentStartTime;
      const progress = Math.min(elapsed / this.silentDuration, 1);

      // 找到当前最近的音节
      let nearestSyllableDist = Infinity;
      let nearestIndex = -1;
      for (let i = 0; i < this.silentSyllables.length; i++) {
        const dist = Math.abs(elapsed - this.silentSyllables[i]);
        if (dist < nearestSyllableDist) {
          nearestSyllableDist = dist;
          nearestIndex = i;
        }
      }

      // 根据距离音节中心的远近计算开口度（钟形曲线）
      const syllableWindow = 180; // 每个音节口型持续约 180ms
      let openY = 0;
      let form = 0;

      if (nearestIndex >= 0 && nearestSyllableDist < syllableWindow) {
        const t = nearestSyllableDist / syllableWindow;
        // 钟形曲线：中心最大，两端衰减
        const bell = Math.exp(-t * t * 4);
        // 基础开口度 0.4-0.8 随机变化
        const baseOpen = 0.45 + 0.35 * Math.sin(nearestIndex * 1.7 + 0.3);
        openY = baseOpen * bell;

        // 嘴型形状随机变化，模拟不同元音
        const shapePhase = (nearestIndex * 0.7 + progress * 3) % 1;
        form = Math.sin(shapePhase * Math.PI * 2) * 0.4;
      }

      // 句末收束：最后 20% 时间开口度逐渐减小
      if (progress > 0.8) {
        const tailFactor = 1 - (progress - 0.8) / 0.2;
        openY *= tailFactor;
      }

      // 句首延迟：前 10% 渐入
      if (progress < 0.1) {
        openY *= progress / 0.1;
      }

      // 平滑
      const smoothFactor = 0.35;
      this.currentOpenY = this.currentOpenY * (1 - smoothFactor) + openY * smoothFactor;
      this.currentForm = this.currentForm * (1 - smoothFactor) + form * smoothFactor;

      // 推断嘴型形状
      if (this.currentOpenY < this.options.openThreshold) {
        this.currentShape = 'closed';
      } else if (this.currentForm > 0.3) {
        this.currentShape = this.currentOpenY > 0.5 ? 'O' : 'U';
      } else if (this.currentForm < -0.2) {
        this.currentShape = this.currentOpenY > 0.4 ? 'E' : 'I';
      } else {
        this.currentShape = 'A';
      }

      this.options.onMouthUpdate?.(this.currentOpenY, this.currentForm, this.currentShape);

      if (progress >= 1) {
        // 自然收尾：闭嘴
        this.currentOpenY = Math.max(0, this.currentOpenY - 0.05);
        if (this.currentOpenY < 0.01) {
          this.stop();
          return;
        }
      }

      this.animationFrame = requestAnimationFrame(update);
    };

    this.animationFrame = requestAnimationFrame(update);
  }

  private startSilentFallback(audioElement: HTMLAudioElement): void {
    // 尝试从 audio 元素获取时长和文本（如果有 data-text 属性）
    const text = audioElement.dataset.text || '正在说话';
    const duration = audioElement.duration ? audioElement.duration * 1000 : undefined;
    this.startSilentSimulation(text, duration);
  }

  /**
   * 设置口型更新回调（兼容旧 API）
   * @deprecated 使用 init({ onMouthUpdate }) 代替
   */
  setOnMouthUpdate(callback: (value: number) => void): void {
    this.options.onMouthUpdate = (openY, _form, _shape) => {
      callback(openY);
    };
    logger.log('[LipSyncEnhancer] setOnMouthUpdate 已设置');
  }

  // ===== 控制方法 =====

  stop(): void {
    this.isActive = false;
    this.silentMode = false;

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    // 平滑闭嘴
    this.currentOpenY = 0;
    this.currentForm = 0;
    this.currentShape = 'closed';
    this.options.onMouthUpdate?.(0, 0, 'closed');
  }

  getIsActive(): boolean {
    return this.isActive;
  }

  getCurrentOpenY(): number {
    return this.currentOpenY;
  }

  getCurrentForm(): number {
    return this.currentForm;
  }

  getCurrentShape(): MouthShape {
    return this.currentShape;
  }

  /**
   * 直接设置口型（外部强制控制用）
   */
  setMouth(openY: number, form = 0, shape: MouthShape = 'A'): void {
    this.currentOpenY = Math.max(0, Math.min(1, openY));
    this.currentForm = Math.max(-1, Math.min(1, form));
    this.currentShape = shape;
    this.options.onMouthUpdate?.(this.currentOpenY, this.currentForm, this.currentShape);
  }

  destroy(): void {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close().catch(() => {
        /* ignore */
      });
      this.audioContext = null;
    }
    this.analyser = null;
    this.sourceNode = null;
    this.currentAudio = null;
  }
}

// 单例
export const lipSyncEnhancer = new LipSyncEnhancer();
export const lipSyncController = lipSyncEnhancer;