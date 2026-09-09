import type { EmotionType, VideoEmotionData } from "../multimodal/MultimodalEmotionFusion";

export class UserMediaPipeEmotion {
  private lastVideoEmotion: VideoEmotionData | null = null;
  private handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as {
      blendshapes?: Record<string, number>;
      faceDetected?: boolean;
    };
    if (!detail?.faceDetected) return;
    const bs = detail.blendshapes || {};
    const smile = ((bs["mouthSmileLeft"] || 0) + (bs["mouthSmileRight"] || 0)) / 2;
    const browDown = ((bs["browDownLeft"] || 0) + (bs["browDownRight"] || 0)) / 2;
    const browInnerUp = bs["browInnerUp"] || 0;
    const jawOpen = bs["jawOpen"] || 0;
    const eyeWide = ((bs["eyeWideLeft"] || 0) + (bs["eyeWideRight"] || 0)) / 2;
    const mouthFrown = ((bs["mouthFrownLeft"] || 0) + (bs["mouthFrownRight"] || 0)) / 2;
    const cheekPuff = bs["cheekPuff"] || 0;

    let expression: EmotionType = "neutral";
    let intensity = 0.2;

    if (smile > 0.45) { expression = "happy"; intensity = Math.min(1, smile + 0.2); }
    else if (browDown > 0.35 && jawOpen > 0.25) { expression = "angry"; intensity = browDown; }
    else if (browInnerUp > 0.45 && eyeWide > 0.35) { expression = "surprised"; intensity = browInnerUp; }
    else if ((browInnerUp > 0.25 || mouthFrown > 0.25) && smile < 0.15) { expression = "sad"; intensity = 0.6; }
    else if (cheekPuff > 0.4 && smile > 0.2) { expression = "shy"; intensity = cheekPuff; }

    this.lastVideoEmotion = { expression, intensity };
  };

  start() {
    window.addEventListener("multimediapipe-data", this.handler);
  }
  stop() {
    window.removeEventListener("multimediapipe-data", this.handler);
    this.lastVideoEmotion = null;
  }
  getLastEmotion(): VideoEmotionData | null {
    return this.lastVideoEmotion;
  }
}

export const userMediaPipeEmotion = new UserMediaPipeEmotion();