import { useEffect, useRef, useState, useCallback } from 'react';
import { logger } from '../utils/logger';

export interface BodyFeatures {
  rightHandRaise: number;
  leftHandRaise: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  bodyLean: number;
  detected: boolean;
}

export type UserEmotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'fearful' | 'disgusted';

export interface MultiMediaPipeData {
  mouthOpen: number;
  eyeBlink: boolean;
  eyeOpenness: number;
  mouthSmile: number;
  browRaise: number;
  browFurrow: number;
  eyeDirection: { x: number; y: number };
  body: BodyFeatures;
  emotion: UserEmotion;
  emotionConfidence: number;
  faceDetected: boolean;
  bodyDetected: boolean;
  timestamp: number;
  blendshapes: Record<string, number>;
}

interface UseMultiMediaPipeOptions {
  enabled?: boolean;
  onData?: (data: MultiMediaPipeData) => void;
}

const _BLENDSHAPE_TO_EMOTION: Record<string, { emotion: UserEmotion; weight: number }> = {
  'mouthSmileLeft': { emotion: 'happy', weight: 0.7 },
  'mouthSmileRight': { emotion: 'happy', weight: 0.7 },
  'mouthFrownLeft': { emotion: 'sad', weight: 0.8 },
  'mouthFrownRight': { emotion: 'sad', weight: 0.8 },
  'browInnerUp': { emotion: 'surprised', weight: 0.7 },
  'eyeWideLeft': { emotion: 'surprised', weight: 0.6 },
  'eyeWideRight': { emotion: 'surprised', weight: 0.6 },
  'jawOpen': { emotion: 'surprised', weight: 0.25 },
  'browDownLeft': { emotion: 'angry', weight: 0.8 },
  'browDownRight': { emotion: 'angry', weight: 0.8 },
  'mouthPressLeft': { emotion: 'angry', weight: 0.5 },
  'mouthPressRight': { emotion: 'angry', weight: 0.5 },
  'mouthStretchLeft': { emotion: 'fearful', weight: 0.6 },
  'mouthStretchRight': { emotion: 'fearful', weight: 0.6 },
  'noseSneerLeft': { emotion: 'disgusted', weight: 0.8 },
  'noseSneerRight': { emotion: 'disgusted', weight: 0.8 },
  'cheekSquintLeft': { emotion: 'happy', weight: 0.25 },
  'cheekSquintRight': { emotion: 'happy', weight: 0.25 },
  'chinRaiserLower': { emotion: 'sad', weight: 0.5 },
  'mouthPucker': { emotion: 'fearful', weight: 0.4 },
  'jawForward': { emotion: 'angry', weight: 0.3 },
  'mouthFunnel': { emotion: 'fearful', weight: 0.3 },
  'mouthShrugLower': { emotion: 'surprised', weight: 0.2 },
  'mouthShrugUpper': { emotion: 'surprised', weight: 0.2 },
  'tongueOut': { emotion: 'happy', weight: 0.1 },
};

// 校准数据存储
let calibrationData: {
  baselineSmile: number;
  baselineFrown: number;
  baselineBrowDown: number;
  baselineBrowUp: number;
  baselineJawOpen: number;
  baselineEyeWide: number;
  baselineNoseSneer: number;
  baselineCheekSquint: number;
  isCalibrated: boolean;
} = {
  baselineSmile: 0,
  baselineFrown: 0,
  baselineBrowDown: 0,
  baselineBrowUp: 0,
  baselineJawOpen: 0,
  baselineEyeWide: 0,
  baselineNoseSneer: 0,
  baselineCheekSquint: 0,
  isCalibrated: false,
};

// 导出校准函数供外部调用
export function calibrateEmotion(baselineBlendshapes: Record<string, number>) {
  calibrationData = {
    baselineSmile: ((baselineBlendshapes['mouthSmileLeft'] || 0) + (baselineBlendshapes['mouthSmileRight'] || 0)) / 2,
    baselineFrown: ((baselineBlendshapes['mouthFrownLeft'] || 0) + (baselineBlendshapes['mouthFrownRight'] || 0)) / 2,
    baselineBrowDown: ((baselineBlendshapes['browDownLeft'] || 0) + (baselineBlendshapes['browDownRight'] || 0)) / 2,
    baselineBrowUp: baselineBlendshapes['browInnerUp'] || 0,
    baselineJawOpen: baselineBlendshapes['jawOpen'] || 0,
    baselineEyeWide: ((baselineBlendshapes['eyeWideLeft'] || 0) + (baselineBlendshapes['eyeWideRight'] || 0)) / 2,
    baselineNoseSneer: ((baselineBlendshapes['noseSneerLeft'] || 0) + (baselineBlendshapes['noseSneerRight'] || 0)) / 2,
    baselineCheekSquint: ((baselineBlendshapes['cheekSquintLeft'] || 0) + (baselineBlendshapes['cheekSquintRight'] || 0)) / 2,
    isCalibrated: true,
  };
  console.log('[Emotion] 校准完成:', calibrationData);
}

function classifyFromBlendshapes(blendshapes: Record<string, number>, headPitch: number = 0): { emotion: UserEmotion; confidence: number; scores: Record<UserEmotion, number> } {
  // 提取所有关键特征
  const smileL = blendshapes['mouthSmileLeft'] || 0;
  const smileR = blendshapes['mouthSmileRight'] || 0;
  const avgSmile = (smileL + smileR) / 2;

  const browUp = blendshapes['browInnerUp'] || 0;
  const browDownL = blendshapes['browDownLeft'] || 0;
  const browDownR = blendshapes['browDownRight'] || 0;
  const avgBrowDown = (browDownL + browDownR) / 2;

  const eyeWideL = blendshapes['eyeWideLeft'] || 0;
  const eyeWideR = blendshapes['eyeWideRight'] || 0;
  const avgEyeWide = (eyeWideL + eyeWideR) / 2;
  const jawOpen = blendshapes['jawOpen'] || 0;

  const eyeSquintL = blendshapes['eyeSquintLeft'] || 0;
  const eyeSquintR = blendshapes['eyeSquintRight'] || 0;
  const avgEyeSquint = (eyeSquintL + eyeSquintR) / 2;
  const noseSneerL = blendshapes['noseSneerLeft'] || 0;
  const noseSneerR = blendshapes['noseSneerRight'] || 0;
  const avgNoseSneer = (noseSneerL + noseSneerR) / 2;

  const mouthFrownL = blendshapes['mouthFrownLeft'] || 0;
  const mouthFrownR = blendshapes['mouthFrownRight'] || 0;
  const avgFrown = (mouthFrownL + mouthFrownR) / 2;

  const mouthStretchL = blendshapes['mouthStretchLeft'] || 0;
  const mouthStretchR = blendshapes['mouthStretchRight'] || 0;
  const avgStretch = (mouthStretchL + mouthStretchR) / 2;

  const mouthPressL = blendshapes['mouthPressLeft'] || 0;
  const mouthPressR = blendshapes['mouthPressRight'] || 0;
  const avgMouthPress = (mouthPressL + mouthPressR) / 2;

  const cheekSquintL = blendshapes['cheekSquintLeft'] || 0;
  const cheekSquintR = blendshapes['cheekSquintRight'] || 0;
  const avgCheekSquint = (cheekSquintL + cheekSquintR) / 2;

  // 提取更多特征
  const mouthFunnelL = blendshapes['mouthFunnelLeft'] || 0;
  const mouthFunnelR = blendshapes['mouthFunnelRight'] || 0;
  const avgMouthFunnel = (mouthFunnelL + mouthFunnelR) / 2;
  
  const eyeLookUpL = blendshapes['eyeLookUpLeft'] || 0;
  const eyeLookUpR = blendshapes['eyeLookUpRight'] || 0;
  const avgEyeLookUp = (eyeLookUpL + eyeLookUpR) / 2;
  
  const eyeLookDownL = blendshapes['eyeLookDownLeft'] || 0;
  const eyeLookDownR = blendshapes['eyeLookDownRight'] || 0;
  const _avgEyeLookDown = (eyeLookDownL + eyeLookDownR) / 2;

  // 计算相对于校准值的偏差
  const smileDelta = calibrationData.isCalibrated ? avgSmile - calibrationData.baselineSmile : avgSmile;
  const frownDelta = calibrationData.isCalibrated ? avgFrown - calibrationData.baselineFrown : avgFrown;
  const browDownDelta = calibrationData.isCalibrated ? avgBrowDown - calibrationData.baselineBrowDown : avgBrowDown;
  const browUpDelta = calibrationData.isCalibrated ? browUp - calibrationData.baselineBrowUp : browUp;
  const jawOpenDelta = calibrationData.isCalibrated ? jawOpen - calibrationData.baselineJawOpen : jawOpen;
  const eyeWideDelta = calibrationData.isCalibrated ? avgEyeWide - calibrationData.baselineEyeWide : avgEyeWide;
  const noseSneerDelta = calibrationData.isCalibrated ? avgNoseSneer - calibrationData.baselineNoseSneer : avgNoseSneer;
  const cheekSquintDelta = calibrationData.isCalibrated ? avgCheekSquint - calibrationData.baselineCheekSquint : avgCheekSquint;

  // 平衡所有情绪的初始分数
  const scores: Record<UserEmotion, number> = {
    neutral: 0.3, happy: 0.15, sad: 0.15, angry: 0.15, surprised: 0.15, fearful: 0.15, disgusted: 0.15,
  };

  // ========== 情绪分类逻辑（使用偏差值）==========
  
  // 1. NEUTRAL 检测（无明显表情特征时）
  const hasNoExpression = smileDelta < 0.12 && frownDelta < 0.08 && browDownDelta < 0.1 && browUpDelta < 0.1 && jawOpenDelta < 0.08 && eyeWideDelta < 0.08;
  if (hasNoExpression) {
    scores.neutral += 0.5;
  }

  // 2. HAPPY 检测 - 需要嘴角上扬 + 眯眼（杜式微笑），且嘴巴不要张开太多
  // 关键：happy 不需要嘴巴张开，需要和 surprise 区分开
  if (smileDelta > 0.2 && cheekSquintDelta > 0.08 && jawOpenDelta < 0.15) {
    scores.happy += smileDelta * 0.8 + cheekSquintDelta * 0.5;
  } else if (smileDelta > 0.3 && jawOpenDelta < 0.2) {
    scores.happy += smileDelta * 0.5;
  }

  // 3. SAD 检测 - 嘴角下垂是核心特征
  // 嘴角下垂
  if (frownDelta > 0.08) {
    scores.sad += frownDelta * 0.8;
  }
  // 眉毛内角上扬（悲伤眉）
  if (browUpDelta > 0.12) {
    scores.sad += browUpDelta * 0.5;
  }
  // 悲伤时眼睛微微眯着（不是惊讶睁大）
  if (frownDelta > 0.06 && eyeWideDelta < 0.1) {
    scores.sad += 0.4;
  }
  // 头部略微低下
  if (frownDelta > 0.06 && headPitch < -0.02) {
    scores.sad += 0.35;
  }

  // 4. ANGRY 检测 - 皱眉（降低阈值让小皱眉也能检测到）
  if (browDownDelta > 0.05) {
    scores.angry += browDownDelta * 0.7;
  }
  // 嘴唇紧绷
  if (avgMouthPress > 0.1) {
    scores.angry += avgMouthPress * 0.4;
  }
  // 头部前倾 + 皱眉 = 愤怒
  if (browDownDelta > 0.1 && headPitch > 0.03) {
    scores.angry += 0.5;
  }
  // 强烈愤怒
  if (browDownDelta > 0.2 && smileDelta < 0.05) {
    scores.angry += 0.45;
  }

  // 5. SURPRISED 检测 - 眉毛上扬 + 嘴巴张开（关键区分点）
  // 和 happy 的区别：surprise 需要嘴巴明显张开
  if (browUpDelta > 0.15 && jawOpenDelta > 0.1) {
    scores.surprised += (browUpDelta + jawOpenDelta) * 0.6;
  }
  // 眼睛睁大 + 嘴巴张开
  if (eyeWideDelta > 0.15 && jawOpenDelta > 0.08) {
    scores.surprised += 0.5;
  }
  // 眉毛上扬 + 眼睛睁大 + 嘴巴张开（完整惊讶）
  if (browUpDelta > 0.18 && eyeWideDelta > 0.1 && jawOpenDelta > 0.12) {
    scores.surprised += 0.55;
  }

  // 6. FEARFUL 检测 - 眉毛上扬 + 眼睛睁大 + 嘴巴微张/嘟嘴
  if (avgStretch > 0.1 || avgMouthFunnel > 0.1) {
    scores.fearful += (avgStretch + avgMouthFunnel) * 0.6;
  }
  // 眼睛睁大 + 眉毛上扬
  if (eyeWideDelta > 0.12 && browUpDelta > 0.1) {
    scores.fearful += eyeWideDelta * 0.4 + browUpDelta * 0.35;
  }
  // 眼睛上翻 + 眉毛上扬
  if (avgEyeLookUp > 0.15 && browUpDelta > 0.12) {
    scores.fearful += 0.45;
  }

  // 7. DISGUSTED 检测 - 鼻皱 + 眯眼/嘴角下压
  if (noseSneerDelta > 0.1) {
    scores.disgusted += noseSneerDelta * 0.75;
  }
  // 眯眼 + 鼻皱
  if (noseSneerDelta > 0.08 && avgEyeSquint > 0.12) {
    scores.disgusted += noseSneerDelta * 0.5 + avgEyeSquint * 0.4;
  }
  // 嘴抿 + 鼻皱
  if (noseSneerDelta > 0.08 && avgMouthPress > 0.08) {
    scores.disgusted += noseSneerDelta * 0.45 + avgMouthPress * 0.35;
  }

  // ========== HAPPY vs SURPRISED 区分规则 ==========
  // 关键：嘴巴是否张开
  if (jawOpenDelta > 0.15 && smileDelta > 0.2) {
    // 嘴巴张开 + 微笑 = 惊喜或惊讶
    scores.surprised += 0.3;
    scores.happy *= 0.6; // 降低 happy 权重
  }
  if (jawOpenDelta < 0.1 && smileDelta > 0.2) {
    // 嘴巴不张开 + 微笑 = 开心的笑
    scores.happy += 0.35;
    scores.surprised *= 0.5; // 抑制惊讶
  }

  // ========== 交叉抑制规则 ==========
  
  // 微笑强烈时提升 happy
  if (smileDelta > 0.35) {
    scores.happy += 0.3;
    scores.sad *= 0.25;
    scores.disgusted *= 0.15;
    scores.angry *= 0.3;
  }
  
  // 皱眉强烈时抑制 happy
  if (browDownDelta > 0.25) {
    scores.happy *= 0.2;
  }
  
  // 嘴巴张开时抑制 fearful 和 disgusted
  if (jawOpenDelta > 0.18) {
    scores.fearful *= 0.4;
    scores.disgusted *= 0.35;
  }
  
  // 鼻皱强烈时抑制 happy
  if (noseSneerDelta > 0.15) {
    scores.happy *= 0.3;
  }

  // ========== 最终选择 ==========
  
  // 找到最高分和第二高分
  let maxEmotion: UserEmotion = 'neutral';
  let maxScore = scores.neutral;
  let secondScore = 0;
  for (const [e, s] of Object.entries(scores)) {
    if (s > maxScore) {
      secondScore = maxScore;
      maxScore = s;
      maxEmotion = e as UserEmotion;
    }
  }
  
  // 置信度计算：分数差距越大，置信度越高
  const scoreDiff = maxScore > 0 ? (maxScore - secondScore) / maxScore : 0;
  const confidence = Math.min(0.95, Math.max(0.3, scoreDiff));

  return { emotion: maxEmotion, confidence, scores };
}

export function useMultiMediaPipe(options: UseMultiMediaPipeOptions = {}) {
  const { enabled = true, onData } = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceLandmarkerRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimestampRef = useRef<number>(-1);
  const emotionHistoryRef = useRef<Array<{ emotion: UserEmotion; confidence: number; time: number }>>([]);
  const smoothedEmotionRef = useRef<UserEmotion>('neutral');
  const _smoothedConfidenceRef = useRef<number>(0);
  // 使用 ref 存储 processFrame 以避免递归调用时的引用问题
  const processFrameRef = useRef<(() => void) | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [emotion, setEmotion] = useState<UserEmotion>('neutral');
  const [confidence, setConfidence] = useState<number>(0);
  const [cameraEnabled, setCameraEnabled] = useState(false);

  const onDataRef = useRef(onData);
  useEffect(() => { onDataRef.current = onData; }, [onData]);

  const smoothEmotion = useCallback((raw: { emotion: UserEmotion; confidence: number; scores: Record<UserEmotion, number> }): { emotion: UserEmotion; confidence: number; scores: Record<UserEmotion, number> } => {
    const now = Date.now();
    const history = emotionHistoryRef.current;
    const lastEmotion = smoothedEmotionRef.current;
    const lastChangeTime = (emotionHistoryRef.current as unknown as { lastChangeTime?: number }).lastChangeTime || now;
    
    history.push({ emotion: raw.emotion, confidence: raw.confidence, time: now });
    while (history.length > 0 && now - history[0].time > 2000) {
      history.shift();
    }

    const counts: Record<UserEmotion, number> = {
      neutral: 0, happy: 0, sad: 0, angry: 0, surprised: 0, fearful: 0, disgusted: 0,
    };
    let totalConf = 0;
    const weightedConf: Record<UserEmotion, number> = {
      neutral: 0, happy: 0, sad: 0, angry: 0, surprised: 0, fearful: 0, disgusted: 0,
    };

    for (const entry of history) {
      const age = now - entry.time;
      const weight = 1 - (age / 2000) * 0.5;
      counts[entry.emotion] += weight;
      weightedConf[entry.emotion] += entry.confidence * weight;
      totalConf += entry.confidence * weight;
    }

    let best: UserEmotion = 'neutral';
    let bestScore = 0;
    for (const [e, c] of Object.entries(counts)) {
      if (c > bestScore) { bestScore = c; best = e as UserEmotion; }
    }

    // 迟滞机制：情绪切换需要满足更严格的条件
    const timeSinceLastChange = now - lastChangeTime;
    const hysteresisWindow = 800; // 800ms 内不允许切换
    const scoreThreshold = 1.3; // 新情绪分数需要是当前情绪的 1.3 倍才能切换
    
    let finalEmotion = lastEmotion;
    if (timeSinceLastChange > hysteresisWindow || best !== lastEmotion) {
      if (best !== lastEmotion) {
        // 需要满足分数差距才能切换
        const lastEmotionScore = counts[lastEmotion] || 0;
        if (lastEmotionScore === 0 || bestScore / lastEmotionScore > scoreThreshold) {
          finalEmotion = best;
          (emotionHistoryRef.current as unknown as { lastChangeTime?: number }).lastChangeTime = now;
        }
      } else {
        finalEmotion = best;
      }
    } else {
      finalEmotion = lastEmotion;
    }

    smoothedEmotionRef.current = finalEmotion;
    const smoothConf = totalConf > 0 ? weightedConf[finalEmotion] / counts[finalEmotion] : 0.3;
    return { emotion: finalEmotion, confidence: smoothConf, scores: raw.scores };
  }, []);

  // 创建 processFrame 函数并存储到 ref
  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const landmarker = faceLandmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(() => processFrameRef.current?.());
      return;
    }

    const now = performance.now();
    if (now === lastTimestampRef.current) {
      animFrameRef.current = requestAnimationFrame(() => processFrameRef.current?.());
      return;
    }
    lastTimestampRef.current = now;

    try {
      let result: Awaited<ReturnType<typeof landmarker.detectForVideo>> | null = null;
      
      try {
        // 直接调用，避免潜在的 WASM 回调问题
        result = landmarker.detectForVideo(video, now);
      } catch (wasmErr) {
        // MediaPipe WASM 内部错误，记录但继续运行
        logger.warn('[MediaPipe] WASM 帧处理错误，尝试恢复:', wasmErr);
        // 重置 timestamp 以强制下一次重新处理
        lastTimestampRef.current = -1;
        animFrameRef.current = requestAnimationFrame(() => processFrameRef.current?.());
        return;
      }

      if (!result || !result.faceLandmarks || result.faceLandmarks.length === 0) {
        const emptyData: MultiMediaPipeData = {
          mouthOpen: 0, eyeBlink: false, eyeOpenness: 1, mouthSmile: 0,
          browRaise: 0, browFurrow: 0,
          eyeDirection: { x: 0, y: 0 },
          body: { rightHandRaise: 0, leftHandRaise: 0, headPitch: 0, headYaw: 0, headRoll: 0, bodyLean: 0, detected: false },
          emotion: 'neutral', emotionConfidence: 0,
          faceDetected: false, bodyDetected: false, timestamp: Date.now(),
          blendshapes: {},
        };
        onDataRef.current?.(emptyData);
        animFrameRef.current = requestAnimationFrame(() => processFrameRef.current?.());
        return;
      }

      const blendshapesArr = result.faceBlendshapes?.[0]?.categories;
      const bsMap: Record<string, number> = {};
      if (blendshapesArr) {
        for (const cat of blendshapesArr) {
          bsMap[cat.categoryName] = cat.score;
        }
      }
      
      // 提取所有特征值
      const jawOpen = bsMap['jawOpen'] || 0;
      const mouthSmileL = bsMap['mouthSmileLeft'] || 0;
      const mouthSmileR = bsMap['mouthSmileRight'] || 0;
      const eyeBlinkL = bsMap['eyeBlinkLeft'] || 0;
      const eyeBlinkR = bsMap['eyeBlinkRight'] || 0;
      const browInnerUp = bsMap['browInnerUp'] || 0;
      const browDownL = bsMap['browDownLeft'] || 0;
      const browDownR = bsMap['browDownRight'] || 0;
      const eyeLookLeft = bsMap['eyeLookOutLeft'] || 0;
      const eyeLookRight = bsMap['eyeLookInRight'] || 0;
      const eyeLookUpL = bsMap['eyeLookUpLeft'] || 0;
      const eyeLookUpR = bsMap['eyeLookUpRight'] || 0;

      const mouthOpen = Math.min(1, jawOpen * 1.5);
      const mouthSmile = (mouthSmileL + mouthSmileR) / 2;
      const eyeOpenness = Math.max(0, 1 - (eyeBlinkL + eyeBlinkR) / 2);
      const isBlink = (eyeBlinkL + eyeBlinkR) / 2 > 0.5;
      const browRaise = Math.min(1, browInnerUp);
      const browFurrow = Math.min(1, (browDownL + browDownR) / 2);

      const eyeDirX = (eyeLookLeft - eyeLookRight) * 2;
      const eyeDirY = ((eyeLookUpL + eyeLookUpR) / 2) * -2;

      const landmarks = result.faceLandmarks[0];
      const nose = landmarks[4];
      const forehead = landmarks[10];
      const chin = landmarks[152];
      const faceHeight = Math.abs(forehead.y - chin.y);
      const headPitch = faceHeight > 0.001 ? (nose.y - (forehead.y + chin.y) / 2) / faceHeight : 0;

      const leftEar = landmarks[234];
      const rightEar = landmarks[454];
      const leftEyeOuter = landmarks[33];
      const rightEyeOuter = landmarks[263];
      const faceWidth = Math.abs(leftEar.x - rightEar.x);
      const _headYaw = faceWidth > 0.001 ? (nose.x - (leftEar.x + rightEar.x) / 2) / faceWidth : 0;
      const _headRoll = Math.atan2(leftEyeOuter.y - rightEyeOuter.y, leftEyeOuter.x - rightEyeOuter.x);
      
      // 调试：每 120 帧输出一次 result 的所有属性
      const debugFrameRef = (window as unknown as { __debugFrameCount?: number }).__debugFrameCount ?? 0;
      if (debugFrameRef % 120 === 0) {
        console.log('[MediaPipe Debug] Result keys:', Object.keys(result));
        console.log('[MediaPipe Debug] faceClassifications:', result.faceClassifications);
        console.log('[MediaPipe Debug] faceBlendshapes length:', result.faceBlendshapes?.length);
        console.log('[MediaPipe Debug] First blendshape categories count:', result.faceBlendshapes?.[0]?.categories?.length);
      }
      
      // 尝试获取 MediaPipe 内置的情绪分类结果
      const classifications = result.faceClassifications?.[0];
      let builtInEmotion: string = 'neutral';
      let builtInEmotionScore: number = 0;
      
      if (classifications && classifications.length > 0) {
        // 找到最高分的分类
        for (const cat of classifications) {
          if (cat.score > builtInEmotionScore) {
            builtInEmotionScore = cat.score;
            builtInEmotion = cat.categoryName;
          }
        }
        
        // 映射 MediaPipe 的分类名称到我们的情绪类型
        const emotionMap: Record<string, UserEmotion> = {
          'neutral': 'neutral',
          'happy': 'happy',
          'sad': 'sad',
          'angry': 'angry',
          'surprised': 'surprised',
          'fearful': 'fearful',
          'disgusted': 'disgusted',
          'surprise': 'surprised',
          'fear': 'fearful',
          'disgust': 'disgusted',
          'anger': 'angry',
        };
        
        const mappedEmotion = emotionMap[builtInEmotion.toLowerCase()] || 'neutral';
        
        // 如果内置情绪置信度高，使用它
        if (builtInEmotionScore > 0.6) {
          setEmotion(mappedEmotion);
          setConfidence(builtInEmotionScore);
          
          const mergedData: MultiMediaPipeData = {
            mouthOpen,
            eyeBlink: isBlink,
            eyeOpenness,
            mouthSmile,
            browRaise,
            browFurrow,
            eyeDirection: { x: eyeDirX, y: eyeDirY },
            body: { rightHandRaise: 0, leftHandRaise: 0, headPitch, headYaw: _headYaw, headRoll: _headRoll, bodyLean: 0, detected: false },
            emotion: mappedEmotion,
            emotionConfidence: builtInEmotionScore,
            faceDetected: true,
            bodyDetected: false,
            timestamp: Date.now(),
            blendshapes: bsMap,
          };
          
          onDataRef.current?.(mergedData);
          window.dispatchEvent(new CustomEvent('multimediapipe-data', { detail: mergedData }));
          window.dispatchEvent(new CustomEvent('mediapipe-raw-emotion', {
            detail: {
              emotion: mappedEmotion,
              confidence: builtInEmotionScore,
              source: 'mediapipe-builtin',
              features: { mouthOpen, mouthSmile, eyeOpenness, eyeBlink: isBlink, browRaise, browFurrow },
            },
          }));
          
          animFrameRef.current = requestAnimationFrame(() => processFrameRef.current?.());
          return;
        }
      }
      
      // 调试：每 60 帧输出一次 blendshape 数据
      const frameCountRef = (window as unknown as { __debugFrameCount?: number }).__debugFrameCount ?? 0;
      (window as unknown as { __debugFrameCount?: number }).__debugFrameCount = frameCountRef + 1;
      if (frameCountRef % 60 === 0) {
        const keyValues = {
          smileL: bsMap['mouthSmileLeft'] || bsMap['MouthSmileLeft'],
          smileR: bsMap['mouthSmileRight'] || bsMap['MouthSmileRight'],
          frownL: bsMap['mouthFrownLeft'] || bsMap['MouthFrownLeft'],
          frownR: bsMap['mouthFrownRight'] || bsMap['MouthFrownRight'],
          browDownL: bsMap['browDownLeft'] || bsMap['BrowDownLeft'],
          browDownR: bsMap['browDownRight'] || bsMap['BrowDownRight'],
          browUp: bsMap['browInnerUp'] || bsMap['BrowInnerUp'],
          eyeWideL: bsMap['eyeWideLeft'] || bsMap['EyeWideLeft'],
          eyeWideR: bsMap['eyeWideRight'] || bsMap['EyeWideRight'],
          noseSneerL: bsMap['noseSneerLeft'] || bsMap['NoseSneerLeft'],
          noseSneerR: bsMap['noseSneerRight'] || bsMap['NoseSneerRight'],
          jawOpen: bsMap['jawOpen'] || bsMap['JawOpen'],
          cheekSquintL: bsMap['cheekSquintLeft'] || bsMap['CheekSquintLeft'],
          cheekSquintR: bsMap['cheekSquintRight'] || bsMap['CheekSquintRight'],
          mouthPressL: bsMap['mouthPressLeft'] || bsMap['MouthPressLeft'],
          mouthPressR: bsMap['mouthPressRight'] || bsMap['MouthPressRight'],
        };
        console.log('[MediaPipe Debug] Blendshapes:', JSON.stringify(keyValues, null, 2));
      }

      const { emotion: detectedEmotion, confidence: emotionConfidence, scores: emotionScores } = classifyFromBlendshapes(bsMap, headPitch);
      const { emotion: smoothedEmotion, confidence: smoothedConfidence, scores: smoothedScores } = smoothEmotion({ emotion: detectedEmotion, confidence: emotionConfidence, scores: emotionScores });

      setEmotion(smoothedEmotion);
      setConfidence(smoothedConfidence);

      const mergedData: MultiMediaPipeData = {
        mouthOpen,
        eyeBlink: isBlink,
        eyeOpenness,
        mouthSmile,
        browRaise,
        browFurrow,
        eyeDirection: { x: eyeDirX, y: eyeDirY },
        body: { rightHandRaise: 0, leftHandRaise: 0, headPitch, headYaw: _headYaw, headRoll: _headRoll, bodyLean: 0, detected: false },
        emotion: smoothedEmotion,
        emotionConfidence: smoothedConfidence,
        faceDetected: true,
        bodyDetected: false,
        timestamp: Date.now(),
        blendshapes: bsMap,
      };

      onDataRef.current?.(mergedData);

      window.dispatchEvent(new CustomEvent('multimediapipe-data', { detail: mergedData }));

      window.dispatchEvent(new CustomEvent('mediapipe-raw-emotion', {
        detail: {
          emotion: smoothedEmotion,
          confidence: smoothedConfidence,
          emotionScores: smoothedScores,
          source: 'mediapipe-tasks-vision',
          features: { mouthOpen, mouthSmile, eyeOpenness, eyeBlink: isBlink, browRaise, browFurrow },
        },
      }));
    } catch (err) {
      logger.warn('[MediaPipe] 帧处理错误:', err);
    }

    animFrameRef.current = requestAnimationFrame(() => processFrameRef.current?.());
  }, [smoothEmotion]);

  // 将 processFrame 存储到 ref
  useEffect(() => {
    processFrameRef.current = processFrame;
  }, [processFrame]);

  useEffect(() => {
    if (!enabled || !cameraEnabled) return;

    let cancelled = false;

    const init = async () => {
      try {
        logger.log('[MediaPipe] 📦 加载 FaceLandmarker (tasks-vision)...');

        const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');

        const vision = await FilesetResolver.forVisionTasks(
          '/mediapipe/wasm'
        );

        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/mediapipe/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
        });

        if (cancelled) {
          faceLandmarker.close();
          return;
        }

        faceLandmarkerRef.current = faceLandmarker;
        logger.log('[MediaPipe] ✅ FaceLandmarker 就绪 (blendshapes 已启用)');

        logger.log('[MediaPipe] 📷 启动摄像头...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        });
        streamRef.current = stream;

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (!cancelled) {
          setIsReady(true);
          setCameraActive(true);
          logger.log('[MediaPipe] ✅ 摄像头启动，开始检测');
          animFrameRef.current = requestAnimationFrame(() => processFrameRef.current?.());
        }
      } catch (err) {
        logger.error('[MediaPipe] ❌ 初始化失败:', err);
        if (!cancelled) setError(`MediaPipe 初始化失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    void init();

    return () => {
      cancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (faceLandmarkerRef.current) {
        try { faceLandmarkerRef.current.close(); } catch { /* ignore */ }
      }
      setIsReady(false);
      setCameraActive(false);
    };
  }, [enabled, cameraEnabled]);

  const toggleCamera = useCallback(() => {
    setCameraEnabled(prev => !prev);
  }, []);

  return {
    videoRef,
    canvasRef,
    isReady,
    error,
    cameraActive,
    cameraEnabled,
    emotion,
    confidence,
    toggleCamera,
  };
}