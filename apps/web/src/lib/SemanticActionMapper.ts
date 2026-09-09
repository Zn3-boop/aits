/**
 * SemanticActionMapper - 语义动作映射器（模型无关版）
 *
 * 核心设计：
 * 1. 抽象 IActionLlmProvider 接口，Ollama 只是其中一个实现
 * 2. 复用现有 SemanticEmotionAnalyzer 做规则分析
 * 3. 人脸情绪做加权融合
 * 4. 严格校验 actionId，杜绝 LLM 幻觉
 * 5. 配置开关控制是否开启 LLM 增强
 */

import { FULL_BASE_ACTIONS, type BaseActionMeta } from './live2d-actions';
import { actionCompositor } from './ActionCompositor';
import { SemanticEmotionAnalyzer } from '../services/multimodal/SemanticEmotionAnalyzer';
import type { EmotionType as _EmotionType } from '../services/multimodal/MultimodalEmotionFusion';

// ────────────────── 类型定义 ──────────────────

/** 人脸输入：来自 FaceMesh 识别输出 */
export interface FaceEmotionInput {
  emotion: string;
  weight: number;
}

/** LLM 动作生成器抽象接口，不绑定任何具体模型 */
export interface IActionLlmProvider {
  /**
   * @param context 对话上下文
   * @param faceEmotion 当前人脸情绪
   * @param availableActionIds 允许使用的动作ID全集（防止幻觉）
   * @returns 返回挑选出来的 actionId 数组
   */
  generateActionIds(
    context: string,
    faceEmotion: string,
    availableActionIds: string[]
  ): Promise<string[]>;
}

/** 配置项 */
export interface MapperConfig {
  enableLlmActionGenerate: boolean;
  faceBlendWeight: number;
}

/** 情绪到动作ID的规则映射（规则模式，不需要任何大模型） */
const EMOTION_RULE_MAP: Record<string, string[]> = {
  happy: ['nod', 'smileLight'],
  warm: ['nod', 'smileLight'],
  sad: ['lookDown', 'sadMouth'],
  concerned: ['lookUp'],
  angry: ['shakeHead', 'angryMouth'],
  tsundere: ['tiltLeft', 'pout'],
  surprised: ['eyeWide', 'lookUp'],
  fearful: ['shakeHead'],
  disgusted: ['shakeHead'],
  shy: ['lookDown', 'smileLight'],
  embarrassed: ['lookDown'],
  sleepy: ['lookDown'],
  confused: ['tiltLeft', 'eyeWide'],
  thinking: ['tiltRight', 'eyeSquint'],
  neutral: ['blinkTwice'],
  excited: ['nod', 'smileBig'],
  proud: ['lookUp', 'smileLight'],
  apologetic: ['lookDown', 'sadMouth'],
  nostalgic: ['tiltLeft'],
  curious: ['tiltLeft', 'eyeWide'],
  frustrated: ['shakeHead', 'angryMouth'],
  relieved: ['nod', 'smileLight'],
  bored: ['lookDown'],
};

const DEFAULT_CONFIG: MapperConfig = {
  enableLlmActionGenerate: false,
  faceBlendWeight: 0.35,
};

// ────────────────── 主类 ──────────────────

export class SemanticActionMapper {
  private readonly actionIdSet: Set<string>;
  private config: MapperConfig;
  private llmProvider?: IActionLlmProvider;
  private readonly analyzer: SemanticEmotionAnalyzer;

  constructor(allActions: BaseActionMeta[], config?: Partial<MapperConfig>) {
    this.actionIdSet = new Set(allActions.map(a => a.actionId));
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.analyzer = new SemanticEmotionAnalyzer();
  }

  /** 注入可替换的 LLM 动作生成实现 */
  public setLlmProvider(provider: IActionLlmProvider | undefined): void {
    this.llmProvider = provider;
  }

  public setEnableLlmActionGenerate(enable: boolean): void {
    this.config.enableLlmActionGenerate = enable;
  }

  /** 更新配置 */
  public updateConfig(config: Partial<MapperConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** 判断 actionId 是否存在于注册表 */
  private isValidActionId(id: string): boolean {
    return this.actionIdSet.has(id);
  }

  /** 过滤非法 actionId，防止 LLM 幻觉 */
  private filterValidIds(ids: string[]): string[] {
    return [...new Set(ids.filter(id => this.isValidActionId(id)))];
  }

  /**
   * 规则模式：复用 SemanticEmotionAnalyzer 输出动作ID
   */
  private getRuleBasedActionIds(text: string): { emotion: string; actionIds: string[] } {
    const semanticResult = this.analyzer.analyzeText(text);
    const emotion = semanticResult?.dominantEmotion || 'neutral';
    const actionIds = EMOTION_RULE_MAP[emotion] ?? [];
    return { emotion, actionIds: this.filterValidIds(actionIds) };
  }

  /**
   * LLM 模式：调用外部 Provider（可以是 Ollama / OpenAI / 其他本地模型）
   */
  private async getLlmBasedActionIds(
    contextText: string,
    faceEmotion: string
  ): Promise<string[]> {
    if (!this.config.enableLlmActionGenerate || !this.llmProvider) return [];

    try {
      const allAvailableIds = Array.from(this.actionIdSet);
      const rawIds = await this.llmProvider.generateActionIds(contextText, faceEmotion, allAvailableIds);
      return this.filterValidIds(rawIds);
    } catch {
      return [];
    }
  }

  /**
   * 核心入口：输入文本 + 人脸情绪，输出合并之后的 actionId 列表
   */
  public async map(
    userText: string,
    faceInput: FaceEmotionInput
  ): Promise<{
    actionIds: string[];
    ruleEmotion: string;
    llmUsed: boolean;
  }> {
    const { emotion: ruleEmotion, actionIds: ruleIds } = this.getRuleBasedActionIds(userText);

    const llmIds = await this.getLlmBasedActionIds(userText, faceInput.emotion);
    const llmUsed = this.config.enableLlmActionGenerate && !!this.llmProvider;

    const faceActionIds = EMOTION_RULE_MAP[faceInput.emotion] ?? [];

    const clampedBlendWeight = Math.max(0, Math.min(1, this.config.faceBlendWeight));

    let merged: string[];
    if (llmUsed && llmIds.length > 0) {
      merged = [...llmIds];
    } else {
      merged = [...ruleIds];
    }

    if (clampedBlendWeight > 0 && Math.random() < clampedBlendWeight) {
      merged.push(...faceActionIds);
    }

    const finalIds = this.filterValidIds([...new Set(merged)]);

    return {
      actionIds: finalIds,
      ruleEmotion,
      llmUsed,
    };
  }

  /**
   * 完整流程：情绪 + 人脸 → 触发 ActionCompositor
   */
  public async apply(
    userText: string,
    faceInput: FaceEmotionInput,
    intensity = 0.8
  ): Promise<{
    actionIds: string[];
    ruleEmotion: string;
    llmUsed: boolean;
  }> {
    const result = await this.map(userText, faceInput);

    for (const actionId of result.actionIds) {
      actionCompositor.startAction(actionId, intensity);
    }

    return result;
  }
}

export const semanticActionMapper = new SemanticActionMapper(FULL_BASE_ACTIONS);