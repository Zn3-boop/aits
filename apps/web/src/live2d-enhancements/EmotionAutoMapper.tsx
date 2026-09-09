/**
 * ============================================================
 *  Emotion Auto Mapper — 表情自动适配层
 * ============================================================
 *
 * 功能：
 * 1. 自动扫描 Live2D 模型的所有参数
 * 2. 根据参数名语义自动匹配到情绪模板
 * 3. 支持 3 种命名规范：PARAM_XXX / ParamXxx / Param_XXX
 * 4. 内置 12 种情绪 × 20+ 参数语义规则
 * 5. 生成适配报告：匹配率、置信度、未匹配参数建议
 *
 * 使用方式：
 *   import { emotionAutoMapper } from './emotionAutoMapper';
 *
 *   // 扫描并适配
 *   const result = emotionAutoMapper.adaptModel(paramIds, motionGroups, expressions);
 *
 *   // 获取情绪配置（可直接传给 Live2DDriver）
 *   const config = result.getEmotionConfig('happy');
 *
 *   // 获取完整报告
 *   console.log(result.report());
 * ============================================================
 */

import { logger } from '../utils/logger';

// ========== 参数语义定义 ==========
// 每个语义类别对应一组关键词（小写匹配）
// 顺序很重要：前面的匹配优先级更高

interface ParamSemanticDef {
  /** 语义类别 */
  category: ParamCategory;
  /** 关键词列表（在参数名中匹配） */
  keywords: string[];
  /** 描述 */
  description: string;
}

export type ParamCategory =
  | 'mouthOpen'      // 嘴巴开合
  | 'mouthForm'      // 嘴型形状（微笑/抿嘴/嘟嘴）
  | 'mouthSize'      // 嘴巴大小
  | 'eyeLOpen'       // 左眼开合
  | 'eyeROpen'       // 右眼开合
  | 'eyeLSmile'      // 左眼笑眼
  | 'eyeRSmile'      // 右眼笑眼
  | 'eyeBallX'       // 眼球左右
  | 'eyeBallY'       // 眼球上下
  | 'eyeWideL'       // 左眼睁大
  | 'eyeWideR'       // 右眼睁大
  | 'browLY'         // 左眉上下
  | 'browRY'         // 右眉上下
  | 'browLAngle'     // 左眉角度
  | 'browRAngle'     // 右眉角度
  | 'browLForm'      // 左眉形状
  | 'browRForm'      // 右眉形状
  | 'angleX'         // 头部X轴（左右）
  | 'angleY'         // 头部Y轴（上下）
  | 'angleZ'         // 头部Z轴（旋转）
  | 'bodyAngleX'     // 身体X轴
  | 'bodyAngleY'     // 身体Y轴
  | 'bodyAngleZ'     // 身体Z轴
  | 'cheek'          // 脸颊（脸红）
  | 'tere'           // 害羞/脸红
  | 'breath'         // 呼吸
  | 'armL'           // 左臂
  | 'armR'           // 右臂
  | 'handL'          // 左手
  | 'handR'          // 右手
  | 'donyori'        // 丧气/沮丧
  | 'hairFront'      // 前发
  | 'hairBack'       // 后发
  | 'desk'           // 桌子/场景
  | 'unknown';       // 未识别

const PARAM_SEMANTIC_DEFS: ParamSemanticDef[] = [
  // —— 嘴巴 ——
  {
    category: 'mouthOpen',
    keywords: ['mouth_open_y', 'mouthopeny', 'mouth_y', 'mouthopen', 'mouth_open'],
    description: '嘴巴开合度',
  },
  {
    category: 'mouthForm',
    keywords: ['mouth_form', 'mouthform', 'mouth_shape', 'mouthsmile'],
    description: '嘴型形状（微笑/抿嘴）',
  },
  {
    category: 'mouthSize',
    keywords: ['mouth_size', 'mouthsize', 'mouth_w', 'mouthwidth'],
    description: '嘴巴大小/宽度',
  },
  // —— 眼睛 ——
  {
    category: 'eyeLSmile',
    keywords: ['eye_l_smile', 'eyelsmile', 'eye_left_smile', 'eyesmile_l'],
    description: '左眼笑眼',
  },
  {
    category: 'eyeRSmile',
    keywords: ['eye_r_smile', 'eyersmile', 'eye_right_smile', 'eyesmile_r'],
    description: '右眼笑眼',
  },
  {
    category: 'eyeWideL',
    keywords: ['eye_l_wide', 'eyelwide', 'eye_left_wide', 'eyewide_l'],
    description: '左眼睁大',
  },
  {
    category: 'eyeWideR',
    keywords: ['eye_r_wide', 'eyerwide', 'eye_right_wide', 'eyewide_r'],
    description: '右眼睁大',
  },
  {
    category: 'eyeLOpen',
    keywords: ['eye_l_open', 'eye_l', 'eyelopen', 'eye_left_open', 'eyeopen_l'],
    description: '左眼开合',
  },
  {
    category: 'eyeROpen',
    keywords: ['eye_r_open', 'eye_r', 'eyeropen', 'eye_right_open', 'eyeopen_r'],
    description: '右眼开合',
  },
  // —— 眼球 ——
  {
    category: 'eyeBallX',
    keywords: ['eye_ball_x', 'eyeballx', 'eye_x', 'ball_x'],
    description: '眼球左右',
  },
  {
    category: 'eyeBallY',
    keywords: ['eye_ball_y', 'eyebally', 'eye_y', 'ball_y'],
    description: '眼球上下',
  },
  // —— 眉毛 ——
  {
    category: 'browLAngle',
    keywords: ['brow_l_angle', 'browlang', 'brow_left_angle', 'browangle_l'],
    description: '左眉角度',
  },
  {
    category: 'browRAngle',
    keywords: ['brow_r_angle', 'browrang', 'brow_right_angle', 'browangle_r'],
    description: '右眉角度',
  },
  {
    category: 'browLForm',
    keywords: ['brow_l_form', 'browlform', 'brow_left_form', 'browform_l'],
    description: '左眉形状',
  },
  {
    category: 'browRForm',
    keywords: ['brow_r_form', 'browrform', 'brow_right_form', 'browform_r'],
    description: '右眉形状',
  },
  {
    category: 'browLY',
    keywords: ['brow_l_y', 'browl_y', 'browly', 'brow_left_y', 'brow_l', 'browlefty'],
    description: '左眉上下',
  },
  {
    category: 'browRY',
    keywords: ['brow_r_y', 'browr_y', 'browry', 'brow_right_y', 'brow_r', 'browrighty'],
    description: '右眉上下',
  },
  // —— 头部角度 ——
  {
    category: 'angleX',
    keywords: ['angle_x', 'anglex', 'paramangle_x', 'head_x'],
    description: '头部X轴（左右摆动）',
  },
  {
    category: 'angleY',
    keywords: ['angle_y', 'angley', 'paramangle_y', 'head_y'],
    description: '头部Y轴（上下点头）',
  },
  {
    category: 'angleZ',
    keywords: ['angle_z', 'anglez', 'paramangle_z', 'head_z'],
    description: '头部Z轴（旋转）',
  },
  // —— 身体角度 ——
  {
    category: 'bodyAngleX',
    keywords: ['body_angle_x', 'bodyanglex', 'body_x', 'parambodyanglex'],
    description: '身体X轴',
  },
  {
    category: 'bodyAngleY',
    keywords: ['body_angle_y', 'bodyangley', 'body_y', 'parambodyangley'],
    description: '身体Y轴',
  },
  {
    category: 'bodyAngleZ',
    keywords: ['body_angle_z', 'bodyanglez', 'body_z', 'parambodyanglez'],
    description: '身体Z轴',
  },
  // —— 脸颊/害羞 ——
  {
    category: 'cheek',
    keywords: ['cheek', 'blush', 'flare'],
    description: '脸颊（脸红）',
  },
  {
    category: 'tere',
    keywords: ['tere', 'shame', 'embarrass'],
    description: '害羞/脸红',
  },
  // —— 其他 ——
  {
    category: 'breath',
    keywords: ['breath', 'breathing'],
    description: '呼吸',
  },
  {
    category: 'donyori',
    keywords: ['donyori', 'dejected', 'depress', 'sad_face'],
    description: '丧气/沮丧脸',
  },
];

// ========== 情绪模板定义 ==========

export type EmotionType =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'fearful'
  | 'disgusted'
  | 'shy'
  | 'warm'
  | 'tsundere'
  | 'concerned'
  | 'sleepy'
  | 'listening'
  | 'speaking'
  | 'thinking';

interface EmotionParamTarget {
  /** 参数语义类别 */
  category: ParamCategory;
  /** 目标值 */
  value: number;
  /** 置信度：这个参数对情绪的重要程度 (0-1) */
  confidence: number;
}

interface EmotionTemplate {
  /** 推荐的 motion group（如果模型有） */
  preferredMotion?: string;
  /** 推荐的 expression 名（如果模型有） */
  preferredExpression?: string;
  /** 参数目标列表 */
  params: EmotionParamTarget[];
}

const EMOTION_TEMPLATES: Record<EmotionType, EmotionTemplate> = {
  neutral: {
    preferredMotion: 'Idle',
    preferredExpression: 'Normal',
    params: [
      // 中性表情：所有参数归零/默认
      { category: 'mouthOpen', value: 0, confidence: 1 },
      { category: 'mouthForm', value: 0, confidence: 0.8 },
      { category: 'browLY', value: 0, confidence: 0.9 },
      { category: 'browRY', value: 0, confidence: 0.9 },
      { category: 'eyeLOpen', value: 1, confidence: 0.9 },
      { category: 'eyeROpen', value: 1, confidence: 0.9 },
      { category: 'eyeLSmile', value: 0, confidence: 0.6 },
      { category: 'eyeRSmile', value: 0, confidence: 0.6 },
      { category: 'cheek', value: 0, confidence: 0.5 },
      { category: 'tere', value: 0, confidence: 0.3 },
      { category: 'donyori', value: 0, confidence: 0.5 },
    ],
  },

  happy: {
    preferredMotion: 'Tap',
    preferredExpression: 'happy',
    params: [
      { category: 'mouthForm', value: 0.8, confidence: 1 },       // 嘴角上扬
      { category: 'mouthOpen', value: 0.3, confidence: 0.7 },     // 微张
      { category: 'eyeLSmile', value: 0.8, confidence: 1 },       // 笑眼
      { category: 'eyeRSmile', value: 0.8, confidence: 1 },
      { category: 'browLY', value: 0.3, confidence: 0.6 },        // 眉毛微抬
      { category: 'browRY', value: 0.3, confidence: 0.6 },
      { category: 'cheek', value: 0.6, confidence: 0.8 },         // 脸红
      { category: 'tere', value: 0.3, confidence: 0.4 },
      { category: 'eyeLOpen', value: 1, confidence: 0.5 },
      { category: 'eyeROpen', value: 1, confidence: 0.5 },
      { category: 'angleY', value: -3, confidence: 0.3 },         // 微微抬头
    ],
  },

  sad: {
    preferredMotion: 'Idle',
    preferredExpression: 'sad',
    params: [
      { category: 'mouthForm', value: -0.7, confidence: 1 },      // 嘴角下垂
      { category: 'mouthOpen', value: 0.1, confidence: 0.5 },
      { category: 'browLY', value: -0.5, confidence: 0.9 },       // 眉毛下垂/八字眉
      { category: 'browRY', value: -0.5, confidence: 0.9 },
      { category: 'browLAngle', value: 0.5, confidence: 0.7 },    // 眉头微蹙
      { category: 'browRAngle', value: 0.5, confidence: 0.7 },
      { category: 'eyeLOpen', value: 0.7, confidence: 0.6 },      // 眼睛微眯
      { category: 'eyeROpen', value: 0.7, confidence: 0.6 },
      { category: 'donyori', value: 0.6, confidence: 0.8 },       // 丧气脸
      { category: 'angleY', value: 5, confidence: 0.5 },          // 低头
    ],
  },

  angry: {
    preferredMotion: 'Flick3',
    preferredExpression: 'angry',
    params: [
      { category: 'browLY', value: -0.8, confidence: 1 },         // 皱眉（压低）
      { category: 'browRY', value: -0.8, confidence: 1 },
      { category: 'browLAngle', value: -0.8, confidence: 0.9 },   // 皱眉角度
      { category: 'browRAngle', value: -0.8, confidence: 0.9 },
      { category: 'browLForm', value: -0.8, confidence: 0.7 },    // 眉形紧绷
      { category: 'browRForm', value: -0.8, confidence: 0.7 },
      { category: 'mouthForm', value: -0.5, confidence: 0.7 },    // 抿嘴
      { category: 'mouthOpen', value: 0.2, confidence: 0.5 },
      { category: 'eyeLOpen', value: 1.1, confidence: 0.6 },      // 睁大眼睛
      { category: 'eyeROpen', value: 1.1, confidence: 0.6 },
      { category: 'eyeWideL', value: 0.5, confidence: 0.5 },
      { category: 'eyeWideR', value: 0.5, confidence: 0.5 },
      { category: 'angleX', value: -2, confidence: 0.3 },
    ],
  },

  surprised: {
    preferredMotion: 'FlickUp',
    preferredExpression: 'surprised',
    params: [
      { category: 'browLY', value: 0.8, confidence: 1 },          // 眉毛上扬
      { category: 'browRY', value: 0.8, confidence: 1 },
      { category: 'browLForm', value: 0.8, confidence: 0.6 },
      { category: 'browRForm', value: 0.8, confidence: 0.6 },
      { category: 'mouthOpen', value: 0.9, confidence: 1 },       // 嘴巴大张
      { category: 'eyeLOpen', value: 1.2, confidence: 0.9 },      // 眼睛睁大
      { category: 'eyeROpen', value: 1.2, confidence: 0.9 },
      { category: 'eyeWideL', value: 0.8, confidence: 0.7 },
      { category: 'eyeWideR', value: 0.8, confidence: 0.7 },
      { category: 'angleY', value: -5, confidence: 0.5 },         // 仰头
    ],
  },

  fearful: {
    preferredMotion: 'FlickUp',
    preferredExpression: 'surprised',
    params: [
      { category: 'browLY', value: 0.6, confidence: 0.9 },
      { category: 'browRY', value: 0.6, confidence: 0.9 },
      { category: 'eyeLOpen', value: 1.1, confidence: 0.8 },
      { category: 'eyeROpen', value: 1.1, confidence: 0.8 },
      { category: 'eyeWideL', value: 0.6, confidence: 0.7 },
      { category: 'eyeWideR', value: 0.6, confidence: 0.7 },
      { category: 'mouthOpen', value: 0.4, confidence: 0.7 },     // 嘴巴微张
      { category: 'mouthForm', value: -0.3, confidence: 0.5 },
    ],
  },

  disgusted: {
    preferredMotion: 'Flick3',
    preferredExpression: 'angry',
    params: [
      { category: 'browLY', value: -0.5, confidence: 0.8 },       // 皱眉
      { category: 'browRY', value: -0.5, confidence: 0.8 },
      { category: 'browLAngle', value: -0.6, confidence: 0.6 },
      { category: 'browRAngle', value: -0.6, confidence: 0.6 },
      { category: 'browLForm', value: -0.7, confidence: 0.6 },
      { category: 'browRForm', value: -0.7, confidence: 0.6 },
      { category: 'mouthForm', value: -0.6, confidence: 0.8 },    // 撇嘴
      { category: 'mouthOpen', value: 0.1, confidence: 0.4 },
      { category: 'eyeLOpen', value: 0.8, confidence: 0.5 },      // 眯眼
      { category: 'eyeROpen', value: 0.8, confidence: 0.5 },
    ],
  },

  shy: {
    preferredMotion: 'Idle',
    preferredExpression: 'Blushing',
    params: [
      { category: 'cheek', value: 1, confidence: 1 },             // 脸红（最核心）
      { category: 'tere', value: 1, confidence: 1 },
      { category: 'mouthForm', value: 0.3, confidence: 0.6 },     // 微笑
      { category: 'mouthOpen', value: 0.1, confidence: 0.3 },
      { category: 'eyeLOpen', value: 0.85, confidence: 0.4 },     // 眼睛微垂
      { category: 'eyeROpen', value: 0.85, confidence: 0.4 },
      { category: 'browLY', value: -0.2, confidence: 0.5 },       // 眉毛微垂
      { category: 'browRY', value: -0.2, confidence: 0.5 },
      { category: 'angleZ', value: 5, confidence: 0.5 },          // 歪头
      { category: 'angleY', value: 3, confidence: 0.4 },          // 低头
    ],
  },

  warm: {
    preferredMotion: 'Tap',
    preferredExpression: 'happy',
    params: [
      { category: 'mouthForm', value: 0.5, confidence: 1 },       // 温柔微笑
      { category: 'eyeLSmile', value: 0.5, confidence: 0.9 },     // 笑眼
      { category: 'eyeRSmile', value: 0.5, confidence: 0.9 },
      { category: 'browLY', value: 0.2, confidence: 0.5 },
      { category: 'browRY', value: 0.2, confidence: 0.5 },
      { category: 'cheek', value: 0.4, confidence: 0.7 },
      { category: 'tere', value: 0.3, confidence: 0.4 },
    ],
  },

  tsundere: {
    preferredMotion: 'Flick3',
    preferredExpression: 'angry',
    params: [
      { category: 'browLY', value: -0.6, confidence: 0.8 },       // 假装生气皱眉
      { category: 'browRY', value: -0.6, confidence: 0.8 },
      { category: 'browLAngle', value: -0.5, confidence: 0.6 },
      { category: 'browRAngle', value: -0.5, confidence: 0.6 },
      { category: 'mouthForm', value: -0.3, confidence: 0.6 },    // 撅嘴
      { category: 'cheek', value: 0.7, confidence: 0.9 },         // 但脸红（暴露了）
      { category: 'tere', value: 0.6, confidence: 0.8 },
      { category: 'angleZ', value: -4, confidence: 0.5 },         // 扭头
    ],
  },

  concerned: {
    preferredMotion: 'Idle',
    preferredExpression: 'sad',
    params: [
      { category: 'browLY', value: -0.3, confidence: 0.8 },       // 担忧的眉毛
      { category: 'browRY', value: -0.3, confidence: 0.8 },
      { category: 'browLAngle', value: 0.4, confidence: 0.7 },
      { category: 'browRAngle', value: 0.4, confidence: 0.7 },
      { category: 'mouthForm', value: -0.3, confidence: 0.6 },    // 微抿嘴
      { category: 'eyeLOpen', value: 0.9, confidence: 0.4 },
      { category: 'eyeROpen', value: 0.9, confidence: 0.4 },
      { category: 'cheek', value: 0.2, confidence: 0.3 },
    ],
  },

  sleepy: {
    preferredMotion: 'Idle',
    preferredExpression: 'sad',
    params: [
      { category: 'eyeLOpen', value: 0.4, confidence: 1 },        // 眼睛半睁
      { category: 'eyeROpen', value: 0.4, confidence: 1 },
      { category: 'browLY', value: -0.2, confidence: 0.5 },       // 眼皮耷拉
      { category: 'browRY', value: -0.2, confidence: 0.5 },
      { category: 'mouthOpen', value: 0.1, confidence: 0.3 },     // 微张嘴
      { category: 'angleY', value: 5, confidence: 0.6 },          // 低头瞌睡
      { category: 'donyori', value: 0.4, confidence: 0.5 },
    ],
  },

  listening: {
    preferredMotion: 'Idle',
    params: [
      { category: 'browLY', value: 0.2, confidence: 0.7 },        // 专注倾听：眉毛微抬
      { category: 'browRY', value: 0.2, confidence: 0.7 },
      { category: 'eyeLOpen', value: 1, confidence: 0.5 },
      { category: 'eyeROpen', value: 1, confidence: 0.5 },
      { category: 'mouthOpen', value: 0, confidence: 0.8 },       // 闭嘴听
      { category: 'mouthForm', value: 0.1, confidence: 0.3 },
      { category: 'angleY', value: -2, confidence: 0.4 },         // 微微侧头
    ],
  },

  speaking: {
    preferredMotion: 'Tap',
    params: [
      { category: 'mouthOpen', value: 0.4, confidence: 0.6 },     // 嘴巴微张（口型会实时覆盖）
      { category: 'mouthForm', value: 0.3, confidence: 0.4 },
      { category: 'browLY', value: 0.1, confidence: 0.3 },
      { category: 'browRY', value: 0.1, confidence: 0.3 },
    ],
  },

  thinking: {
    preferredMotion: 'Idle',
    params: [
      { category: 'browLY', value: 0.15, confidence: 0.6 },       // 思索眉
      { category: 'browRY', value: -0.1, confidence: 0.6 },
      { category: 'browLAngle', value: 0.3, confidence: 0.5 },
      { category: 'browRAngle', value: -0.2, confidence: 0.5 },
      { category: 'eyeBallX', value: -0.3, confidence: 0.4 },     // 眼睛往左上看
      { category: 'eyeBallY', value: -0.3, confidence: 0.4 },
      { category: 'mouthForm', value: 0.1, confidence: 0.3 },
      { category: 'angleY', value: -2, confidence: 0.3 },         // 仰头想
    ],
  },
};

// ========== 参数名归一化 ==========

/**
 * 将参数名转换为统一的下划线小写格式，方便匹配
 * 支持：PARAM_MOUTH_OPEN_Y / ParamMouthOpenY / param_mouth_open_y
 */
function normalizeParamName(paramId: string): string {
  // 先转小写
  let normalized = paramId.toLowerCase();

  // 如果是 ParamXxx 格式（驼峰），转下划线
  // 检测：如果包含大写字母且不是全大写格式
  if (/[A-Z]/.test(paramId) && !/^[A-Z_]+$/.test(paramId)) {
    normalized = paramId
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
      .replace(/([a-z\d])([A-Z])/g, '$1_$2')
      .toLowerCase();
  }

  // 去掉前缀 param_
  normalized = normalized.replace(/^param_/, '');

  return normalized;
}

// ========== 适配结果类 ==========

export interface MappedParamInfo {
  paramId: string;
  normalizedName: string;
  category: ParamCategory;
  confidence: number;
}

export interface EmotionConfigEntry {
  paramId: string;
  category: ParamCategory;
  value: number;
  confidence: number;
}

export interface EmotionConfig {
  motionGroup: string;
  expressionOverride: string | null;
  paramAdditions: Record<string, number>;
  matchedCount: number;
  totalTargets: number;
  matchRate: number;
}

export interface AdaptationReport {
  totalParams: number;
  matchedParams: number;
  unmatchedParams: string[];
  matchedCategories: ParamCategory[];
  matchRate: number;
  emotionMatchRates: Record<EmotionType, number>;
  availableMotions: string[];
  availableExpressions: string[];
  suggestions: string[];
}

export class ModelAdaptationResult {
  private paramMap = new Map<string, MappedParamInfo>();
  private motionGroups: string[] = [];
  private expressions: string[] = [];

  constructor(
    paramIds: string[],
    motionGroups: string[] = [],
    expressions: string[] = []
  ) {
    this.motionGroups = motionGroups;
    this.expressions = expressions;

    for (const paramId of paramIds) {
      const normalized = normalizeParamName(paramId);
      const category = this.matchParamCategory(normalized);
      const confidence = category === 'unknown' ? 0 : this.calculateConfidence(normalized, category);

      this.paramMap.set(paramId, {
        paramId,
        normalizedName: normalized,
        category,
        confidence,
      });
    }
  }

  private matchParamCategory(normalized: string): ParamCategory {
    for (const def of PARAM_SEMANTIC_DEFS) {
      for (const keyword of def.keywords) {
        if (normalized.includes(keyword)) {
          return def.category;
        }
      }
    }
    return 'unknown';
  }

  private calculateConfidence(normalized: string, category: ParamCategory): number {
    const def = PARAM_SEMANTIC_DEFS.find((d) => d.category === category);
    if (!def) return 0;

    // 匹配的关键词越多/越精确，置信度越高
    let maxMatchLen = 0;
    for (const keyword of def.keywords) {
      if (normalized.includes(keyword) && keyword.length > maxMatchLen) {
        maxMatchLen = keyword.length;
      }
    }

    // 基于关键词长度的置信度
    const lengthScore = Math.min(maxMatchLen / 10, 1);

    // 如果参数名正好等于关键词，满分
    const exactMatch = def.keywords.some((kw) => normalized === kw || normalized === `_${kw}`);

    return exactMatch ? 1 : Math.min(0.5 + lengthScore * 0.5, 0.95);
  }

  /**
   * 获取某个情绪的配置（可直接传给 Live2DDriver）
   */
  getEmotionConfig(emotion: EmotionType): EmotionConfig {
    const template = EMOTION_TEMPLATES[emotion];
    if (!template) {
      return {
        motionGroup: 'Idle',
        expressionOverride: null,
        paramAdditions: {},
        matchedCount: 0,
        totalTargets: 0,
        matchRate: 0,
      };
    }

    const paramAdditions: Record<string, number> = {};
    let matchedCount = 0;

    for (const target of template.params) {
      // 找到这个语义类别对应的模型参数
      let bestMatch: MappedParamInfo | null = null;
      let bestConfidence = 0;

      for (const info of this.paramMap.values()) {
        if (info.category === target.category && info.confidence > bestConfidence) {
          bestConfidence = info.confidence;
          bestMatch = info;
        }
      }

      if (bestMatch && bestConfidence > 0.3) {
        // 置信度折扣：参数识别越不确定，值的幅度越小
        const valueScale = 0.5 + bestConfidence * 0.5;
        paramAdditions[bestMatch.paramId] = target.value * valueScale;
        matchedCount++;
      }
    }

    // 选择 motion group
    let motionGroup = 'Idle';
    if (template.preferredMotion && this.motionGroups.includes(template.preferredMotion)) {
      motionGroup = template.preferredMotion;
    } else {
      // 回退策略
      const fallbackOrder = ['Tap', 'Idle', 'Flick', 'FlickUp', 'Flick3'];
      for (const fallback of fallbackOrder) {
        if (this.motionGroups.includes(fallback)) {
          motionGroup = fallback;
          break;
        }
      }
    }

    // 选择 expression
    let expressionOverride: string | null = null;
    if (template.preferredExpression) {
      const exprLower = template.preferredExpression.toLowerCase();
      const matchedExpr =
        this.expressions.find((e) => e.toLowerCase() === exprLower) ||
        this.expressions.find((e) => e.toLowerCase().includes(exprLower));
      if (matchedExpr) {
        expressionOverride = matchedExpr;
      }
    }

    const totalTargets = template.params.length;
    return {
      motionGroup,
      expressionOverride,
      paramAdditions,
      matchedCount,
      totalTargets,
      matchRate: totalTargets > 0 ? matchedCount / totalTargets : 0,
    };
  }

  /**
   * 获取所有情绪的配置
   */
  getAllEmotionConfigs(): Record<EmotionType, EmotionConfig> {
    const result = {} as Record<EmotionType, EmotionConfig>;
    for (const emotion of Object.keys(EMOTION_TEMPLATES) as EmotionType[]) {
      result[emotion] = this.getEmotionConfig(emotion);
    }
    return result;
  }

  /**
   * 生成适配报告
   */
  report(): AdaptationReport {
    const matched: MappedParamInfo[] = [];
    const unmatched: string[] = [];

    for (const info of this.paramMap.values()) {
      if (info.category === 'unknown') {
        unmatched.push(info.paramId);
      } else {
        matched.push(info);
      }
    }

    const matchedCategories = [
      ...new Set(matched.map((m) => m.category)),
    ] as ParamCategory[];

    const emotionMatchRates = {} as Record<EmotionType, number>;
    for (const emotion of Object.keys(EMOTION_TEMPLATES) as EmotionType[]) {
      emotionMatchRates[emotion] = this.getEmotionConfig(emotion).matchRate;
    }

    const suggestions: string[] = [];

    // 检查核心参数是否缺失
    const coreCategories: ParamCategory[] = ['mouthOpen', 'eyeLOpen', 'eyeROpen', 'browLY', 'browRY'];
    const missingCore = coreCategories.filter(
      (cat) => !matched.some((m) => m.category === cat)
    );

    if (missingCore.length > 0) {
      suggestions.push(
        `核心参数缺失: ${missingCore.join(', ')}，这些参数对表情表现影响较大，建议检查模型是否有对应参数`
      );
    }

    if (this.motionGroups.length === 0) {
      suggestions.push('模型没有内置动作组，将使用纯参数驱动表情');
    }

    if (this.expressions.length === 0) {
      suggestions.push('模型没有内置表情文件，所有表情将通过参数叠加实现');
    }

    if (unmatched.length > 5) {
      suggestions.push(
        `有 ${unmatched.length} 个参数未识别，可以在 emotionAutoMapper 中添加自定义匹配规则`
      );
    }

    return {
      totalParams: this.paramMap.size,
      matchedParams: matched.length,
      unmatchedParams: unmatched,
      matchedCategories,
      matchRate: this.paramMap.size > 0 ? matched.length / this.paramMap.size : 0,
      emotionMatchRates,
      availableMotions: this.motionGroups,
      availableExpressions: this.expressions,
      suggestions,
    };
  }

  /**
   * 获取某个参数的语义信息
   */
  getParamInfo(paramId: string): MappedParamInfo | undefined {
    return this.paramMap.get(paramId);
  }

  /**
   * 手动覆盖某个参数的语义分类（用于用户自定义微调）
   */
  setParamCategory(paramId: string, category: ParamCategory, confidence = 0.9): void {
    const existing = this.paramMap.get(paramId);
    this.paramMap.set(paramId, {
      paramId,
      normalizedName: existing?.normalizedName || normalizeParamName(paramId),
      category,
      confidence,
    });
  }
}

// ========== 主类 ==========

export class EmotionAutoMapper {
  private cache = new Map<string, ModelAdaptationResult>();

  /**
   * 适配一个模型
   * @param paramIds 模型所有参数 ID 列表
   * @param motionGroups 可用动作组
   * @param expressions 可用表情名
   * @param modelKey 缓存键（通常用模型路径或 ID）
   */
  adaptModel(
    paramIds: string[],
    motionGroups: string[] = [],
    expressions: string[] = [],
    modelKey?: string
  ): ModelAdaptationResult {
    const cacheKey = modelKey || paramIds.sort().join('|');

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const result = new ModelAdaptationResult(paramIds, motionGroups, expressions);
    this.cache.set(cacheKey, result);

    const report = result.report();
    logger.log(
      `[EmotionAutoMapper] ✅ 模型适配完成: ${report.matchedParams}/${report.totalParams} 参数匹配 (${(report.matchRate * 100).toFixed(1)}%)`
    );

    return result;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 获取支持的情绪列表
   */
  getSupportedEmotions(): EmotionType[] {
    return Object.keys(EMOTION_TEMPLATES) as EmotionType[];
  }

  /**
   * 获取参数语义定义列表（用于展示给用户）
   */
  getSemanticDefinitions(): ParamSemanticDef[] {
    return [...PARAM_SEMANTIC_DEFS];
  }
}

// 单例
export const emotionAutoMapper = new EmotionAutoMapper();
