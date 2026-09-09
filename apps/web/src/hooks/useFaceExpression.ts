/**
 * useFaceExpression - MediaPipe Face Mesh 468 点几何分析表情识别
 * 
 * 支持的表情类型：
 * - neutral: 中性/平静
 * - happy: 开心/微笑
 * - sad: 难过/悲伤
 * - angry: 生气/愤怒
 * - surprised: 惊讶
 * - fearful: 害怕/恐惧
 * - disgusted: 厌恶/恶心
 * - thinking: 思考（皱眉+眼神专注）
 * - bored: 无聊（眼神涣散）
 * - confused: 困惑（歪头）
 * - talking: 说话中（嘴唇动）
 * - listening: 聆听中（眼神专注）
 * - embarrassed: 尴尬（脸红检测）
 * - tired: 疲倦（眼皮下垂）
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';
import { expressionBus } from '../features/expression-bus';

export type Expression = 
  | 'neutral' 
  | 'happy' 
  | 'sad' 
  | 'angry' 
  | 'surprised' 
  | 'fearful' 
  | 'disgusted'
  | 'thinking'
  | 'bored'
  | 'confused'
  | 'talking'
  | 'listening'
  | 'embarrassed'
  | 'tired';

interface ExpressionResult {
  expression: Expression;
  confidence: number;
  intensity: number;
}

interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
}

// 面部特征点索引
const LANDMARKS = {
  // 嘴巴
  MOUTH_TOP: 0,
  MOUTH_BOTTOM: 17,
  MOUTH_LEFT: 61,
  MOUTH_RIGHT: 291,
  MOUTH_CORNER_LEFT: 291,
  MOUTH_CORNER_RIGHT: 61,
  
  // 眉毛
  LEFT_BROW_INNER: 105,
  LEFT_BROW_OUTER: 107,
  RIGHT_BROW_INNER: 334,
  RIGHT_BROW_OUTER: 336,
  
  // 眼睛
  LEFT_EYE_TOP: 159,
  LEFT_EYE_BOTTOM: 145,
  LEFT_EYE_LEFT: 33,
  LEFT_EYE_RIGHT: 133,
  LEFT_EYE_CENTER: 468, // refine landmarks
  
  RIGHT_EYE_TOP: 386,
  RIGHT_EYE_BOTTOM: 374,
  RIGHT_EYE_LEFT: 362,
  RIGHT_EYE_RIGHT: 263,
  RIGHT_EYE_CENTER: 473,
  
  // 鼻子
  NOSE_TIP: 4,
  NOSE_BRIDGE: 6,
  
  // 下巴/脸部
  CHIN: 152,
  
  // 脸颊（用于脸红检测）
  LEFT_CHEEK: 234,
  RIGHT_CHEEK: 454,
  
  // 前额（用于眼神专注检测）
  FOREHEAD_LEFT: 107,
  FOREHEAD_RIGHT: 336,
  FOREHEAD_CENTER: 10,
};

export function useFaceExpression(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [result, setResult] = useState<ExpressionResult>({
    expression: 'neutral',
    confidence: 0,
    intensity: 0,
  });

  const faceMeshRef = useRef<FaceMesh | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const lastEmitTime = useRef(0);
  const lastMediaPipeEmit = useRef(0);
  const historyRef = useRef<ExpressionResult[]>([]);
  
  // 用于检测眼神变化的平滑值
  const eyeFocusHistory = useRef<number[]>([]);
  const mouthMovementHistory = useRef<number[]>([]);

  const analyzeExpression = useCallback((landmarks: LandmarkPoint[]): ExpressionResult => {
    const L = LANDMARKS;
    
    // 计算距离的辅助函数
    const dist = (i: number, j: number) => {
      const dx = landmarks[i].x - landmarks[j].x;
      const dy = landmarks[i].y - landmarks[j].y;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const distNorm = (i: number, j: number) => {
      // 归一化距离（相对于两眼距离）
      const eyeDist = dist(L.LEFT_EYE_RIGHT, L.RIGHT_EYE_LEFT);
      return dist(i, j) / Math.max(eyeDist, 0.001);
    };

    // === 嘴巴分析 ===
    const mouthOpenH = dist(L.MOUTH_TOP, L.MOUTH_BOTTOM);
    const mouthW = dist(L.MOUTH_LEFT, L.MOUTH_RIGHT);
    const mouthAspectRatio = mouthOpenH / Math.max(mouthW, 0.001);
    
    // 嘴角上扬/下垂
    const mouthCenterY = (landmarks[L.MOUTH_TOP].y + landmarks[L.MOUTH_BOTTOM].y) / 2;
    const mouthCornerAvgY = (landmarks[L.MOUTH_LEFT].y + landmarks[L.MOUTH_RIGHT].y) / 2;
    const smileFactor = mouthCenterY - mouthCornerAvgY; // 正=微笑，负=下垂

    // === 眉毛分析 ===
    const browInnerDist = dist(L.LEFT_BROW_INNER, L.NOSE_BRIDGE);
    const browInnerDistR = dist(L.RIGHT_BROW_INNER, L.NOSE_BRIDGE);
    const avgBrowInnerH = (browInnerDist + browInnerDistR) / 2;
    const browInnerHNorm = avgBrowInnerH / Math.max(mouthW, 0.001);
    
    // 眉毛倾斜角度（内高=皱眉，外高=惊讶）
    const browAngle = Math.atan2(
      landmarks[L.LEFT_BROW_INNER].y - landmarks[L.LEFT_BROW_OUTER].y,
      landmarks[L.LEFT_BROW_INNER].x - landmarks[L.LEFT_BROW_OUTER].x
    ) + Math.atan2(
      landmarks[L.RIGHT_BROW_INNER].y - landmarks[L.RIGHT_BROW_OUTER].y,
      landmarks[L.RIGHT_BROW_INNER].x - landmarks[L.RIGHT_BROW_OUTER].x
    );
    const browAngleNorm = browAngle / Math.PI; // -1 到 1

    // === 眼睛分析 ===
    const leftEyeH = dist(L.LEFT_EYE_TOP, L.LEFT_EYE_BOTTOM);
    const leftEyeW = dist(L.LEFT_EYE_LEFT, L.LEFT_EYE_RIGHT);
    const leftEAR = leftEyeH / Math.max(leftEyeW, 0.001); // Eye Aspect Ratio
    
    const rightEyeH = dist(L.RIGHT_EYE_TOP, L.RIGHT_EYE_BOTTOM);
    const rightEyeW = dist(L.RIGHT_EYE_LEFT, L.RIGHT_EYE_RIGHT);
    const rightEAR = rightEyeH / Math.max(rightEyeW, 0.001);
    
    const avgEAR = (leftEAR + rightEAR) / 2;
    
    // 眼皮下垂程度（疲倦检测）
    const leftLidOpenness = leftEAR / 0.3; // 0.3 是完全睁开的参考值
    const rightLidOpenness = rightEAR / 0.3;
    const avgLidOpenness = (leftLidOpenness + rightLidOpenness) / 2;

    // === 眼神专注度 ===
    const noseX = landmarks[L.NOSE_TIP].x;
    const leftEyeCenterX = (landmarks[L.LEFT_EYE_LEFT].x + landmarks[L.LEFT_EYE_RIGHT].x) / 2;
    const rightEyeCenterX = (landmarks[L.RIGHT_EYE_LEFT].x + landmarks[L.RIGHT_EYE_RIGHT].x) / 2;
    const eyeCenterX = (leftEyeCenterX + rightEyeCenterX) / 2;
    const eyeCenterY = (landmarks[L.LEFT_EYE_TOP].y + landmarks[L.RIGHT_EYE_TOP].y) / 2;
    
    // 视线偏移（相对于面部中心）
    const gazeOffsetX = Math.abs(noseX - eyeCenterX);
    const gazeOffsetY = Math.abs(landmarks[L.NOSE_TIP].y - eyeCenterY);
    
    eyeFocusHistory.current.push(gazeOffsetX);
    if (eyeFocusHistory.current.length > 10) eyeFocusHistory.current.shift();
    const avgGazeOffset = eyeFocusHistory.current.reduce((a, b) => a + b, 0) / eyeFocusHistory.current.length;
    
    // 眼神专注度（偏移越小越专注）
    const focusIntensity = Math.max(0, 1 - avgGazeOffset * 10);

    // === 头部倾斜（困惑检测） ===
    const eyeLineAngle = Math.atan2(
      landmarks[L.LEFT_EYE_CENTER].y - landmarks[L.RIGHT_EYE_CENTER].y,
      landmarks[L.LEFT_EYE_CENTER].x - landmarks[L.RIGHT_EYE_CENTER].x
    );
    const headTilt = Math.abs(eyeLineAngle); // 头部倾斜角度

    // === 脸红检测 ===
    const leftCheekY = landmarks[L.LEFT_CHEEK].y;
    const foreheadY = landmarks[L.FOREHEAD_CENTER].y;
    const faceHeight = foreheadY - leftCheekY;
    const leftCheekLocalY = (landmarks[L.LEFT_CHEEK].y - foreheadY) / Math.max(faceHeight, 0.001);
    const rightCheekLocalY = (landmarks[L.RIGHT_CHEEK].y - foreheadY) / Math.max(faceHeight, 0.001);
    
    // 脸红程度（脸颊位置偏低+泛红）
    const blushIntensity = Math.max(0, 0.7 - leftCheekLocalY) + Math.max(0, 0.7 - rightCheekLocalY);

    // === 说话检测（嘴唇运动） ===
    mouthMovementHistory.current.push(mouthAspectRatio);
    if (mouthMovementHistory.current.length > 15) mouthMovementHistory.current.shift();
    const mouthVariance = mouthMovementHistory.current.reduce((sum, val, idx, arr) => {
      if (idx === 0) return 0;
      return sum + Math.abs(val - arr[idx - 1]);
    }, 0) / Math.max(mouthMovementHistory.current.length - 1, 1);
    const isTalking = mouthVariance > 0.02 && mouthAspectRatio > 0.1;

    // === 表情分类 ===
    let expr: Expression = 'neutral';
    let conf = 0;
    let intensity = 0;

    // 1. 惊讶：嘴巴大张 + 眉毛上扬
    if (mouthAspectRatio > 0.5 && browInnerHNorm > 0.12) {
      expr = 'surprised';
      conf = Math.min((mouthAspectRatio - 0.5) / 0.3 + (browInnerHNorm - 0.12) / 0.05, 1) * 0.9;
      intensity = Math.min(mouthAspectRatio / 0.7, 1);
    }
    // 2. 开心：嘴角上扬 + 嘴巴张开适中
    else if (smileFactor > 0.015 && mouthAspectRatio > 0.08 && browInnerHNorm > 0.09) {
      expr = 'happy';
      conf = Math.min(smileFactor / 0.03, 1) * 0.95;
      intensity = Math.min(mouthAspectRatio / 0.4, 1);
    }
    // 3. 难过：嘴角下垂 + 眉毛上扬
    else if (smileFactor < -0.008 && browInnerHNorm > 0.11) {
      expr = 'sad';
      conf = Math.min(Math.abs(smileFactor) / 0.02 + (browInnerHNorm - 0.11) / 0.03, 1) * 0.85;
      intensity = conf;
    }
    // 4. 生气：眉头紧锁（眉毛下压）+ 嘴巴紧闭
    else if (browAngleNorm < -0.3 && mouthAspectRatio < 0.15 && smileFactor < 0.01) {
      expr = 'angry';
      conf = Math.min(Math.abs(browAngleNorm + 0.3) / 0.3, 1) * 0.9;
      intensity = Math.min(1 - mouthAspectRatio / 0.15, 1);
    }
    // 5. 害怕：眼睛睁大 + 嘴巴张开 + 眉毛上扬
    else if (avgEAR > 0.28 && mouthAspectRatio > 0.35 && browInnerHNorm > 0.11) {
      expr = 'fearful';
      conf = Math.min((avgEAR - 0.28) / 0.12 + (mouthAspectRatio - 0.35) / 0.35, 1) * 0.85;
      intensity = conf;
    }
    // 6. 厌恶：嘴角下拉 + 眉头皱起
    else if (smileFactor < -0.012 && browAngleNorm < -0.2 && mouthAspectRatio < 0.2) {
      expr = 'disgusted';
      conf = Math.min(Math.abs(smileFactor + 0.012) / 0.02 + Math.abs(browAngleNorm + 0.2) / 0.3, 1) * 0.8;
      intensity = conf;
    }
    // 7. 说话中
    else if (isTalking && !isNaN(mouthVariance)) {
      expr = 'talking';
      conf = Math.min(mouthVariance * 50, 1) * 0.85;
      intensity = Math.min(mouthAspectRatio / 0.3, 1);
    }
    // 8. 思考：眉毛扬起一点 + 眼神专注
    else if (browInnerHNorm > 0.105 && focusIntensity > 0.7 && avgEAR < 0.26) {
      expr = 'thinking';
      conf = Math.min((browInnerHNorm - 0.105) / 0.03 + (focusIntensity - 0.7) / 0.3, 1) * 0.8;
      intensity = Math.min(1 - avgEAR / 0.26, 1);
    }
    // 9. 聆听中：眼神专注 + 嘴巴放松
    else if (focusIntensity > 0.75 && mouthAspectRatio < 0.15) {
      expr = 'listening';
      conf = Math.min(focusIntensity / 0.85, 1) * 0.85;
      intensity = focusIntensity;
    }
    // 10. 困惑：头部倾斜
    else if (headTilt > 0.15 && headTilt < 0.5) {
      expr = 'confused';
      conf = Math.min((headTilt - 0.15) / 0.2, 1) * 0.75;
      intensity = conf;
    }
    // 11. 疲倦：眼皮下垂 + 眼神涣散
    else if (avgLidOpenness < 0.7 && focusIntensity < 0.5) {
      expr = 'tired';
      conf = Math.min((0.7 - avgLidOpenness) / 0.3 + (0.5 - focusIntensity) / 0.5, 1) * 0.8;
      intensity = Math.max(0, 1 - avgLidOpenness / 0.7);
    }
    // 12. 无聊：眼神涣散 + 嘴巴放松
    else if (focusIntensity < 0.4 && mouthAspectRatio < 0.12 && avgLidOpenness > 0.5) {
      expr = 'bored';
      conf = Math.min((0.4 - focusIntensity) / 0.4, 1) * 0.75;
      intensity = conf;
    }
    // 13. 尴尬：脸红 + 眼神躲闪
    else if (blushIntensity > 0.3 && gazeOffsetX > 0.02) {
      expr = 'embarrassed';
      conf = Math.min(blushIntensity / 0.5, 1) * 0.8;
      intensity = Math.min(blushIntensity / 0.8, 1);
    }
    // 默认：中性
    else {
      expr = 'neutral';
      conf = 0.5;
      intensity = 0;
    }

    // 更新历史记录
    historyRef.current.push({ expression: expr, confidence: conf, intensity });
    if (historyRef.current.length > 5) historyRef.current.shift();

    // 使用投票机制确定最终表情
    const avgConf = historyRef.current.reduce((a, b) => a + b.confidence, 0) / historyRef.current.length;
    const voteCount = historyRef.current.reduce((acc, h) => {
      acc[h.expression] = (acc[h.expression] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const modeExpr = Object.entries(voteCount).sort((a, b) => b[1] - a[1])[0]?.[0] as Expression || 'neutral';

    return {
      expression: modeExpr,
      confidence: avgConf,
      intensity: historyRef.current.find((h) => h.expression === modeExpr)?.intensity || 0,
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults((results: { multiFaceLandmarks?: LandmarkPoint[][] }) => {
      if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;

      const landmarks = results.multiFaceLandmarks[0];
      const expr = analyzeExpression(landmarks);
      setResult(expr);

      const now = Date.now();

      // 发送表情事件（节流 400ms）
      if (now - lastEmitTime.current > 400) {
        lastEmitTime.current = now;
        if (expr.confidence > 0.4) {
          expressionBus.fromMediaPipe(expr.expression, expr.confidence);
        } else {
          expressionBus.fromMediaPipe('neutral', 0.5);
        }
      }

      // 发送 multimediapipe-data 事件（节流 100ms）
      if (now - lastMediaPipeEmit.current > 100) {
        lastMediaPipeEmit.current = now;

        const L = LANDMARKS;
        const dist = (i: number, j: number) => {
          const dx = landmarks[i].x - landmarks[j].x;
          const dy = landmarks[i].y - landmarks[j].y;
          return Math.sqrt(dx * dx + dy * dy);
        };

        const mouthH = dist(L.MOUTH_TOP, L.MOUTH_BOTTOM);
        const mouthW = dist(L.MOUTH_LEFT, L.MOUTH_RIGHT);
        const mar = mouthH / Math.max(mouthW, 0.001);
        const smileFactor = (landmarks[L.MOUTH_TOP].y + landmarks[L.MOUTH_BOTTOM].y) / 2 -
                           (landmarks[L.MOUTH_LEFT].y + landmarks[L.MOUTH_RIGHT].y) / 2;

        const browInnerH = (dist(L.LEFT_BROW_INNER, L.NOSE_BRIDGE) + dist(L.RIGHT_BROW_INNER, L.NOSE_BRIDGE)) / 2;
        const browAngle = Math.atan2(
          landmarks[L.LEFT_BROW_INNER].y - landmarks[L.LEFT_BROW_OUTER].y,
          landmarks[L.LEFT_BROW_INNER].x - landmarks[L.LEFT_BROW_OUTER].x
        );

        const leftEyeH = dist(L.LEFT_EYE_TOP, L.LEFT_EYE_BOTTOM);
        const leftEyeW = dist(L.LEFT_EYE_LEFT, L.LEFT_EYE_RIGHT);
        const rightEyeH = dist(L.RIGHT_EYE_TOP, L.RIGHT_EYE_BOTTOM);
        const rightEyeW = dist(L.RIGHT_EYE_LEFT, L.RIGHT_EYE_RIGHT);
        const leftEAR = leftEyeH / Math.max(leftEyeW, 0.001);
        const rightEAR = rightEyeH / Math.max(rightEyeW, 0.001);

        const nose = landmarks[L.NOSE_TIP];
        const leftEye = landmarks[L.LEFT_EYE_CENTER];
        const rightEye = landmarks[L.RIGHT_EYE_CENTER];
        const eyeCenterX = (leftEye.x + rightEye.x) / 2;
        const eyeCenterY = (leftEye.y + rightEye.y) / 2;

        window.dispatchEvent(
          new CustomEvent('multimediapipe-data', {
            detail: {
              faceDetected: true,
              emotion: expr.expression,
              confidence: expr.confidence,
              blendshapes: {
                jawOpen: Math.min(1, mar),
                mouthSmile: smileFactor > 0 ? Math.min(1, smileFactor / 0.03) : 0,
                mouthFrown: smileFactor < 0 ? Math.min(1, Math.abs(smileFactor) / 0.02) : 0,
                browInnerUp: browInnerH > 0.11 ? Math.min(1, (browInnerH - 0.11) / 0.05) : 0,
                browDown: browAngle < -0.3 ? Math.min(1, Math.abs(browAngle + 0.3) / 0.3) : 0,
                eyeBlinkLeft: leftEAR < 0.15 ? Math.min(1, (0.15 - leftEAR) / 0.15) : 0,
                eyeBlinkRight: rightEAR < 0.15 ? Math.min(1, (0.15 - rightEAR) / 0.15) : 0,
                eyeWideLeft: leftEAR > 0.28 ? Math.min(1, (leftEAR - 0.28) / 0.12) : 0,
                eyeWideRight: rightEAR > 0.28 ? Math.min(1, (rightEAR - 0.28) / 0.12) : 0,
                eyeLookOutLeft: Math.max(0, nose.x - eyeCenterX),
                eyeLookInRight: Math.max(0, eyeCenterX - nose.x),
                eyeLookUpLeft: Math.max(0, eyeCenterY - nose.y),
                eyeLookUpRight: Math.max(0, eyeCenterY - nose.y),
                eyeLookDownLeft: Math.max(0, nose.y - eyeCenterY),
                eyeLookDownRight: Math.max(0, nose.y - eyeCenterY),
                cheekPuff: 0,
                // 新增表情权重
                eyebrowRaiseLeft: Math.max(0, (browInnerH - 0.1) / 0.05),
                eyebrowRaiseRight: Math.max(0, (browInnerH - 0.1) / 0.05),
              },
              body: {
                headYaw: (nose.x - 0.5) * 2,
                headPitch: (nose.y - 0.5) * 2,
                headRoll: Math.atan2(
                  leftEye.y - rightEye.y,
                  leftEye.x - rightEye.x
                ) * 0.5,
              },
            },
          })
        );
      }
    });

    faceMeshRef.current = faceMesh;

    const camera = new Camera(video, {
      onFrame: async () => {
        await faceMesh.send({ image: video });
      },
      width: 320,
      height: 240,
    });

    cameraRef.current = camera;
    camera.start();

    return () => {
      camera.stop();
      faceMesh.close();
    };
  }, [videoRef, analyzeExpression]);

  return result;
}
