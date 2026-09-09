import type { EmotionType, VoiceEmotionData, VideoEmotionData, EmotionResult } from "./MultimodalEmotionFusion";
import { emotionFusion } from "./MultimodalEmotionFusion";
import type { SemanticEmotionOutput, TextSentiment } from "./SemanticEmotionAnalyzer";
import { semanticEmotionAnalyzer } from "./SemanticEmotionAnalyzer";

export interface UnifiedEmotionInput {
  text: string;
  voiceEmotion: VoiceEmotionData | null;
  videoEmotion: VideoEmotionData | null;
  videoExpression?: string;
}

export interface UnifiedEmotionOutput {
  emotion: EmotionType;
  intensity: number;
  confidence: number;
  source: "local" | "ai-resolved" | "server-ai";
  localResult: SemanticEmotionOutput;
  aiResolved: boolean;
  consistency: "consistent" | "conflict" | "partial";
  textSentiment: TextSentiment | null;
}

interface AIEmotionResponse {
  emotion: string;
  confidence: number;
  reasoning: string;
}

const CACHE_TTL_MS = 3000;
const AI_CALL_MIN_INTERVAL_MS = 2000;

export class UnifiedEmotionOrchestrator {
  private cache = new Map<string, { result: UnifiedEmotionOutput; timestamp: number }>();
  private lastAICallTime = 0;
  private pendingAICall: Promise<UnifiedEmotionOutput | null> | null = null;

  async analyze(input: UnifiedEmotionInput): Promise<UnifiedEmotionOutput> {
    const localResult = semanticEmotionAnalyzer.analyze({
      text: input.text,
      voiceEmotion: input.voiceEmotion,
      videoEmotion: input.videoEmotion,
    });

    const fusedResult = emotionFusion.fuse(input.voiceEmotion, input.videoEmotion);

    const needAI = this.shouldCallAI(localResult, fusedResult, input);

    if (!needAI) {
      const output: UnifiedEmotionOutput = {
        emotion: localResult.emotion,
        intensity: localResult.intensity,
        confidence: localResult.confidence,
        source: "local",
        localResult,
        aiResolved: false,
        consistency: localResult.multimodalConsistency,
        textSentiment: localResult.textSentiment,
      };
      this.setCache(input.text, output);
      return output;
    }

    const cached = this.getCache(input.text);
    if (cached) return cached;

    const now = Date.now();
    if (now - this.lastAICallTime < AI_CALL_MIN_INTERVAL_MS) {
      return {
        emotion: localResult.emotion,
        intensity: localResult.intensity,
        confidence: localResult.confidence * 0.8,
        source: "local",
        localResult,
        aiResolved: false,
        consistency: localResult.multimodalConsistency,
        textSentiment: localResult.textSentiment,
      };
    }

    if (this.pendingAICall) {
      const aiResult = await this.pendingAICall;
      if (aiResult) return aiResult;
    }

    const aiResult = await this.callServerAI(input, localResult);
    if (aiResult) return aiResult;

    return {
      emotion: localResult.emotion,
      intensity: localResult.intensity,
      confidence: localResult.confidence,
      source: "local",
      localResult,
      aiResolved: false,
      consistency: localResult.multimodalConsistency,
      textSentiment: localResult.textSentiment,
    };
  }

  private shouldCallAI(
    localResult: SemanticEmotionOutput,
    fusedResult: EmotionResult,
    input: UnifiedEmotionInput,
  ): boolean {
    if (localResult.multimodalConsistency === "conflict") return true;

    if (localResult.confidence < 0.4 && input.text.length > 3) return true;

    if (input.voiceEmotion && !input.videoEmotion && input.text.length > 5) {
      if (localResult.textSentiment?.dominantEmotion === "neutral" || localResult.confidence < 0.5) {
        return true;
      }
    }

    if (!input.voiceEmotion && !input.videoEmotion && input.text.length > 8) {
      if (localResult.textSentiment?.dominantEmotion === "neutral") {
        return true;
      }
    }

    if (input.voiceEmotion && input.videoEmotion) {
      const voiceEmo = emotionFusion.fuse(input.voiceEmotion, null);
      if (voiceEmo.type !== fusedResult.type && voiceEmo.type !== "neutral" && fusedResult.type !== "neutral") {
        return true;
      }
    }

    if (localResult.textSentiment && input.videoEmotion) {
      const textEmo = localResult.textSentiment.dominantEmotion;
      const videoEmo = input.videoEmotion.expression;
      const positiveEmotions: EmotionType[] = ["happy", "excited"];
      const negativeEmotions: EmotionType[] = ["sad", "angry", "fearful", "disgusted"];
      const textIsPos = positiveEmotions.includes(textEmo);
      const textIsNeg = negativeEmotions.includes(textEmo);
      const videoIsPos = positiveEmotions.includes(videoEmo);
      const videoIsNeg = negativeEmotions.includes(videoEmo);
      if ((textIsPos && videoIsNeg) || (textIsNeg && videoIsPos)) return true;
    }

    if (input.text.length > 10 && localResult.textSentiment?.dominantEmotion === "neutral" && fusedResult.type === "neutral") {
      return true;
    }

    return false;
  }

  private async callServerAI(
    input: UnifiedEmotionInput,
    localResult: SemanticEmotionOutput,
  ): Promise<UnifiedEmotionOutput | null> {
    const now = Date.now();
    this.lastAICallTime = now;

    const callPromise = (async (): Promise<UnifiedEmotionOutput | null> => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/emotion/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            text: input.text,
            voiceEmotion: input.voiceEmotion ?? undefined,
            videoEmotion: input.videoEmotion ? { expression: input.videoEmotion.expression, intensity: input.videoEmotion.intensity } : undefined,
            videoExpression: input.videoExpression,
            localEmotion: localResult.emotion,
            localConfidence: localResult.confidence,
            consistency: localResult.multimodalConsistency,
          }),
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) return null;

        const data = await response.json() as {
          emotion?: string;
          confidence?: number;
          reasoning?: string;
          source?: string;
          aiResolved?: boolean;
        };

        const validEmotions: EmotionType[] = ["neutral", "happy", "sad", "angry", "surprised", "fearful", "disgusted", "excited", "shy", "thinking", "confused", "bored", "relieved", "frustrated", "nostalgic", "curious", "apologetic", "proud", "warm", "concerned", "sleepy", "tsundere"];
        if (data.emotion && validEmotions.includes(data.emotion as EmotionType)) {
          const output: UnifiedEmotionOutput = {
            emotion: data.emotion as EmotionType,
            intensity: localResult.intensity,
            confidence: Math.min(1.0, Math.max(0.1, data.confidence || 0.5)),
            source: "server-ai",
            localResult,
            aiResolved: true,
            consistency: localResult.multimodalConsistency,
            textSentiment: localResult.textSentiment,
          };
          this.setCache(input.text, output);
          return output;
        }

        return null;
      } catch (err) {
        console.warn('[UnifiedEmotion] 服务端AI调用失败，使用本地结果:', err);
        return null;
      }
    })();

    this.pendingAICall = callPromise;
    const result = await callPromise;
    this.pendingAICall = null;
    return result;
  }

  private getCache(text: string): UnifiedEmotionOutput | null {
    const key = this.cacheKey(text);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry.result;
  }

  private setCache(text: string, result: UnifiedEmotionOutput) {
    const key = this.cacheKey(text);
    this.cache.set(key, { result, timestamp: Date.now() });
    if (this.cache.size > 50) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) this.cache.delete(oldest[0]);
    }
  }

  private cacheKey(text: string): string {
    return text.slice(0, 50);
  }
}

export const unifiedEmotionOrchestrator = new UnifiedEmotionOrchestrator();