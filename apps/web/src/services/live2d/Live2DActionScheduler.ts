/**
 * Live2DActionScheduler - 动作参数插值调度器
 *
 * 核心职责：
 * 1. 接收 ActionTimelineItem[] 时间轴
 * 2. 结合 ActionRegistry 里动作的 params 曲线数组，做时间-值插值
 * 3. 区分主时间轴（一次性动作）和常驻微动作（循环）
 * 4. 支持淡入淡出权重混合（blendMode: add / mix / override）
 * 5. requestAnimationFrame 驱动，不阻塞 JS
 * 6. 每帧输出 Live2DParamFrame 给 driver.ts
 *
 * 与现有 Live2DScheduler（音频+口型调度）互补：
 * - 现有 Live2DScheduler 管音频播放、口型同步、微表情定时器
 * - 本 Live2DActionScheduler 管动作时间轴、参数插值、混合模式
 * - 两者可以并行运行，输出参数在 driver 层做最终合并
 */

import { actionRegistry } from '../../lib/ActionRegistry';
import type { BaseActionMeta, BlendMode } from '../../lib/live2d-actions';
import type { ActionTimelineItem } from '../../lib/ActionCompositor';

// ────────────────── 类型 ──────────────────

/** 输出给 driver.ts 的参数帧 */
export type Live2DParamFrame = Record<string, number>;

/** 带混合模式的参数帧条目 */
export interface ParamFrameEntry {
  paramName: string;
  value: number;
  blendMode: BlendMode;
  weight: number;
}

interface SchedulerInput {
  mainTimeline: ActionTimelineItem[];
  persistentMicro: ActionTimelineItem[];
}

interface SchedulerConfig {
  timeScale: number;
}

const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  timeScale: 1.0,
};

// ────────────────── 曲线采样 ──────────────────

function sampleCurve(keyFrames: number[], t: number): number {
  if (keyFrames.length === 0) return 0;
  if (keyFrames.length === 1) return keyFrames[0];
  if (t <= 0) return keyFrames[0];
  if (t >= 1) return keyFrames[keyFrames.length - 1];

  const segCount = keyFrames.length - 1;
  const segIndex = Math.min(Math.floor(t * segCount), segCount - 1);
  const segT = t * segCount - segIndex;

  return keyFrames[segIndex] + (keyFrames[segIndex + 1] - keyFrames[segIndex]) * segT;
}

// ────────────────── 主类 ──────────────────

export class Live2DActionScheduler {
  private config: SchedulerConfig;

  private mainTimeline: ActionTimelineItem[] = [];
  private persistentMicro: ActionTimelineItem[] = [];

  private startTime: number = 0;
  private isPlaying = false;
  private rafId: number | null = null;

  private onFrameCallback?: (frame: Live2DParamFrame) => void;
  private onCompleteCallback?: () => void;

  constructor(config?: Partial<SchedulerConfig>) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
  }

  /** 注册每帧回调，输出插值后的参数给 driver */
  public setFrameCallback(cb: (frame: Live2DParamFrame) => void): void {
    this.onFrameCallback = cb;
  }

  /** 注册时间轴播放完毕回调 */
  public setOnComplete(cb: () => void): void {
    this.onCompleteCallback = cb;
  }

  /** 载入一套完整时间轴，准备播放 */
  public loadTimeline(input: SchedulerInput): void {
    this.mainTimeline = [...input.mainTimeline];
    this.persistentMicro = [...input.persistentMicro];
    this.reset();
  }

  /** 只载入主时间轴（不改变常驻微动作） */
  public loadMainTimeline(timeline: ActionTimelineItem[]): void {
    this.mainTimeline = [...timeline];
    this.startTime = performance.now();
  }

  /** 更新常驻微动作 */
  public loadPersistentMicro(micro: ActionTimelineItem[]): void {
    this.persistentMicro = [...micro];
  }

  public reset(): void {
    this.stop();
    this.startTime = performance.now();
  }

  public play(): void {
    if (this.isPlaying) return;
    this.startTime = performance.now();
    this.isPlaying = true;
    this.tick();
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * 评估单条 timelineItem 的曲线插值 + 淡入淡出权重
   * @returns null 代表该动作未激活；否则返回该动作输出的参数+权重
   */
  private evalTimelineItem(
    item: ActionTimelineItem,
    elapsedMs: number
  ): { meta: BaseActionMeta; params: Record<string, number>; weight: number } | null {
    const meta = actionRegistry.get(item.actionId);
    if (!meta) return null;

    const localT = elapsedMs - item.startTime;
    if (localT < 0) return null;
    if (localT > item.duration) return null;

    const t = localT / item.duration;

    let weight = 1;
    const fadeInRatio = item.fadeIn / item.duration;
    const fadeOutRatio = item.fadeOut / item.duration;

    if (fadeInRatio > 0 && t < fadeInRatio) {
      weight = t / fadeInRatio;
    } else if (fadeOutRatio > 0 && t > 1.0 - fadeOutRatio) {
      const falloffT = (t - (1.0 - fadeOutRatio)) / fadeOutRatio;
      weight = 1 - falloffT;
    }

    weight = Math.max(0, Math.min(1, weight));

    const outParams: Record<string, number> = {};
    for (const [paramName, keyFrames] of Object.entries(meta.params)) {
      outParams[paramName] = sampleCurve(keyFrames, t);
    }

    return { meta, params: outParams, weight };
  }

  /**
   * 混合多条动作输出，支持 blendMode: add / mix / override
   */
  private blendFrames(
    itemsResult: Array<{ meta: BaseActionMeta; params: Record<string, number>; weight: number }>
  ): Live2DParamFrame {
    const output: Live2DParamFrame = {};

    for (const res of itemsResult) {
      const { meta, params, weight } = res;

      for (const [pName, pValue] of Object.entries(params)) {
        const val = pValue * weight;

        if (!(pName in output)) output[pName] = 0;

        switch (meta.blendMode) {
          case 'add':
            output[pName] += val;
            break;
          case 'mix':
            output[pName] = output[pName] * (1 - weight) + val;
            break;
          case 'override':
            output[pName] = val;
            break;
        }
      }
    }

    return output;
  }

  /** 检查主时间轴是否全部播放完毕 */
  private isMainTimelineComplete(elapsedMs: number): boolean {
    if (this.mainTimeline.length === 0) return true;
    return this.mainTimeline.every(
      item => elapsedMs >= item.startTime + item.duration
    );
  }

  private tick(): void {
    if (!this.isPlaying) return;

    const now = performance.now();
    const elapsedRaw = now - this.startTime;
    const elapsedMs = elapsedRaw * this.config.timeScale;

    // 1. 计算主时间轴所有激活条目
    const mainActive: Array<{ meta: BaseActionMeta; params: Record<string, number>; weight: number }> = [];
    for (const item of this.mainTimeline) {
      const evaled = this.evalTimelineItem(item, elapsedMs);
      if (evaled) mainActive.push(evaled);
    }

    // 2. 常驻微动作：循环播放，elapsedMs 取模 duration
    const microActive: Array<{ meta: BaseActionMeta; params: Record<string, number>; weight: number }> = [];
    for (const item of this.persistentMicro) {
      const loopElapsed = elapsedMs % Math.max(1, item.duration + item.fadeIn + item.fadeOut);
      const evaled = this.evalTimelineItem({ ...item, startTime: 0 }, loopElapsed);
      if (evaled) microActive.push(evaled);
    }

    // 3. 微动作先混合，再叠加主动作
    const microFrame = this.blendFrames(microActive);
    const mainFrame = this.blendFrames(mainActive);

    // 4. 合并两层：主动作参数覆盖叠加到微动作之上
    const finalFrame: Live2DParamFrame = { ...microFrame };
    for (const [key, value] of Object.entries(mainFrame)) {
      finalFrame[key] = (finalFrame[key] ?? 0) + value;
    }

    // 5. 回调输出给 driver.ts
    if (this.onFrameCallback) {
      this.onFrameCallback(finalFrame);
    }

    // 6. 检查主时间轴是否全部结束
    if (this.isMainTimelineComplete(elapsedMs)) {
      if (this.persistentMicro.length === 0) {
        this.isPlaying = false;
        this.onCompleteCallback?.();
        return;
      }
    }

    this.rafId = requestAnimationFrame(() => this.tick());
  }

  /** 获取当前播放进度（0~1） */
  public getProgress(): number {
    if (!this.isPlaying || this.mainTimeline.length === 0) return 0;
    const elapsed = (performance.now() - this.startTime) * this.config.timeScale;
    const maxEnd = Math.max(...this.mainTimeline.map(i => i.startTime + i.duration));
    return Math.min(elapsed / maxEnd, 1);
  }

  /** 设置时间缩放 */
  public setTimeScale(scale: number): void {
    this.config.timeScale = Math.max(0.1, scale);
  }
}

/** 全局单例 */
export const live2dActionScheduler = new Live2DActionScheduler();