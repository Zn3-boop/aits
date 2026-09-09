import type { EmotionType, TimelineEntry } from './expression-bus';
import { actionRegistry } from '../lib/ActionRegistry';
import { actionCompositor } from '../lib/ActionCompositor';
import type { ActionTimelineItem } from '../lib/ActionCompositor';
import { semanticActionMapper } from '../lib/SemanticActionMapper';
import type { FaceEmotionInput } from '../lib/SemanticActionMapper';
import { live2dActionScheduler } from './live2d/Live2DActionScheduler';

const EMOTION_PATTERNS: Array<{ pattern: RegExp; emotions: EmotionType[] }> = [
  { pattern: /开心|高兴|棒极了|太好了|不错|喜欢|谢谢|哈哈|嘻嘻|嘿嘿|赞|wonderful|great|good|happy|love|thanks/i, emotions: ['happy', 'warm'] },
  { pattern: /难过|伤心|抱歉|遗憾|对不起|可惜|悲伤|呜|泪|sorry|sad|regret/i, emotions: ['sad', 'concerned'] },
  { pattern: /生气|愤怒|讨厌|该死|混蛋|烦|哼|angry|mad|hate|damn/i, emotions: ['angry', 'tsundere'] },
  { pattern: /惊讶|震惊|居然|真的吗|哇|天哪|啊\?|surprised|shocked|wow|amazing/i, emotions: ['surprised'] },
  { pattern: /害怕|恐惧|担心|吓|怕|scary|afraid|fear|worried/i, emotions: ['fearful', 'surprised'] },
  { pattern: /恶心|呕|disgust|gross/i, emotions: ['disgusted', 'angry'] },
  { pattern: /害羞|不好意思|羞|blush|shy|embarrassed/i, emotions: ['shy', 'embarrassed'] },
  { pattern: /困|累|疲倦|想睡|sleepy|tired|exhausted/i, emotions: ['sleepy', 'tired'] },
  { pattern: /疑惑|奇怪|不明白|咦|嗯\?|confused|puzzled|weird|strange/i, emotions: ['confused', 'thinking'] },
  { pattern: /思考|考虑|想想|想一下|琢磨|think|consider|wonder/i, emotions: ['thinking'] },
];

const EMOTION_ACTION_MAP: Record<string, string> = {
  happy: 'nod',
  warm: 'nod',
  sad: 'lookDown',
  concerned: 'lookUp',
  angry: 'shakeHead',
  tsundere: 'tiltLeft',
  surprised: 'eyeWide',
  fearful: 'shakeHead',
  disgusted: 'shakeHead',
  shy: 'lookDown',
  embarrassed: 'lookDown',
  sleepy: 'lookDown',
  tired: 'lookDown',
  confused: 'tiltLeft',
  thinking: 'tiltRight',
  neutral: 'nod',
  speaking: 'nod',
  listening: 'nod',
  bored: 'lookDown',
  excited: 'nod',
  proud: 'lookUp',
  apologetic: 'lookDown',
  nostalgic: 'tiltLeft',
  curious: 'tiltLeft',
  frustrated: 'shakeHead',
  relieved: 'nod',
};

function countChineseChars(text: string): number {
  return (text.match(/[\u4e00-\u9fa5]/g) || []).length;
}

function countEnglishWords(text: string): number {
  return (text.match(/[a-zA-Z]+/g) || []).length;
}

function countPunctuations(text: string): number {
  return (text.match(/[。！？；，.!?;:,]/g) || []).length;
}

export function estimateDuration(text: string): number {
  const chineseChars = countChineseChars(text);
  const englishWords = countEnglishWords(text);
  const punctuations = countPunctuations(text);

  const baseDuration = chineseChars * 250 + englishWords * 80;
  const pauseDuration = punctuations * 200;

  return Math.max(baseDuration + pauseDuration, 500);
}

export function detectEmotion(text: string): EmotionType {
  for (const { pattern, emotions } of EMOTION_PATTERNS) {
    if (pattern.test(text)) {
      return emotions[0];
    }
  }
  return 'neutral';
}

export function splitSentences(text: string): string[] {
  if (!text.trim()) return [];

  const parts = text.split(/([。！？；\n]+|[.!?]+\s+)/);
  const sentences: string[] = [];
  let current = '';

  for (const part of parts) {
    if (!part) continue;
    current += part;

    if (/[。！？；\n]|[.!?]+\s*$/.test(part)) {
      const trimmed = current.trim();
      if (trimmed) sentences.push(trimmed);
      current = '';
    }
  }

  if (current.trim()) {
    sentences.push(current.trim());
  }

  return sentences.length > 0 ? sentences : [text.trim()];
}

export function splitSmartSegments(text: string, maxChars: number = 20): string[] {
  const sentences = splitSentences(text);
  const segments: string[] = [];

  for (const sentence of sentences) {
    const chineseChars = countChineseChars(sentence);

    if (chineseChars <= maxChars) {
      segments.push(sentence);
      continue;
    }

    const subParts = sentence.split(/([，、,]\s*)/);
    let currentSegment = '';

    for (const part of subParts) {
      if (!part) continue;

      const testSegment = currentSegment + part;
      if (countChineseChars(testSegment) > maxChars && currentSegment) {
        segments.push(currentSegment.trim());
        currentSegment = part;
      } else {
        currentSegment = testSegment;
      }
    }

    if (currentSegment.trim()) {
      segments.push(currentSegment.trim());
    }
  }

  return segments.length > 0 ? segments : [text.trim()];
}

export function generateTimeline(text: string): TimelineEntry[] {
  const segments = splitSmartSegments(text);
  let currentTime = 0;

  return segments.map((segment, index) => {
    const duration = estimateDuration(segment);
    const emotion = detectEmotion(segment);
    const mappedAction = EMOTION_ACTION_MAP[emotion] || 'nod';
    const action = actionRegistry.get(mappedAction) ? mappedAction
      : actionRegistry.getBestActionForEmotion(emotion) || 'nod';

    const entry: TimelineEntry = {
      id: `entry-${index}-${Date.now()}`,
      startTime: currentTime,
      endTime: currentTime + duration,
      text: segment,
      emotion,
      action,
      intensity: 0.8,
    };

    currentTime += duration;
    return entry;
  });
}

// ══════════ 动作时间轴模式（新架构） ══════════

export interface ActionTimelineResult {
  mainTimeline: ActionTimelineItem[];
  persistentMicro: ActionTimelineItem[];
  actionIds: string[];
  ruleEmotion: string;
  llmUsed: boolean;
}

/**
 * 生成动作时间轴（新架构入口）
 * 1. SemanticActionMapper 映射情绪 → actionId[]
 * 2. ActionCompositor 排布时序、处理冲突
 * 3. 输出可调度的时间轴 + 常驻微动作
 */
export async function generateActionTimeline(
  text: string,
  faceEmotionInput: FaceEmotionInput = { emotion: 'neutral', weight: 0 }
): Promise<ActionTimelineResult> {
  const mapResult = await semanticActionMapper.map(text, faceEmotionInput);

  const mainTimeline = actionCompositor.composeTimeline(mapResult.actionIds);
  const persistentMicro = actionCompositor.buildPersistentMicroActions(['breath']);

  return {
    mainTimeline,
    persistentMicro,
    actionIds: mapResult.actionIds,
    ruleEmotion: mapResult.ruleEmotion,
    llmUsed: mapResult.llmUsed,
  };
}

/**
 * 一站式调用：生成时间轴 + 载入调度器 + 开始播放
 * 适合在业务层直接调用
 */
export async function playActionTimeline(
  text: string,
  faceEmotionInput: FaceEmotionInput = { emotion: 'neutral', weight: 0 },
  onFrame?: (frame: Record<string, number>) => void
): Promise<ActionTimelineResult> {
  const result = await generateActionTimeline(text, faceEmotionInput);

  live2dActionScheduler.loadTimeline({
    mainTimeline: result.mainTimeline,
    persistentMicro: result.persistentMicro,
  });

  if (onFrame) {
    live2dActionScheduler.setFrameCallback(onFrame);
  }

  live2dActionScheduler.play();

  return result;
}