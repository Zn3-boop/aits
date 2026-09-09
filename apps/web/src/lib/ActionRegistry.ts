/**
 * ActionRegistry - 动作注册表
 *
 * 从 FULL_BASE_ACTIONS + COMPOSITE_ACTIONS 构建索引，
 * 提供 O(1) 查询：按 actionId、按 category、按 emotionTag
 */

import {
  FULL_BASE_ACTIONS,
  COMPOSITE_ACTIONS,
  PARAM_LOGICAL_TO_LIVE2D,
  type BaseActionMeta,
  type CompositeActionMeta,
  type ActionCategory,
  type EmotionTag,
} from './live2d-actions';

class ActionRegistry {
  private _byId = new Map<string, BaseActionMeta>();
  private _compositeById = new Map<string, CompositeActionMeta>();
  private _byCategory = new Map<ActionCategory, BaseActionMeta[]>();
  private _byEmotion = new Map<string, BaseActionMeta[]>();
  private _allParams = new Set<string>();

  constructor() {
    this._buildIndex();
  }

  private _buildIndex(): void {
    for (const action of FULL_BASE_ACTIONS) {
      this._byId.set(action.actionId, action);

      const catList = this._byCategory.get(action.category) || [];
      catList.push(action);
      this._byCategory.set(action.category, catList);

      for (const tag of action.emotionTags) {
        const tagList = this._byEmotion.get(tag) || [];
        tagList.push(action);
        this._byEmotion.set(tag, tagList);
      }

      for (const paramKey of Object.keys(action.params)) {
        this._allParams.add(paramKey);
      }
    }

    for (const composite of COMPOSITE_ACTIONS) {
      this._compositeById.set(composite.actionId, composite);
    }
  }

  /** 按 actionId 查询基础动作 */
  get(actionId: string): BaseActionMeta | undefined {
    return this._byId.get(actionId);
  }

  /** 查询组合动作 */
  getComposite(actionId: string): CompositeActionMeta | undefined {
    return this._compositeById.get(actionId);
  }

  /** 按分类查询 */
  getByCategory(category: ActionCategory): BaseActionMeta[] {
    return this._byCategory.get(category) || [];
  }

  /** 按情绪标签查询适配的动作 */
  getByEmotion(emotion: string): BaseActionMeta[] {
    const wildcard = this._byEmotion.get('*') || [];
    const specific = this._byEmotion.get(emotion) || [];
    return [...wildcard, ...specific];
  }

  /** 获取所有基础动作 */
  getAll(): BaseActionMeta[] {
    return FULL_BASE_ACTIONS;
  }

  /** 获取所有组合动作 */
  getAllComposites(): CompositeActionMeta[] {
    return COMPOSITE_ACTIONS;
  }

  /** 将逻辑参数名解析为 Live2D 标准参数ID */
  resolveParamId(logicalName: string): string {
    return PARAM_LOGICAL_TO_LIVE2D[logicalName] || logicalName;
  }

  /** 获取所有已知逻辑参数名 */
  getAllParamNames(): string[] {
    return Array.from(this._allParams);
  }

  /** 查询某个情绪最适配的动作ID（优先选 category=head 的） */
  getBestActionForEmotion(emotion: string): string | null {
    const candidates = this.getByEmotion(emotion);
    const headAction = candidates.find(a => a.category === 'head');
    if (headAction) return headAction.actionId;
    const mouthAction = candidates.find(a => a.category === 'mouth');
    if (mouthAction) return mouthAction.actionId;
    return candidates.length > 0 ? candidates[0].actionId : null;
  }

  /** 展开组合动作为基础动作列表 */
  expandComposite(compositeId: string): BaseActionMeta[] {
    const composite = this._compositeById.get(compositeId);
    if (!composite) return [];
    return composite.actionIds
      .map(id => this._byId.get(id))
      .filter((a): a is BaseActionMeta => a !== undefined);
  }
}

export const actionRegistry = new ActionRegistry();