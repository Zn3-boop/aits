import type { EmotionType, VoiceEmotionData, VideoEmotionData, EmotionResult } from "./MultimodalEmotionFusion";
import { emotionFusion } from "./MultimodalEmotionFusion";

export interface SemanticEmotionInput {
  text: string;
  voiceEmotion: VoiceEmotionData | null;
  videoEmotion: VideoEmotionData | null;
}

export interface SemanticEmotionOutput {
  emotion: EmotionType;
  intensity: number;
  confidence: number;
  source: "voice" | "video" | "fused" | "text" | "text+fused";
  textSentiment: TextSentiment | null;
  multimodalConsistency: "consistent" | "conflict" | "partial";
}

export interface TextSentiment {
  valence: number;  // -1.0 ~ 1.0 (负面 ~ 正面)
  arousal: number;  // 0.0 ~ 1.0 (平静 ~ 激动)
  dominantEmotion: EmotionType;
  keywords: string[];
}

const EMOTION_KEYWORDS: Record<EmotionType, string[]> = {
  happy: ["开心", "高兴", "快乐", "喜欢", "爱", "棒", "太好了", "哈哈", "嘻嘻", "谢谢", "美好", "幸福", "happy", "love", "great", "awesome", "wonderful", "thanks", "lol", "haha"],
  sad: ["难过", "伤心", "悲伤", "哭", "失望", "遗憾", "可惜", "心痛", "sad", "sorry", "miss", "unfortunately", "disappointed"],
  angry: ["生气", "愤怒", "烦", "讨厌", "恨", "气死", "混蛋", "angry", "hate", "annoying", "furious", "damn"],
  surprised: ["哇", "天哪", "真的吗", "不敢相信", "意外", "震惊", "wow", "omg", "really", "unbelievable", "surprising"],
  fearful: ["害怕", "恐惧", "担心", "焦虑", "紧张", "afraid", "scared", "worried", "anxious", "nervous"],
  disgusted: ["恶心", "讨厌", "反感", "厌恶", "disgusting", "gross", "yuck"],
  excited: ["激动", "兴奋", "期待", "迫不及待", "太棒了", "excited", "thrilled", "cant wait", "amazing"],
  shy: ["害羞", "不好意思", "脸红", "shy", "embarrassed", "blush"],
  thinking: ["嗯", "让我想想", "考虑", "思考", "hmm", "think", "wonder", "maybe", "perhaps", "let me see"],
  confused: ["不懂", "不明白", "什么意思", "困惑", "搞不懂", "confused", "what", "dont understand", "pardon"],
  bored: ["无聊", "没意思", "好闷", "boring", "bored", "dull", "tedious"],
  relieved: ["松了口气", "终于", "还好", "幸好", "relieved", "phew", "finally", "glad"],
  frustrated: ["烦死了", "受不了", "崩溃", "抓狂", "frustrated", "ugh", "argh", "cant stand"],
  nostalgic: ["怀念", "回忆", "以前", "过去", "那时候", "nostalgic", "remember", "miss those days", "used to"],
  curious: ["好奇", "想知道", "为什么", "怎么", "curious", "wonder", "why", "how come", "tell me"],
  apologetic: ["对不起", "抱歉", "不好意思", "我的错", "sorry", "apologize", "my bad", "forgive"],
  proud: ["骄傲", "自豪", "做到了", "成功", "proud", "accomplished", "did it", "achievement"],
  warm: ["温暖", "感动", "贴心", "暖心", "warm", "touched", "sweet", "heartwarming"],
  concerned: ["担心", "忧虑", "在乎", "关切", "concerned", "worried", "care", "hope youre ok"],
  sleepy: ["困了", "好累", "想睡", "打哈欠", "sleepy", "tired", "exhausted", "yawn"],
  tsundere: ["哼", "才不是", "别误会", "才没有", "hmph", "its not like"],
  neutral: [],
};

export class SemanticEmotionAnalyzer {
  analyze(input: SemanticEmotionInput): SemanticEmotionOutput {
    const textSentiment = this.analyzeText(input.text);
    const fusedResult = emotionFusion.fuse(input.voiceEmotion, input.videoEmotion);

    if (!input.voiceEmotion && !input.videoEmotion && textSentiment) {
      return {
        emotion: textSentiment.dominantEmotion,
        intensity: Math.max(textSentiment.arousal, 0.3),
        confidence: textSentiment.valence !== 0 ? 0.6 : 0.3,
        source: "text",
        textSentiment,
        multimodalConsistency: "partial",
      };
    }

    if (textSentiment && input.voiceEmotion || input.videoEmotion) {
      const consistency = this.checkConsistency(textSentiment, fusedResult);
      if (consistency === "consistent") {
        return {
          emotion: fusedResult.type,
          intensity: Math.min(1.0, fusedResult.intensity + textSentiment.arousal * 0.2),
          confidence: Math.min(1.0, fusedResult.confidence + 0.15),
          source: "text+fused",
          textSentiment,
          multimodalConsistency: "consistent",
        };
      }
      if (consistency === "conflict") {
        if (textSentiment.arousal > 0.6 && fusedResult.confidence < 0.7) {
          return {
            emotion: textSentiment.dominantEmotion,
            intensity: textSentiment.arousal,
            confidence: 0.6,
            source: "text+fused",
            textSentiment,
            multimodalConsistency: "conflict",
          };
        }
        return {
          ...fusedResult,
          source: "text+fused",
          textSentiment,
          multimodalConsistency: "conflict",
        };
      }
    }

    return {
      ...fusedResult,
      textSentiment,
      multimodalConsistency: input.voiceEmotion || input.videoEmotion ? "partial" : "partial",
    };
  }

  analyzeText(text: string): TextSentiment | null {
    if (!text || text.trim().length < 2) return null;

    const lowerText = text.toLowerCase();
    const emotionScores: Record<string, number> = {};
    const matchedKeywords: string[] = [];

    for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
      let score = 0;
      for (const kw of keywords) {
        if (lowerText.includes(kw)) {
          score += kw.length;
          matchedKeywords.push(kw);
        }
      }
      if (score > 0) emotionScores[emotion] = score;
    }

    if (Object.keys(emotionScores).length === 0) {
      const hasQuestion = /[？?]/.test(text);
      const hasExclamation = /[！!]{2,}/.test(text);
      const hasEllipsis = /[…]{2,}|[。]{2,}/.test(text);

      let valence = 0;
      let arousal = 0.2;
      let dominantEmotion: EmotionType = "neutral";

      if (hasQuestion) { arousal = 0.4; dominantEmotion = "thinking"; }
      if (hasExclamation) { arousal = 0.6; valence = 0.3; dominantEmotion = "excited"; }
      if (hasEllipsis) { valence = -0.2; arousal = 0.3; dominantEmotion = "sad"; }

      return { valence, arousal, dominantEmotion, keywords: [] };
    }

    let maxEmotion = "neutral";
    let maxScore = 0;
    for (const [emotion, score] of Object.entries(emotionScores)) {
      if (score > maxScore) { maxScore = score; maxEmotion = emotion; }
    }

    const totalScore = Object.values(emotionScores).reduce((a, b) => a + b, 0);
    const positiveEmotions: EmotionType[] = ["happy", "excited", "warm", "proud", "relieved", "curious", "nostalgic"];
    const negativeEmotions: EmotionType[] = ["sad", "angry", "fearful", "disgusted", "frustrated", "bored", "concerned", "apologetic"];

    let valence = 0;
    for (const emo of positiveEmotions) {
      if (emotionScores[emo]) valence += emotionScores[emo] / totalScore;
    }
    for (const emo of negativeEmotions) {
      if (emotionScores[emo]) valence -= emotionScores[emo] / totalScore;
    }

    const arousal = Math.min(1.0, totalScore / 10);

    return {
      valence,
      arousal,
      dominantEmotion: maxEmotion as EmotionType,
      keywords: matchedKeywords,
    };
  }

  private checkConsistency(textSentiment: TextSentiment, fusedResult: EmotionResult): "consistent" | "conflict" | "partial" {
    const textEmo = textSentiment.dominantEmotion;
    const sensorEmo = fusedResult.type;

    if (textEmo === sensorEmo) return "consistent";

    const positiveEmotions: EmotionType[] = ["happy", "excited", "warm", "proud", "relieved", "curious", "nostalgic"];
    const negativeEmotions: EmotionType[] = ["sad", "angry", "fearful", "disgusted", "frustrated", "bored", "concerned", "apologetic"];

    const textIsPositive = positiveEmotions.includes(textEmo);
    const sensorIsPositive = positiveEmotions.includes(sensorEmo);
    const textIsNegative = negativeEmotions.includes(textEmo);
    const sensorIsNegative = negativeEmotions.includes(sensorEmo);

    if ((textIsPositive && sensorIsPositive) || (textIsNegative && sensorIsNegative)) return "consistent";
    if ((textIsPositive && sensorIsNegative) || (textIsNegative && sensorIsPositive)) return "conflict";

    return "partial";
  }
}

export const semanticEmotionAnalyzer = new SemanticEmotionAnalyzer();