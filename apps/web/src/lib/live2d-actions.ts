/**
 * Live2D 动作库核心定义
 *
 * 统一动作元数据结构，Maya 和 Web 共用同一套 actionId
 *
 * 使用场景：
 * 1. Web 端 Live2D 动作调度
 * 2. Maya 动作制作参照
 * 3. Maya ↔ Web 双向参数同步
 */

import type { EmotionType as _EmotionType } from '../services/expression-bus';

// ========== 核心类型定义 ==========

/** 动作分类 - 对应 Maya 动画层 */
export type ActionCategory = 'head' | 'eye' | 'mouth' | 'micro';

/** 混合模式 - 对应 Maya 动画层叠加模式 */
export type BlendMode = 'add' | 'override' | 'mix';

/** 情绪标签 */
export type EmotionTag =
  | 'happy' | 'sad' | 'angry' | 'surprised' | 'fearful' | 'disgusted'
  | 'neutral' | 'excited' | 'shy' | 'thinking' | 'confused' | 'bored'
  | 'warm' | 'concerned' | 'sleepy' | 'nervous' | 'coquettish'
  | 'distrust' | 'embarrassed' | 'tired' | 'proud' | 'apologetic'
  | 'nostalgic' | 'curious' | 'frustrated' | 'relieved' | 'tsundere';

/** 基础动作元数据接口 */
export interface BaseActionMeta {
  /** 统一动作ID，Maya和Web共用 */
  actionId: string;
  /** 中文名称，编辑器展示用 */
  label: string;
  /** 动作分类 */
  category: ActionCategory;
  /** 动作总时长（毫秒） */
  duration: number;
  /** 混合模式 */
  blendMode: BlendMode;
  /**
   * 参数曲线：[起始值, 峰值1, 谷值?, 峰值2?, ..., 结束值]
   * Key 是 Live2D 参数逻辑名（如 angleY, eyeOpen, mouthSmile）
   * 运行时通过 PARAM_LOGICAL_TO_LIVE2D 映射到真实参数ID
   */
  params: Record<string, number[]>;
  /** Maya对应的动画clip名称（一一对应） */
  mayaClipName: string;
  /** Maya动画层名称 */
  mayaLayer: string;
  /** 是否允许与其他动作并行组合 */
  allowCombine: boolean;
  /** 关联情绪标签，["*"]表示适配所有情绪 */
  emotionTags: EmotionTag[] | ['*'];
}

/** 组合动作 - 仅引用actionId，不重复写params */
export interface CompositeActionMeta {
  /** 组合动作ID */
  actionId: string;
  /** 中文名称 */
  label: string;
  /** 组成的基础动作ID列表（按执行顺序） */
  actionIds: string[];
  /** 预估总时长（毫秒） */
  duration: number;
  /** 描述 */
  description?: string;
}

/** Maya导出用的精简结构 */
export interface MayaActionExport {
  actionId: string;
  mayaClipName: string;
  mayaLayer: string;
  params: Record<string, number[]>;
  duration: number;
  blendMode: BlendMode;
}

// ========== Live2D 参数名 ↔ Maya 属性名 映射表 ==========

/**
 * 参数映射表 - 确保Maya导出的参数能正确应用到Live2D
 * Key: Live2D标准参数名 / Value: Maya骨骼/BlendShape名称
 */
export const LIVE2D_PARAM_MAPPING: Record<string, string> = {
  ParamAngleX: 'AngleX',
  ParamAngleY: 'AngleY',
  ParamAngleZ: 'AngleZ',
  ParamBodyAngleX: 'BodyAngleX',
  ParamBodyAngleY: 'BodyAngleY',
  ParamBodyAngleZ: 'BodyAngleZ',
  ParamEyeLOpen: 'EyeLOpen',
  ParamEyeROpen: 'EyeROpen',
  ParamEyeBallX: 'EyeBallX',
  ParamEyeBallY: 'EyeBallY',
  ParamEyeLSmile: 'EyeLSmile',
  ParamEyeRSmile: 'EyeRSmile',
  ParamBrowLY: 'BrowLY',
  ParamBrowRY: 'BrowRY',
  ParamMouthOpenY: 'MouthOpenY',
  ParamMouthSmile: 'MouthSmile',
  ParamMouthSad: 'MouthSad',
  ParamMouthAngry: 'MouthAngry',
  ParamBreath: 'Breath',
  ParamCheek: 'Cheek',
};

/**
 * 逻辑参数名 → Live2D 标准参数名
 * 动作库里用简短逻辑名（angleX），运行时映射到真实参数ID（ParamAngleX）
 */
export const PARAM_LOGICAL_TO_LIVE2D: Record<string, string> = {
  angleX: 'ParamAngleX',
  angleY: 'ParamAngleY',
  angleZ: 'ParamAngleZ',
  bodyAngleX: 'ParamBodyAngleX',
  bodyAngleY: 'ParamBodyAngleY',
  bodyAngleZ: 'ParamBodyAngleZ',
  eyeOpen: 'ParamEyeLOpen',
  eyeBallX: 'ParamEyeBallX',
  eyeBallY: 'ParamEyeBallY',
  eyeLSmile: 'ParamEyeLSmile',
  eyeRSmile: 'ParamEyeRSmile',
  browLY: 'ParamBrowLY',
  browRY: 'ParamBrowRY',
  mouthOpen: 'ParamMouthOpenY',
  mouthSmile: 'ParamMouthSmile',
  mouthSad: 'ParamMouthSad',
  mouthAngry: 'ParamMouthAngry',
  mouthPout: 'ParamMouthSmile',
  bodyBreathe: 'ParamBreath',
  cheek: 'ParamCheek',
};

// ========== 完整基础动作清单 ==========

export const FULL_BASE_ACTIONS: BaseActionMeta[] = [
  // ══════════ head 头部层 ══════════
  {
    actionId: 'nod', label: '点头', category: 'head', duration: 550, blendMode: 'mix',
    params: { angleY: [0, 14, 0] },
    mayaClipName: 'anim_nod', mayaLayer: 'Layer_Head', allowCombine: true,
    emotionTags: ['happy', 'neutral', 'proud'],
  },
  {
    actionId: 'shakeHead', label: '摇头', category: 'head', duration: 650, blendMode: 'mix',
    params: { angleY: [0, -18, 18, 0] },
    mayaClipName: 'anim_shakeHead', mayaLayer: 'Layer_Head', allowCombine: true,
    emotionTags: ['angry', 'disgusted', 'frustrated'],
  },
  {
    actionId: 'tiltLeft', label: '头左歪', category: 'head', duration: 450, blendMode: 'add',
    params: { angleZ: [0, 16, 0] },
    mayaClipName: 'anim_tiltLeft', mayaLayer: 'Layer_Head', allowCombine: true,
    emotionTags: ['confused', 'happy', 'curious'],
  },
  {
    actionId: 'tiltRight', label: '头右歪', category: 'head', duration: 450, blendMode: 'add',
    params: { angleZ: [0, -16, 0] },
    mayaClipName: 'anim_tiltRight', mayaLayer: 'Layer_Head', allowCombine: true,
    emotionTags: ['confused', 'happy', 'thinking'],
  },
  {
    actionId: 'lookUp', label: '抬头向上', category: 'head', duration: 400, blendMode: 'add',
    params: { angleX: [0, -14, 0] },
    mayaClipName: 'anim_lookUp', mayaLayer: 'Layer_Head', allowCombine: true,
    emotionTags: ['surprised', 'concerned', 'proud'],
  },
  {
    actionId: 'lookDown', label: '低头', category: 'head', duration: 400, blendMode: 'add',
    params: { angleX: [0, 14, 0] },
    mayaClipName: 'anim_lookDown', mayaLayer: 'Layer_Head', allowCombine: true,
    emotionTags: ['sad', 'shy', 'embarrassed', 'apologetic'],
  },

  // ══════════ eye 眼部层 ══════════
  {
    actionId: 'blinkOnce', label: '单次眨眼', category: 'eye', duration: 220, blendMode: 'add',
    params: { eyeOpen: [1, 0, 1] },
    mayaClipName: 'anim_blinkOnce', mayaLayer: 'Layer_Eye', allowCombine: true,
    emotionTags: ['*'],
  },
  {
    actionId: 'blinkTwice', label: '连续眨两次眼', category: 'eye', duration: 420, blendMode: 'add',
    params: { eyeOpen: [1, 0, 1, 0, 1] },
    mayaClipName: 'anim_blinkTwice', mayaLayer: 'Layer_Eye', allowCombine: true,
    emotionTags: ['*'],
  },
  {
    actionId: 'eyeWide', label: '睁大双眼', category: 'eye', duration: 350, blendMode: 'add',
    params: { eyeOpen: [1, 1.25, 1] },
    mayaClipName: 'anim_eyeWide', mayaLayer: 'Layer_Eye', allowCombine: true,
    emotionTags: ['surprised', 'excited'],
  },
  {
    actionId: 'eyeSquint', label: '眯眼', category: 'eye', duration: 350, blendMode: 'add',
    params: { eyeOpen: [1, 0.4, 1] },
    mayaClipName: 'anim_eyeSquint', mayaLayer: 'Layer_Eye', allowCombine: true,
    emotionTags: ['angry', 'distrust', 'thinking'],
  },

  // ══════════ mouth 嘴部面部层 ══════════
  {
    actionId: 'smileLight', label: '浅浅微笑', category: 'mouth', duration: 500, blendMode: 'mix',
    params: { mouthSmile: [0, 0.4, 0] },
    mayaClipName: 'anim_smileLight', mayaLayer: 'Layer_Mouth', allowCombine: true,
    emotionTags: ['happy', 'warm', 'relieved'],
  },
  {
    actionId: 'smileBig', label: '大笑', category: 'mouth', duration: 600, blendMode: 'mix',
    params: { mouthSmile: [0, 0.7, 0] },
    mayaClipName: 'anim_smileBig', mayaLayer: 'Layer_Mouth', allowCombine: false,
    emotionTags: ['happy', 'excited'],
  },
  {
    actionId: 'pout', label: '嘟嘴', category: 'mouth', duration: 450, blendMode: 'mix',
    params: { mouthPout: [0, 0.5, 0] },
    mayaClipName: 'anim_pout', mayaLayer: 'Layer_Mouth', allowCombine: true,
    emotionTags: ['sad', 'coquettish', 'tsundere'],
  },
  {
    actionId: 'sadMouth', label: '难过嘴角下垂', category: 'mouth', duration: 500, blendMode: 'mix',
    params: { mouthSad: [0, 0.5, 0] },
    mayaClipName: 'anim_sadMouth', mayaLayer: 'Layer_Mouth', allowCombine: true,
    emotionTags: ['sad', 'concerned'],
  },
  {
    actionId: 'angryMouth', label: '生气抿嘴', category: 'mouth', duration: 450, blendMode: 'mix',
    params: { mouthAngry: [0, 0.45, 0] },
    mayaClipName: 'anim_angryMouth', mayaLayer: 'Layer_Mouth', allowCombine: true,
    emotionTags: ['angry', 'frustrated'],
  },

  // ══════════ micro 微动作层（常驻叠加） ══════════
  {
    actionId: 'breath', label: '呼吸起伏', category: 'micro', duration: 2200, blendMode: 'add',
    params: { bodyBreathe: [0, 0.08, 0] },
    mayaClipName: 'anim_breath', mayaLayer: 'Layer_Micro', allowCombine: true,
    emotionTags: ['*'],
  },
  {
    actionId: 'tinyHeadJitter', label: '头部微小抖动', category: 'micro', duration: 300, blendMode: 'add',
    params: { angleX: [0, 2, 0], angleY: [0, 2, 0] },
    mayaClipName: 'anim_tinyHeadJitter', mayaLayer: 'Layer_Micro', allowCombine: true,
    emotionTags: ['nervous', 'thinking'],
  },
];

// ========== 组合动作 ==========

export const COMPOSITE_ACTIONS: CompositeActionMeta[] = [
  { actionId: 'greet', label: '打招呼', actionIds: ['nod', 'smileLight'], duration: 1100, description: '点头+微笑' },
  { actionId: 'confused', label: '困惑', actionIds: ['tiltLeft', 'eyeWide'], duration: 800, description: '歪头+睁大眼' },
  { actionId: 'upset', label: '沮丧', actionIds: ['lookDown', 'sadMouth'], duration: 900, description: '低头+难过嘴' },
  { actionId: 'angryGlare', label: '怒视', actionIds: ['lookUp', 'eyeSquint', 'angryMouth'], duration: 1200, description: '抬头+眯眼+抿嘴' },
  { actionId: 'shySmile', label: '羞涩微笑', actionIds: ['lookDown', 'smileLight'], duration: 900, description: '低头+浅笑' },
  { actionId: 'enthusiastic', label: '热情', actionIds: ['nod', 'smileBig', 'eyeWide'], duration: 1500, description: '点头+大笑+睁大眼' },
  { actionId: 'doubtful', label: '怀疑', actionIds: ['tiltRight', 'eyeSquint'], duration: 800, description: '歪头+眯眼' },
  { actionId: 'apologetic', label: '歉意', actionIds: ['lookDown', 'sadMouth', 'nod'], duration: 1400, description: '低头+难过嘴+点头' },
];

// ========== Maya 导出函数 ==========

/** 导出动作元数据给 Maya（精简版，只含 Maya 需要的字段） */
export function exportActionMetaToMaya(): string {
  const exportData: MayaActionExport[] = FULL_BASE_ACTIONS.map(action => ({
    actionId: action.actionId,
    mayaClipName: action.mayaClipName,
    mayaLayer: action.mayaLayer,
    params: action.params,
    duration: action.duration,
    blendMode: action.blendMode,
  }));
  return JSON.stringify(exportData, null, 2);
}

/** 导出参数映射表给 Maya（用于参数名对齐） */
export function exportParamMappingToMaya(): string {
  return JSON.stringify(LIVE2D_PARAM_MAPPING, null, 2);
}

/**
 * Maya 回写参数的入口
 * Maya 调完曲线后，导出 json，调用此函数覆盖前端 params
 */
export function importParamsFromMaya(mayaJson: MayaActionExport[]): void {
  for (const mayaAction of mayaJson) {
    const target = FULL_BASE_ACTIONS.find(a => a.actionId === mayaAction.actionId);
    if (target) {
      target.params = mayaAction.params;
      target.duration = mayaAction.duration;
    }
  }
}