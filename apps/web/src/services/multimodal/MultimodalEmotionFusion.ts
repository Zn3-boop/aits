// ============================================
// 多模态情绪融合器
// ============================================

export type EmotionType =
  | "neutral" | "happy" | "sad" | "angry"
  | "surprised" | "fearful" | "disgusted" | "excited" | "shy" | "thinking"
  | "confused" | "bored" | "relieved" | "frustrated" | "nostalgic"
  | "curious" | "apologetic" | "proud" | "warm" | "concerned"
  | "sleepy" | "tsundere";

export interface EmotionResult {
  type: EmotionType;
  intensity: number;
  confidence: number;
  source: "voice" | "video" | "fused" | "none";
}

export interface VoiceEmotionData {
  pitchMean: number;
  pitchVariance: number;
  energyMean: number;
  speechRate: number;
}

export interface VideoEmotionData {
  expression: EmotionType;
  intensity: number;
}

/**
 * 多模态情绪融合器
 * 规则：
 * - 单通道：直接透传
 * - 双通道：加权融合，视频权重 0.6（表情更直接），语音权重 0.4
 * - 冲突时：优先视频（表情不会说谎）；但如果视频是 neutral 且语音很激动，相信语音
 */
export class MultimodalEmotionFusion {
  private lastFused: EmotionResult | null = null;

  fuse(voice: VoiceEmotionData | null, video: VideoEmotionData | null): EmotionResult {
    if (!voice && video) return { ...video, confidence: 0.75, source: "video" };
    if (voice && !video) return { ...this.inferFromVoice(voice), source: "voice" };
    if (voice && video) return this.fuseBoth(voice, video);
    return { type: "neutral", intensity: 0.1, confidence: 0.5, source: "none" };
  }

  private inferFromVoice(v: VoiceEmotionData): Omit<EmotionResult, "source"> {
    if (v.pitchVariance > 80 && v.energyMean > 0.7) return { type: "excited", intensity: 0.85, confidence: 0.7 };
    if (v.pitchVariance > 60 && v.energyMean > 0.6) return { type: "angry", intensity: 0.8, confidence: 0.65 };
    if (v.energyMean < 0.25 && v.pitchMean < 120) return { type: "sad", intensity: 0.7, confidence: 0.6 };
    if (v.pitchVariance < 20 && v.energyMean < 0.3) return { type: "neutral", intensity: 0.4, confidence: 0.6 };
    if (v.pitchMean > 300 && v.energyMean > 0.5) return { type: "happy", intensity: 0.75, confidence: 0.65 };
    if (v.speechRate > 5 && v.energyMean > 0.5) return { type: "excited", intensity: 0.7, confidence: 0.6 };
    return { type: "neutral", intensity: 0.3, confidence: 0.5 };
  }

  private fuseBoth(voice: VoiceEmotionData, video: VideoEmotionData): EmotionResult {
    const voiceEmo = this.inferFromVoice(voice);
    if (voiceEmo.type === video.expression) {
      return {
        type: video.expression,
        intensity: Math.min(1.0, video.intensity * 0.6 + voiceEmo.intensity * 0.4 + 0.15),
        confidence: Math.min(1.0, 0.9),
        source: "fused",
      };
    }
    if (video.expression === "neutral" && voiceEmo.intensity > 0.6) {
      return { ...voiceEmo, source: "fused", confidence: 0.65 };
    }
    return { type: video.expression, intensity: video.intensity, confidence: 0.75, source: "fused" };
  }

  getLastFused(): EmotionResult | null {
    return this.lastFused;
  }
}

export const emotionFusion = new MultimodalEmotionFusion();