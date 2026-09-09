/**
 * ============================================================
 *  Emotion Timeline Sync — TTS-表情时序对齐模块
 * ============================================================
 *
 * 功能：
 * 1. 统一管理 TTS 生命周期 → 表情状态映射
 * 2. TTS 开始 → speaking 状态 + 口型 + 微表情
 * 3. TTS 结束 → listening → neutral 渐变
 * 4. 解析 LLM 返回的 [emotion:xxx] 标签，生成情绪时间轴
 * 5. 情绪切换有平滑过渡（非硬切）
 * 6. 提供 timeline 调度，支持在音频对应时间点触发表情
 *
 * 数据流：
 *   LLM stream → 文本 + [emotion:xxx] 标签
 *     ↓
 *   EmotionTimelineSync 解析并构建时间轴 entries
 *     ↓
 *   TTS 音频开始播放 → 启动 timeline 调度
 *     ↓
 *   到点触发 expressionBus.emit() → Live2D 响应
 *
 * 使用方式：
 *   import { emotionTimelineSync } from './emotionTimelineSync';
 *
 *   // 初始化
 *   emotionTimelineSync.init({
 *     live2dDriver: driver, // 或用回调方式
 *     onEmotionChange: (emotion) => { ... },
 *   });
 *
 *   // LLM 流式输出时调用
 *   emotionTimelineSync.feedLLMChunk(chunk);
 *
 *   // TTS 播放开始时同步时间轴
 *   emotionTimelineSync.syncToAudio(audioElement);
 *
 *   // 或纯文本模式（按估算语速同步）
 *   emotionTimelineSync.startTextSync(fullText, estimatedDurationMs);
 * ============================================================
 */

import { logger } from '../utils/logger';
import { expressionBus, type EmotionType } from '../features/expression-bus';

export interface TimelineEmotionEntry {
  id: string;
  startTime: number;   // 毫秒（相对音频起点）
  endTime: number;     // 毫秒
  emotion: EmotionType;
  intensity: number;
  text: string;        // 对应文本片段
  source: 'llm-tag' | 'text-analyze' | 'system';
}

export interface TimelineSyncOptions {
  /** 情绪切换过渡时间（毫秒） */
  transitionDuration?: number;
  /** 句末情绪保留时间（毫秒），过了之后渐变为 neutral */
  emotionHoldTime?: number;
  /** TTS 开始延迟（毫秒），文本生成到音频播放的滞后 */
  ttsLatencyMs?: number;
  /** 回调：情绪变化时触发 */
  onEmotionChange?: (emotion: EmotionType, intensity: number) => void;
  /** 回调：说话状态变化 */
  onSpeakingChange?: (isSpeaking: boolean) => void;
}

export class EmotionTimelineSync {
  private options: Required<Omit<TimelineSyncOptions, 'onEmotionChange' | 'onSpeakingChange'>> & {
    onEmotionChange?: TimelineSyncOptions['onEmotionChange'];
    onSpeakingChange?: TimelineSyncOptions['onSpeakingChange'];
  } = {
    transitionDuration: 300,
    emotionHoldTime: 8000,
    ttsLatencyMs: 300,
  };

  // —— 时间轴 ——
  private entries: TimelineEmotionEntry[] = [];
  private currentIndex = -1;
  private isPlaying = false;
  private startTime = 0; // performance.now() 为基准
  private pausedTime = 0;
  private totalDuration = 0;

  // —— 文本缓冲（用于流式解析标签）——
  private textBuffer = '';
  private fullText = '';
  private lastEmotion: EmotionType = 'neutral';
  private lastEmotionTime = 0;

  // —— 动画帧 ——
  private animationFrame: number | null = null;

  // —— 当前情绪状态 ——
  private currentEmotion: EmotionType = 'neutral';
  private targetEmotion: EmotionType = 'neutral';
  private currentIntensity = 0;
  private targetIntensity = 0;

  // —— 情绪重置定时器 ——
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  private speaking = false;

  // ===== 初始化 =====

  init(options: TimelineSyncOptions = {}): void {
    this.options = { ...this.options, ...options };
    this.setupGlobalListeners();
    logger.log('[EmotionTimelineSync] ✅ 时序同步模块已初始化');
  }

  private setupGlobalListeners(): void {
    if (typeof window === 'undefined') return;

    // 监听 TTS 开始/结束
    const handleSpeechStart = (e: Event) => {
      const detail = (e as CustomEvent<{ audioElement?: HTMLAudioElement; audio?: HTMLAudioElement; text?: string }>).detail;
      const audio = detail?.audioElement || detail?.audio || null;
      if (audio) {
        this.syncToAudio(audio as HTMLAudioElement);
      }
    };

    const handleSpeechEnd = () => {
      this.handleSpeechEnd();
    };

    window.addEventListener('ai-speech-started', handleSpeechStart as EventListener);
    window.addEventListener('ai-speech-ended', handleSpeechEnd as EventListener);
  }

  // ===== LLM 流式接入 =====

  /**
   * 喂入 LLM 流式 chunk，解析其中的 [emotion:xxx] 标签
   * 边生成边构建情绪时间轴
   */
  feedLLMChunk(chunk: string): {
    cleanText: string;
    newEntries: TimelineEmotionEntry[];
  } {
    this.textBuffer += chunk;
    this.fullText += chunk;

    const newEntries: TimelineEmotionEntry[] = [];

    // 正则匹配 [emotion:xxx] 标签
    let lastProcessedEnd = 0;
    const emotionRegex = /\[emotion:(\w+)\]/gi;
    let match: RegExpExecArray | null;

    while ((match = emotionRegex.exec(this.textBuffer)) !== null) {
      const emotionTag = match[1].toLowerCase();
      const emotion = this.mapEmotion(emotionTag);

      if (emotion) {
        const textSinceLast = this.textBuffer.slice(this.lastEmotionTime, match.index);
        const cleanTextSinceLast = textSinceLast.replace(/\[emotion:\w+\]/gi, '').trim();

        const startTime = this.estimateDuration(this.fullText.slice(0, match.index));

        const entry: TimelineEmotionEntry = {
          id: `emo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          startTime,
          endTime: startTime + 3000,
          emotion,
          intensity: 0.8,
          text: cleanTextSinceLast,
          source: 'llm-tag',
        };

        this.entries.push(entry);
        newEntries.push(entry);
        this.lastEmotion = emotion;
        this.lastEmotionTime = match.index + match[0].length;
        lastProcessedEnd = match.index + match[0].length;

        logger.log(`[EmotionTimelineSync] 🎭 检测到情绪标签: ${emotion} @ ${(startTime / 1000).toFixed(2)}s`);
      }
    }

    this.textBuffer = this.textBuffer.slice(Math.max(0, lastProcessedEnd));

    // 更新总时长
    this.totalDuration = this.estimateDuration(this.fullText);

    return {
      cleanText: this.textBuffer,
      newEntries,
    };
  }

  /**
   * LLM 流式结束，完成时间轴构建
   */
  finalizeLLM(): TimelineEmotionEntry[] {
    // 把最后一段文本也加上
    const remainingText = this.textBuffer;
    if (remainingText.trim() && this.entries.length > 0) {
      const lastEntry = this.entries[this.entries.length - 1];
      lastEntry.text += remainingText;
      lastEntry.endTime = this.totalDuration;
    } else if (remainingText.trim() && this.entries.length === 0) {
      // 没有任何情绪标签，加一个 neutral
      this.entries.push({
        id: `emo-neutral-${Date.now()}`,
        startTime: 0,
        endTime: this.totalDuration,
        emotion: 'neutral',
        intensity: 0.5,
        text: remainingText,
        source: 'text-analyze',
      });
    }

    // 修正每个 entry 的 endTime
    for (let i = 0; i < this.entries.length; i++) {
      if (i < this.entries.length - 1) {
        this.entries[i].endTime = this.entries[i + 1].startTime;
      } else {
        this.entries[i].endTime = this.totalDuration;
      }
    }

    logger.log(
      `[EmotionTimelineSync] ✅ 时间轴构建完成: ${this.entries.length} 个情绪节点, 总时长 ${(this.totalDuration / 1000).toFixed(1)}s`
    );

    return this.entries;
  }

  // ===== 音频同步 =====

  /**
   * 同步到音频元素的播放进度
   */
  syncToAudio(audioElement: HTMLAudioElement): void {
    if (!audioElement) return;

    this.stop();
    this.speaking = true;
    this.options.onSpeakingChange?.(true);

    // 如果还没有时间轴，根据音频时长做一个简单的
    if (this.entries.length === 0) {
      this.buildSimpleTimeline(audioElement.duration * 1000);
    }

    this.isPlaying = true;
    this.startTime = performance.now() - audioElement.currentTime * 1000;
    this.currentIndex = -1;

    this.startTimelineLoop(audioElement);
    logger.log('[EmotionTimelineSync] 🔊 已同步到音频播放');
  }

  /**
   * 纯文本模式：根据文本和估算语速同步
   */
  startTextSync(text?: string, durationMs?: number): void {
    this.stop();
    this.speaking = true;
    this.options.onSpeakingChange?.(true);

    if (text && text !== this.fullText) {
      this.fullText = text;
      this.entries = [];
    }

    const duration = durationMs || this.estimateDuration(this.fullText);

    if (this.entries.length === 0) {
      this.buildSimpleTimeline(duration);
    }

    this.totalDuration = duration;
    this.isPlaying = true;
    this.startTime = performance.now();
    this.currentIndex = -1;

    this.startTimelineLoop();
    logger.log(
      `[EmotionTimelineSync] 📝 文本同步模式启动: ${this.entries.length} 个节点, ${(duration / 1000).toFixed(1)}s`
    );
  }

  private buildSimpleTimeline(durationMs: number): void {
    // 如果没有情绪标签，只有一个 neutral entry
    this.entries = [
      {
        id: 'emo-neutral-simple',
        startTime: 0,
        endTime: durationMs,
        emotion: 'neutral',
        intensity: 0.5,
        text: this.fullText,
        source: 'system',
      },
    ];
  }

  private startTimelineLoop(audioElement?: HTMLAudioElement): void {
    const loop = () => {
      if (!this.isPlaying) return;

      let currentTime: number;
      if (audioElement && !audioElement.paused && !audioElement.ended) {
        currentTime = audioElement.currentTime * 1000;
      } else {
        currentTime = performance.now() - this.startTime;
      }

      this.updateTimeline(currentTime);

      if (audioElement?.ended || currentTime >= this.totalDuration + 500) {
        this.handleSpeechEnd();
        return;
      }

      this.animationFrame = requestAnimationFrame(loop);
    };

    this.animationFrame = requestAnimationFrame(loop);
  }

  private updateTimeline(currentTime: number): void {
    // 找到当前应该激活的情绪 entry
    let activeIndex = -1;
    for (let i = 0; i < this.entries.length; i++) {
      if (currentTime >= this.entries[i].startTime) {
        activeIndex = i;
      } else {
        break;
      }
    }

    if (activeIndex >= 0 && activeIndex !== this.currentIndex) {
      const entry = this.entries[activeIndex];
      this.currentIndex = activeIndex;
      this.triggerEmotion(entry.emotion, entry.intensity, 'timeline');
      logger.log(
        `[EmotionTimelineSync] ⏱️ 触发情绪: ${entry.emotion} @ ${(currentTime / 1000).toFixed(2)}s`
      );
    }

    // 平滑过渡强度
    this.updateTransition();
  }

  // ===== 情绪触发与过渡 =====

  private triggerEmotion(
    emotion: EmotionType,
    intensity: number,
    source: 'llm-tag' | 'text-analyze' | 'system' | 'user'
  ): void {
    this.targetEmotion = emotion;
    this.targetIntensity = intensity;

    // 通过 expressionBus 广播
    expressionBus.emit({
      emotion,
      intensity,
      source: source === 'user' ? 'user' : 'system',
      metadata: { timeline: true },
    });

    this.options.onEmotionChange?.(emotion, intensity);

    // 重置定时器（避免情绪一直不消失）
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  private updateTransition(): void {
    // 简单的线性过渡
    const transitionSpeed = 0.08; // 每帧变化量

    if (this.currentEmotion !== this.targetEmotion) {
      // 情绪切换：先淡出当前，再淡入新的
      // 简化处理：直接切换，强度用过渡
      this.currentEmotion = this.targetEmotion;
    }

    // 强度过渡
    if (this.currentIntensity < this.targetIntensity) {
      this.currentIntensity = Math.min(
        this.targetIntensity,
        this.currentIntensity + transitionSpeed
      );
    } else if (this.currentIntensity > this.targetIntensity) {
      this.currentIntensity = Math.max(
        this.targetIntensity,
        this.currentIntensity - transitionSpeed
      );
    }
  }

  // ===== 说话结束处理 =====

  private handleSpeechEnd(): void {
    if (!this.speaking) return;

    this.speaking = false;
    this.stop();

    // 切回 listening 状态
    this.triggerEmotion('listening', 0.6, 'system');

    // 3秒后渐变为 neutral
    this.resetTimer = setTimeout(() => {
      this.fadeToNeutral();
    }, 3000);

    this.options.onSpeakingChange?.(false);
    logger.log('[EmotionTimelineSync] 🎤 说话结束，切回倾听状态');
  }

  private fadeToNeutral(): void {
    this.targetEmotion = 'neutral';
    this.targetIntensity = 0.3;

    expressionBus.emit({
      emotion: 'neutral',
      intensity: 0.3,
      source: 'system',
    });

    this.options.onEmotionChange?.('neutral', 0.3);
    logger.log('[EmotionTimelineSync] 😐 情绪已渐变为 neutral');
  }

  // ===== 控制方法 =====

  stop(): void {
    this.isPlaying = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  reset(): void {
    this.stop();
    this.entries = [];
    this.textBuffer = '';
    this.fullText = '';
    this.currentIndex = -1;
    this.lastEmotion = 'neutral';
    this.lastEmotionTime = 0;
    this.currentEmotion = 'neutral';
    this.targetEmotion = 'neutral';
    this.currentIntensity = 0;
    this.targetIntensity = 0;

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  pause(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.pausedTime = performance.now() - this.startTime;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  resume(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.startTime = performance.now() - this.pausedTime;
    this.startTimelineLoop();
  }

  /**
   * 手动触发一个情绪（外部控制用）
   */
  setEmotion(emotion: EmotionType, intensity = 0.8): void {
    this.triggerEmotion(emotion, intensity, 'system');
  }

  // ===== 工具函数 =====

  /**
   * 估算文本对应的音频时长（毫秒）
   * 中文：约 4.5 字/秒
   * 英文：约 13 词/秒
   */
  private estimateDuration(text: string): number {
    if (!text) return 1000;

    // 统计中文字符
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    // 统计英文单词数
    const englishWords = text
      .replace(/[\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    // 标点符号也算停顿（每个标点 +50ms）
    const punctuationCount = (text.match(/[，。！？、；：,.!?]/g) || []).length;

    const chineseSeconds = chineseChars / 4.5;
    const englishSeconds = englishWords / 13;
    const punctuationSeconds = punctuationCount * 0.05;

    return (chineseSeconds + englishSeconds + punctuationSeconds) * 1000;
  }

  /**
   * 情绪名称映射（兼容各种写法）
   */
  private mapEmotion(tag: string): EmotionType | null {
    const map: Record<string, EmotionType> = {
      happy: 'happy',
      joy: 'happy',
      glad: 'happy',
      开心: 'happy',
      高兴: 'happy',
      sad: 'sad',
      sorrow: 'sad',
      难过: 'sad',
      伤心: 'sad',
      angry: 'angry',
      anger: 'angry',
      mad: 'angry',
      生气: 'angry',
      愤怒: 'angry',
      surprised: 'surprised',
      surprise: 'surprised',
      shocked: 'surprised',
      惊讶: 'surprised',
      吃惊: 'surprised',
      fearful: 'fearful',
      afraid: 'fearful',
      scared: 'fearful',
      害怕: 'fearful',
      恐惧: 'fearful',
      disgusted: 'disgusted',
      disgust: 'disgusted',
      恶心: 'disgusted',
      讨厌: 'disgusted',
      neutral: 'neutral',
      calm: 'neutral',
      中性: 'neutral',
      平静: 'neutral',
      shy: 'shy',
      害羞: 'shy',
      羞涩: 'shy',
      warm: 'warm',
      gentle: 'warm',
      温暖: 'warm',
      温柔: 'warm',
      tsundere: 'tsundere',
      傲娇: 'tsundere',
      concerned: 'concerned',
      worried: 'concerned',
      担忧: 'concerned',
      关心: 'concerned',
      sleepy: 'sleepy',
      tired: 'sleepy',
      困: 'sleepy',
      累: 'sleepy',
      疲惫: 'sleepy',
      thinking: 'thinking',
      thought: 'thinking',
      思考: 'thinking',
      想: 'thinking',
      listening: 'listening',
      倾听: 'listening',
      听: 'listening',
      speaking: 'speaking',
      说话: 'speaking',
      说: 'speaking',
    };

    return map[tag.toLowerCase()] || null;
  }

  // ===== 状态查询 =====

  getCurrentEmotion(): EmotionType {
    return this.currentEmotion;
  }

  getCurrentIntensity(): number {
    return this.currentIntensity;
  }

  getTimelineEntries(): TimelineEmotionEntry[] {
    return [...this.entries];
  }

  isSpeakingState(): boolean {
    return this.speaking;
  }

  getTotalDuration(): number {
    return this.totalDuration;
  }

  destroy(): void {
    this.stop();
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }
}

// 单例
export const emotionTimelineSync = new EmotionTimelineSync();