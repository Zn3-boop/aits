/**
 * Face Tracking Feature - 面部追踪与表情识别
 * 
 * 结合两种技术：
 * 1. MediaPipe FaceMesh - 468 个面部标志点（用于头部姿态、眼睛方向）
 * 2. MediaPipe Blendshapes - 52 个表情系数（用于精确表情识别）
 */

import type { EmotionType } from '../expression-bus';

// Blendshape 索引映射
export const BLENDSHAPE_INDICES: Record<string, number> = {
  // 眼睛
  eyeBlinkLeft: 0,
  eyeBlinkRight: 1,
  eyeWideLeft: 4,
  eyeWideRight: 5,
  
  // 嘴巴
  jawOpen: 13,
  mouthSmileLeft: 15,
  mouthSmileRight: 16,
  mouthFrownLeft: 17,
  mouthFrownRight: 18,
  mouthPucker: 19,
  mouthFunnel: 20,
  mouthStretchLeft: 22,
  mouthStretchRight: 23,
  
  // 眉毛
  browDownLeft: 26,
  browDownRight: 27,
  browInnerUp: 29,
  
  // 鼻子
  noseSneerLeft: 31,
  noseSneerRight: 32,
  
  // 脸颊
  cheekSquintLeft: 36,
  cheekSquintRight: 37,
};

// 可检测的情感类型（不包括系统状态）
type DetectableEmotion = 'happy' | 'sad' | 'angry' | 'surprised' | 'fearful' | 'disgusted' | 'neutral';

// Blendshape 到情感的高精度映射
const BLENDSHAPE_EMOTION_MAP: Array<{
  emotion: DetectableEmotion;
  blendshapes: Record<string, number>;
  weight: number;
}> = [
  {
    emotion: 'happy',
    blendshapes: {
      'mouthSmileLeft': 0.5,
      'mouthSmileRight': 0.5,
      'cheekSquintLeft': 0.3,
      'cheekSquintRight': 0.3,
    },
    weight: 1.0,
  },
  {
    emotion: 'sad',
    blendshapes: {
      'mouthFrownLeft': 0.4,
      'mouthFrownRight': 0.4,
      'browInnerUp': 0.3,
    },
    weight: 0.9,
  },
  {
    emotion: 'surprised',
    blendshapes: {
      'jawOpen': 0.4,
      'browInnerUp': 0.5,
      'eyeWideLeft': 0.4,
      'eyeWideRight': 0.4,
    },
    weight: 0.95,
  },
  {
    emotion: 'angry',
    blendshapes: {
      'browDownLeft': 0.5,
      'browDownRight': 0.5,
      'noseSneerLeft': 0.3,
      'noseSneerRight': 0.3,
    },
    weight: 0.85,
  },
  {
    emotion: 'fearful',
    blendshapes: {
      'mouthStretchLeft': 0.4,
      'mouthStretchRight': 0.4,
      'eyeWideLeft': 0.3,
      'eyeWideRight': 0.3,
    },
    weight: 0.8,
  },
  {
    emotion: 'disgusted',
    blendshapes: {
      'noseSneerLeft': 0.5,
      'noseSneerRight': 0.5,
      'mouthPucker': 0.3,
    },
    weight: 0.85,
  },
];

export interface FaceTrackingConfig {
  emotionThreshold: number;
  minConfidence: number;
  smoothingFactor: number;
  useMeshEnhancement: boolean;
}

const DEFAULT_CONFIG: FaceTrackingConfig = {
  emotionThreshold: 0.4,
  minConfidence: 0.6,
  smoothingFactor: 0.7,
  useMeshEnhancement: true,
};

class FaceTracker {
  private config: FaceTrackingConfig;
  private lastEmotion: DetectableEmotion = 'neutral';
  private emotionHistory: Array<{ emotion: DetectableEmotion; confidence: number; timestamp: number }> = [];
  private isTracking = false;
  private onEmotionChange?: (emotion: DetectableEmotion, confidence: number) => void;
  private expressionBus: { fromMediaPipe: (emotion: EmotionType, confidence: number) => void } | null = null;

  constructor(config: Partial<FaceTrackingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // 延迟加载 expression-bus
    import('../expression-bus').then(module => {
      this.expressionBus = module.expressionBus;
    }).catch(() => {
      console.warn('[FaceTracker] expression-bus 加载失败');
    });
  }

  processBlendshapes(blendshapes: number[]): void {
    if (!this.isTracking || !blendshapes || blendshapes.length < 52) return;

    const scores = this.calculateEmotionScores(blendshapes);
    const { emotion, confidence } = this.selectDominantEmotion(scores);

    if (emotion !== this.lastEmotion && confidence >= this.config.minConfidence) {
      this.lastEmotion = emotion;
      this.onEmotionChange?.(emotion, confidence);
      
      this.expressionBus?.fromMediaPipe(emotion, confidence);
      
      console.log(`[FaceTracker] 表情变化: ${emotion} (置信度: ${(confidence * 100).toFixed(1)}%)`);
    }

    this.emotionHistory.push({ emotion, confidence, timestamp: Date.now() });
    const cutoff = Date.now() - 30000;
    this.emotionHistory = this.emotionHistory.filter(e => e.timestamp > cutoff);
  }

  private calculateEmotionScores(blendshapes: number[]): Record<DetectableEmotion, number> {
    const scores: Record<DetectableEmotion, number> = {
      neutral: 0.1,
      happy: 0,
      sad: 0,
      angry: 0,
      surprised: 0,
      fearful: 0,
      disgusted: 0,
    };

    for (const mapping of BLENDSHAPE_EMOTION_MAP) {
      let score = 0;
      let count = 0;

      for (const [blendshape, threshold] of Object.entries(mapping.blendshapes)) {
        const index = BLENDSHAPE_INDICES[blendshape];
        if (index !== undefined && blendshapes[index] !== undefined) {
          const value = blendshapes[index];
          if (value > threshold) {
            score += (value - threshold) / (1 - threshold);
          }
          count++;
        }
      }

      if (count > 0) {
        scores[mapping.emotion] = (score / count) * mapping.weight;
      }
    }

    if (this.emotionHistory.length > 0) {
      const recent = this.emotionHistory.slice(-5);
      for (const emotion of Object.keys(scores) as DetectableEmotion[]) {
        if (emotion === 'neutral') continue;
        const recentScore = recent.filter(e => e.emotion === emotion).length / recent.length;
        scores[emotion] = scores[emotion] * (1 - this.config.smoothingFactor) + recentScore * this.config.smoothingFactor;
      }
    }

    return scores;
  }

  private selectDominantEmotion(scores: Record<DetectableEmotion, number>): { emotion: DetectableEmotion; confidence: number } {
    let maxScore = this.config.emotionThreshold;
    let dominantEmotion: DetectableEmotion = 'neutral';

    for (const [emotion, score] of Object.entries(scores)) {
      if (emotion === 'neutral') continue;
      if (score > maxScore) {
        maxScore = score;
        dominantEmotion = emotion as DetectableEmotion;
      }
    }

    if (maxScore < this.config.emotionThreshold) {
      return { emotion: 'neutral', confidence: maxScore };
    }

    return { emotion: dominantEmotion, confidence: maxScore };
  }

  start(onEmotionChange?: (emotion: DetectableEmotion, confidence: number) => void): void {
    this.isTracking = true;
    this.onEmotionChange = onEmotionChange;
    this.emotionHistory = [];
    console.log('[FaceTracker] 面部追踪已启动');
  }

  stop(): void {
    this.isTracking = false;
    this.lastEmotion = 'neutral';
    console.log('[FaceTracker] 面部追踪已停止');
  }

  updateConfig(config: Partial<FaceTrackingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getHistory(): Array<{ emotion: DetectableEmotion; confidence: number; timestamp: number }> {
    return [...this.emotionHistory];
  }
}

export const faceTracker = new FaceTracker();

export const faceTrackingFeaturePlaceholder = {
  name: 'face-tracking',
  status: 'active',
  description: 'MediaPipe FaceMesh (468点) + Blendshapes (52个) 融合追踪',
  tracker: faceTracker,
};
