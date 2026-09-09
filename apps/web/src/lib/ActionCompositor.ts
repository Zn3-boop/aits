/**
 * ActionCompositor - 动作组合引擎
 *
 * 职责：
 * 1. 接收一批 actionId，读取注册表元数据
 * 2. 自动处理冲突：allowCombine=true 可并行，false 串行排队
 * 3. 生成标准时间轴 ActionTimelineItem[]（含淡入淡出、时间偏移）
 * 4. 同时保留实时混合模式（blendMode: add/override/mix）供 driver 直接消费
 *
 * 依赖 FULL_BASE_ACTIONS、ActionRegistry
 */

import { actionRegistry } from './ActionRegistry';
import type { BaseActionMeta, BlendMode } from './live2d-actions';

// ────────────────── 时间轴输出类型 ──────────────────

/** 时间轴单条条目，输出给 Live2DScheduler */
export interface ActionTimelineItem {
  actionId: string;
  startTime: number;
  duration: number;
  fadeIn: number;
  fadeOut: number;
}

/** 实时混合参数帧，输出给 driver.ts */
export interface CompositedParam {
  live2dParamId: string;
  value: number;
  blendMode: BlendMode;
}

export interface ActiveAction {
  action: BaseActionMeta;
  startTime: number;
  intensity: number;
}

// ────────────────── 配置 ──────────────────

interface CompositorConfig {
  randomOffsetRange: [number, number];
  defaultFadeIn: number;
  defaultFadeOut: number;
}

const DEFAULT_CONFIG: CompositorConfig = {
  randomOffsetRange: [30, 120],
  defaultFadeIn: 80,
  defaultFadeOut: 120,
};

// ────────────────── 曲线采样 ──────────────────

function sampleCurve(curve: number[], t: number): number {
  if (curve.length === 0) return 0;
  if (curve.length === 1) return curve[0];
  if (t <= 0) return curve[0];
  if (t >= 1) return curve[curve.length - 1];

  const segments = curve.length - 1;
  const segmentT = t * segments;
  const segIndex = Math.min(Math.floor(segmentT), segments - 1);
  const localT = segmentT - segIndex;

  return curve[segIndex] + (curve[segIndex + 1] - curve[segIndex]) * localT;
}

// ────────────────── 主类 ──────────────────

class ActionCompositor {
  private _activeActions: ActiveAction[] = [];
  private config: CompositorConfig;

  constructor(config?: Partial<CompositorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private getRandomOffset(): number {
    const [min, max] = this.config.randomOffsetRange;
    return Math.floor(Math.random() * (max - min) + min);
  }

  // ══════════ 实时模式：直接驱动 Live2D ══════════

  /** 激活一个动作 */
  startAction(actionId: string, intensity = 1.0): ActiveAction | null {
    const action = actionRegistry.get(actionId);
    if (!action) return null;

    const active: ActiveAction = {
      action,
      startTime: performance.now(),
      intensity: Math.max(0, Math.min(1, intensity)),
    };
    this._activeActions.push(active);
    return active;
  }

  /** 激活一个组合动作（展开为基础动作依次启动，带延迟） */
  startComposite(compositeId: string, intensity = 1.0): ActiveAction[] {
    const expanded = actionRegistry.expandComposite(compositeId);
    const results: ActiveAction[] = [];
    let delay = 0;

    for (const action of expanded) {
      const active: ActiveAction = {
        action,
        startTime: performance.now() + delay,
        intensity: Math.max(0, Math.min(1, intensity)),
      };
      this._activeActions.push(active);
      results.push(active);
      delay += action.duration * 0.6;
    }
    return results;
  }

  /** 停止一个动作 */
  stopAction(actionId: string): void {
    this._activeActions = this._activeActions.filter(a => a.action.actionId !== actionId);
  }

  /** 停止所有动作 */
  stopAll(): void {
    this._activeActions = [];
  }

  /** 停止某个分类的所有动作 */
  stopByCategory(category: string): void {
    this._activeActions = this._activeActions.filter(a => a.action.category !== category);
  }

  /** 混合模式优先级：override > mix > add */
  private _blendPriority(mode: BlendMode): number {
    switch (mode) {
      case 'override': return 3;
      case 'mix': return 2;
      case 'add': return 1;
    }
  }

  /**
   * 计算当前帧的混合参数（实时模式）
   * 返回所有需要设置的 Live2D 参数及其混合后的值
   */
  compose(): CompositedParam[] {
    const now = performance.now();
    const paramMap = new Map<string, { value: number; blendMode: BlendMode; priority: number }>();

    for (const active of this._activeActions) {
      const elapsed = now - active.startTime;
      if (elapsed < 0) continue;

      const progress = Math.min(elapsed / active.action.duration, 1);
      if (progress >= 1) continue;

      const { action, intensity } = active;

      for (const [logicalName, curve] of Object.entries(action.params)) {
        const live2dId = actionRegistry.resolveParamId(logicalName);
        const sampledValue = sampleCurve(curve, progress) * intensity;

        const existing = paramMap.get(live2dId);
        const priority = this._blendPriority(action.blendMode);

        if (!existing || priority >= existing.priority) {
          if (existing && existing.blendMode === 'add' && action.blendMode === 'add') {
            paramMap.set(live2dId, {
              value: existing.value + sampledValue,
              blendMode: 'add',
              priority,
            });
          } else if (existing && existing.blendMode === 'mix' && action.blendMode === 'mix') {
            const mixWeight = 0.5;
            paramMap.set(live2dId, {
              value: existing.value * (1 - mixWeight) + sampledValue * mixWeight,
              blendMode: 'mix',
              priority,
            });
          } else {
            paramMap.set(live2dId, {
              value: sampledValue,
              blendMode: action.blendMode,
              priority,
            });
          }
        }
      }
    }

    this._activeActions = this._activeActions.filter(a => {
      const elapsed = now - a.startTime;
      return elapsed < a.action.duration;
    });

    return Array.from(paramMap.entries()).map(([live2dParamId, { value, blendMode }]) => ({
      live2dParamId,
      value,
      blendMode,
    }));
  }

  /** 获取当前活跃的动作列表 */
  getActiveActions(): ActiveAction[] {
    return [...this._activeActions];
  }

  /** 按情绪自动启动最适配的动作 */
  triggerByEmotion(emotion: string, intensity = 0.8): ActiveAction | null {
    const actionId = actionRegistry.getBestActionForEmotion(emotion);
    if (!actionId) return null;

    const action = actionRegistry.get(actionId);
    if (!action || !action.allowCombine) {
      this.stopByCategory(action?.category || 'head');
    }

    return this.startAction(actionId, intensity);
  }

  // ══════════ 时间轴模式：输出 ActionTimelineItem[] ══════════

  /**
   * 核心合成入口（时间轴模式）
   * @param inputActionIds 输入动作ID数组（来自 SemanticActionMapper）
   * @returns 可调度的时间轴数组
   */
  composeTimeline(inputActionIds: string[]): ActionTimelineItem[] {
    const timeline: ActionTimelineItem[] = [];
    const parallelList: BaseActionMeta[] = [];
    const exclusiveList: BaseActionMeta[] = [];

    for (const id of inputActionIds) {
      const meta = actionRegistry.get(id);
      if (!meta) continue;
      if (meta.allowCombine) {
        parallelList.push(meta);
      } else {
        exclusiveList.push(meta);
      }
    }

    for (const meta of parallelList) {
      const offset = this.getRandomOffset();
      timeline.push({
        actionId: meta.actionId,
        startTime: offset,
        duration: meta.duration,
        fadeIn: this.config.defaultFadeIn,
        fadeOut: this.config.defaultFadeOut,
      });
    }

    let cursorTime = this.getMaxEndTime(timeline);
    for (const meta of exclusiveList) {
      timeline.push({
        actionId: meta.actionId,
        startTime: cursorTime,
        duration: meta.duration,
        fadeIn: this.config.defaultFadeIn,
        fadeOut: this.config.defaultFadeOut,
      });
      cursorTime += meta.duration;
    }

    timeline.sort((a, b) => a.startTime - b.startTime);
    return timeline;
  }

  private getMaxEndTime(items: ActionTimelineItem[]): number {
    if (items.length === 0) return 0;
    return Math.max(...items.map(i => i.startTime + i.duration));
  }

  /**
   * 常驻微动作生成（呼吸、微抖动，交给调度器循环播放）
   */
  buildPersistentMicroActions(microActionIds: string[]): ActionTimelineItem[] {
    return microActionIds
      .map(id => actionRegistry.get(id))
      .filter((meta): meta is BaseActionMeta => meta !== undefined)
      .map(meta => ({
        actionId: meta.actionId,
        startTime: 0,
        duration: meta.duration,
        fadeIn: 200,
        fadeOut: 200,
      }));
  }
}

export const actionCompositor = new ActionCompositor();