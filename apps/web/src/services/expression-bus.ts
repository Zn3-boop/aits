/**
 * Expression Bus - 表情同步总线（含时间轴调度）
 *
 * 使用 EventEmitter 模式，让表情变化可以广播给 Live2D 模型
 * 支持多种表情源：LLM 回复、用户语音情感、MediaPipe 面部追踪、时间轴
 *
 * 同时发送 CustomEvent 以兼容 Live2DPage 的现有事件监听
 */

export type EmotionType =
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'fearful'
  | 'disgusted'
  | 'neutral'
  | 'speaking'
  | 'listening'
  | 'thinking'
  | 'bored'
  | 'tired'
  | 'confused'
  | 'embarrassed'
  | 'talking'
  | 'warm'
  | 'shy'
  | 'tsundere'
  | 'concerned'
  | 'sleepy'
  | 'excited'
  | 'relieved'
  | 'frustrated'
  | 'nostalgic'
  | 'curious'
  | 'apologetic'
  | 'proud';

export interface ExpressionEvent {
  emotion: EmotionType;
  intensity: number;
  source: 'llm' | 'user' | 'mediapipe' | 'system' | 'timeline';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ExpressionBlend {
  emotion: EmotionType;
  weight: number;
}

// ========== Timeline 类型定义 ==========

export interface TimelineEntry {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  emotion: EmotionType;
  action?: string;
  intensity?: number;
}

export type TimelineEventType =
  | 'timeline_start'
  | 'timeline_tick'
  | 'timeline_entry'
  | 'timeline_end'
  | 'timeline_pause'
  | 'timeline_resume';

export interface TimelineEvent {
  type: TimelineEventType;
  currentTime: number;
  entry?: TimelineEntry;
  entries?: TimelineEntry[];
}

export interface TimelineState {
  entries: TimelineEntry[];
  currentTime: number;
  currentIndex: number;
  isPlaying: boolean;
  isPaused: boolean;
  startTimestamp: number | null;
  totalDuration: number;
}

class ExpressionBus {
  private listeners: Map<string, Set<(event: ExpressionEvent) => void>> = new Map();
  private currentExpression: ExpressionEvent | null = null;
  private blendQueue: ExpressionBlend[] = [];
  private blendTimer: ReturnType<typeof setInterval> | null = null;
  private readonly DEFAULT_INTENSITY = 0.8;
  private readonly BLEND_INTERVAL = 50;
  private readonly DECAY_RATE = 0.05;

  private timeline: TimelineEntry[] = [];
  private timelineState: TimelineState = {
    entries: [],
    currentTime: 0,
    currentIndex: -1,
    isPlaying: false,
    isPaused: false,
    startTimestamp: null,
    totalDuration: 0,
  };
  private timelineRafId: number | null = null;
  private timelineListeners: Set<(event: TimelineEvent) => void> = new Set();
  private lastTickTime: number = 0;
  private readonly STALE_ENTRY_THRESHOLD = 800;

  constructor() {
    this.startBlendLoop();
  }

  emit(event: Omit<ExpressionEvent, 'timestamp'>): void {
    const fullEvent: ExpressionEvent = {
      ...event,
      timestamp: Date.now(),
      intensity: event.intensity ?? this.DEFAULT_INTENSITY,
    };

    this.currentExpression = fullEvent;

    const emotionListeners = this.listeners.get(event.emotion);
    if (emotionListeners) {
      emotionListeners.forEach(listener => listener(fullEvent));
    }

    const allListeners = this.listeners.get('*');
    if (allListeners) {
      allListeners.forEach(listener => listener(fullEvent));
    }

    this.dispatchLive2DEvent(fullEvent);
    this.addToBlendQueue(event.emotion, fullEvent.intensity);
  }

  private dispatchLive2DEvent(event: ExpressionEvent): void {
    if (typeof window === 'undefined') return;

    switch (event.source) {
      case 'llm':
        window.dispatchEvent(new CustomEvent('ai-emotion-change', {
          detail: { emotion: event.emotion, confidence: event.intensity }
        }));
        break;
      case 'user':
      case 'mediapipe':
        window.dispatchEvent(new CustomEvent('user-emotion-detected', {
          detail: { emotion: event.emotion, confidence: event.intensity, source: event.source }
        }));
        break;
      case 'system':
      case 'timeline':
        if (event.emotion === 'speaking' || event.emotion === 'listening' || event.emotion === 'thinking') {
          window.dispatchEvent(new CustomEvent('ai-emotion-change', {
            detail: { emotion: event.emotion, confidence: event.intensity }
          }));
        } else {
          window.dispatchEvent(new CustomEvent('ai-emotion-change', {
            detail: { emotion: event.emotion, confidence: event.intensity, source: event.source }
          }));
        }
        break;
    }
  }

  quickExpression(emotion: EmotionType, source: ExpressionEvent['source'], metadata?: Record<string, unknown>): void {
    this.emit({ emotion, intensity: 1.0, source, metadata });

    setTimeout(() => {
      if (this.currentExpression?.emotion === emotion) {
        this.emit({ emotion: 'neutral', intensity: 0.5, source: 'system' });
      }
    }, 3000);
  }

  speaking(metadata?: Record<string, unknown>): void {
    this.emit({ emotion: 'speaking', intensity: 1.0, source: 'system', metadata });
  }

  listening(): void {
    this.emit({ emotion: 'listening', intensity: 0.6, source: 'system' });
  }

  thinking(): void {
    this.emit({ emotion: 'thinking', intensity: 0.5, source: 'system' });
  }

  fromLLM(emotion: EmotionType, intensity?: number): void {
    this.emit({ emotion, intensity: intensity ?? this.DEFAULT_INTENSITY, source: 'llm' });
  }

  fromUserEmotion(emotion: EmotionType, intensity?: number): void {
    this.emit({
      emotion,
      intensity: (intensity ?? this.DEFAULT_INTENSITY) * 0.6,
      source: 'user'
    });
  }

  fromMediaPipe(emotion: EmotionType, intensity?: number): void {
    this.emit({
      emotion,
      intensity: (intensity ?? this.DEFAULT_INTENSITY) * 0.3,
      source: 'mediapipe'
    });
  }

  on(emotion: EmotionType | '*', callback: (event: ExpressionEvent) => void): () => void {
    if (!this.listeners.has(emotion)) {
      this.listeners.set(emotion, new Set());
    }
    this.listeners.get(emotion)!.add(callback);

    return () => {
      this.listeners.get(emotion)?.delete(callback);
    };
  }

  off(emotion: EmotionType | '*', callback: (event: ExpressionEvent) => void): void {
    this.listeners.get(emotion)?.delete(callback);
  }

  getCurrentExpression(): ExpressionEvent | null {
    return this.currentExpression;
  }

  getBlendQueue(): ExpressionBlend[] {
    return [...this.blendQueue];
  }

  // ========== Timeline 调度 API ==========

  loadTimeline(entries: TimelineEntry[]): void {
    this.stopTimeline();
    this.timeline = [...entries];
    this.timelineState = {
      entries: this.timeline,
      currentTime: 0,
      currentIndex: -1,
      isPlaying: false,
      isPaused: false,
      startTimestamp: null,
      totalDuration: entries.length > 0 ? entries[entries.length - 1].endTime : 0,
    };

    this._emitTimelineEvent({
      type: 'timeline_start',
      currentTime: 0,
      entries: this.timeline,
    });
  }

  startTimeline(offsetMs: number = 0): void {
    if (this.timeline.length === 0) return;

    if (this.timelineRafId !== null) {
      cancelAnimationFrame(this.timelineRafId);
      this.timelineRafId = null;
    }

    this.timelineState.isPlaying = true;
    this.timelineState.isPaused = false;
    this.timelineState.startTimestamp = Date.now() - offsetMs;
    this.timelineState.currentTime = offsetMs;
    this.lastTickTime = performance.now();

    this._checkEntriesAt(offsetMs);
    this._scheduleTick();
  }

  pauseTimeline(): void {
    if (!this.timelineState.isPlaying || this.timelineState.isPaused) return;
    this.timelineState.isPaused = true;
    if (this.timelineRafId !== null) {
      cancelAnimationFrame(this.timelineRafId);
      this.timelineRafId = null;
    }
    this._emitTimelineEvent({
      type: 'timeline_pause',
      currentTime: this.timelineState.currentTime,
    });
  }

  resumeTimeline(): void {
    if (!this.timelineState.isPlaying || !this.timelineState.isPaused) return;
    this.timelineState.isPaused = false;
    this.timelineState.startTimestamp = Date.now() - this.timelineState.currentTime;
    this.lastTickTime = performance.now();
    this._scheduleTick();
    this._emitTimelineEvent({
      type: 'timeline_resume',
      currentTime: this.timelineState.currentTime,
    });
  }

  stopTimeline(): void {
    if (this.timelineRafId !== null) {
      cancelAnimationFrame(this.timelineRafId);
      this.timelineRafId = null;
    }
    if (this.timelineState.isPlaying) {
      this._emitTimelineEvent({
        type: 'timeline_end',
        currentTime: this.timelineState.currentTime,
      });
    }
    this.timelineState.isPlaying = false;
    this.timelineState.isPaused = false;
    this.timelineState.currentIndex = -1;
    this.timelineState.currentTime = 0;
  }

  getTimelineState(): TimelineState {
    return { ...this.timelineState };
  }

  onTimeline(callback: (event: TimelineEvent) => void): () => void {
    this.timelineListeners.add(callback);
    return () => this.timelineListeners.delete(callback);
  }

  syncTimelineTime(elapsedMs: number): void {
    if (!this.timelineState.isPlaying) return;
    this.timelineState.currentTime = elapsedMs;
    this.timelineState.startTimestamp = Date.now() - elapsedMs;
    this._checkEntriesAt(elapsedMs);
  }

  // ========== Timeline 内部方法 ==========

  private _scheduleTick(): void {
    const tick = (now: number) => {
      if (!this.timelineState.isPlaying || this.timelineState.isPaused) return;

      const dt = now - this.lastTickTime;
      this.lastTickTime = now;
      this.timelineState.currentTime += dt;

      this._checkEntriesAt(this.timelineState.currentTime);

      this._emitTimelineEvent({
        type: 'timeline_tick',
        currentTime: this.timelineState.currentTime,
      });

      if (this.timelineState.currentTime >= this.timelineState.totalDuration) {
        this._emitTimelineEvent({
          type: 'timeline_end',
          currentTime: this.timelineState.currentTime,
        });
        this.timelineState.isPlaying = false;
        this.timelineRafId = null;
        return;
      }

      this.timelineRafId = requestAnimationFrame(tick);
    };

    this.timelineRafId = requestAnimationFrame(tick);
  }

  private _checkEntriesAt(currentTime: number): void {
    for (let i = this.timelineState.currentIndex + 1; i < this.timeline.length; i++) {
      const entry = this.timeline[i];
      if (entry.startTime <= currentTime) {
        this.timelineState.currentIndex = i;

        const staleMs = currentTime - entry.startTime;
        if (staleMs > this.STALE_ENTRY_THRESHOLD) {
          continue;
        }

        this.emit({
          emotion: entry.emotion,
          intensity: entry.intensity ?? this.DEFAULT_INTENSITY,
          source: 'timeline',
          metadata: {
            timelineEntry: entry,
            staleMs: staleMs > 0 ? staleMs : 0,
          },
        });

        this._emitTimelineEvent({
          type: 'timeline_entry',
          currentTime,
          entry,
        });
      } else {
        break;
      }
    }
  }

  private _emitTimelineEvent(event: TimelineEvent): void {
    this.timelineListeners.forEach(cb => {
      try { cb(event); } catch { /* ignore */ }
    });
  }

  // ========== 内部方法 ==========

  private addToBlendQueue(emotion: EmotionType, weight: number): void {
    const existing = this.blendQueue.find(b => b.emotion === emotion);
    if (existing) {
      existing.weight = Math.min(1, weight);
    } else {
      this.blendQueue.push({ emotion, weight });
    }
  }

  private startBlendLoop(): void {
    this.blendTimer = setInterval(() => {
      if (this.blendQueue.length === 0) return;

      this.blendQueue = this.blendQueue
        .map(b => ({ ...b, weight: Math.max(0, b.weight - this.DECAY_RATE) }))
        .filter(b => b.weight > 0.01);

      const blendListeners = this.listeners.get('__blend__');
      if (blendListeners) {
        const blend = this.getBlendQueue();
        blendListeners.forEach(listener => {
          listener({
            emotion: 'neutral',
            intensity: 1,
            source: 'system',
            timestamp: Date.now(),
            metadata: { blend },
          } as ExpressionEvent);
        });
      }
    }, this.BLEND_INTERVAL);
  }

  destroy(): void {
    this.stopTimeline();

    if (this.blendTimer) {
      clearInterval(this.blendTimer);
      this.blendTimer = null;
    }
    this.listeners.clear();
    this.blendQueue = [];
    this.timelineListeners.clear();
    this.timeline = [];
  }
}

export const expressionBus = new ExpressionBus();