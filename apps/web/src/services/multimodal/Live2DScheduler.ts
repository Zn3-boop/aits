import type { EmotionType } from "./MultimodalEmotionFusion";

type SchedulerState = "idle" | "preloading" | "speaking" | "finishing";

interface ScheduleUnit {
  emotion: EmotionType;
  intensity: number;
  audioUrl: string;
  text: string;
  _resolve?: () => void;
}

export class Live2DScheduler {
  private state: SchedulerState = "idle";
  private queue: ScheduleUnit[] = [];
  private currentAudio: HTMLAudioElement | null = null;
  private microExprTimer: ReturnType<typeof setInterval> | null = null;

  private cb: {
    onPreloadEmotion: (emotion: EmotionType, intensity: number) => void;
    onPlayAudio: (url: string) => HTMLAudioElement;
    onStopAudio: () => void;
    onLipSyncStart: (audio: HTMLAudioElement) => void;
    onLipSyncStop: () => void;
    onMicroExpression: (params: Record<string, number>) => void;
    onResetNeutral: () => void;
    onStateChange: (state: SchedulerState) => void;
  } | null = null;

  registerCallbacks(cb: typeof this.cb) {
    this.cb = cb;
  }

  async schedule(emotion: EmotionType, intensity: number, audioUrl: string, text: string): Promise<void> {
    return new Promise((resolve) => {
      const unit: ScheduleUnit = { emotion, intensity, audioUrl, text, _resolve: resolve };
      this.queue.push(unit);
      if (this.state === "idle") this.processQueue();
    });
  }

  private async processQueue() {
    if (this.queue.length === 0 || !this.cb) {
      this.setState("idle");
      return;
    }
    const unit = this.queue.shift()!;
    this.setState("preloading");

    // 阶段 1：提前 150ms 预热表情
    this.cb.onPreloadEmotion(unit.emotion, unit.intensity);
    await this.delay(150);

    // 阶段 2：同步启动 TTS + 口型 + 微表情
    this.setState("speaking");
    const audio = this.cb.onPlayAudio(unit.audioUrl);
    this.currentAudio = audio;
    audio.dataset.text = unit.text;

    // 等音频可播放
    await new Promise<void>((resolve) => {
      if (audio.readyState >= 3) resolve();
      else audio.addEventListener("canplaythrough", () => resolve(), { once: true });
      setTimeout(resolve, 3000);
    });

    audio.play().catch(() => {});
    this.cb.onLipSyncStart(audio);
    this.startMicroExpressions(unit.emotion);

    // 等待音频自然结束
    await new Promise<void>((resolve) => {
      const onEnd = () => resolve();
      audio.addEventListener("ended", onEnd, { once: true });
      audio.addEventListener("error", onEnd, { once: true });
    });

    // 阶段 3：收尾
    this.setState("finishing");
    this.cb.onLipSyncStop();
    this.stopMicroExpressions();
    this.cb.onStopAudio();

    await this.delay(600);
    this.cb.onResetNeutral();

    this.currentAudio = null;
    unit._resolve?.();
    this.processQueue();
  }

  /** 用户新输入时打断当前播放 */
  interrupt() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    for (const u of this.queue) u._resolve?.();
    this.queue = [];
    this.stopMicroExpressions();
    this.cb?.onLipSyncStop();
    this.cb?.onStopAudio();
    this.setState("idle");
  }

  private startMicroExpressions(emotion: EmotionType) {
    this.stopMicroExpressions();
    let tick = 0;
    const emotionProfile = this.getEmotionProfile(emotion);
    this.microExprTimer = setInterval(() => {
      tick++;
      const params: Record<string, number> = {};
      if (tick % (15 + Math.floor(Math.random() * 15)) === 0) {
        params["ParamEyeLOpen"] = 0;
        params["ParamEyeROpen"] = 0;
      } else {
        params["ParamEyeLOpen"] = 1;
        params["ParamEyeROpen"] = 1;
      }
      params["ParamAngleX"] = Math.sin(tick * emotionProfile.headSwaySpeed) * emotionProfile.headSwayAmplitude + (Math.random() - 0.5) * emotionProfile.headRandomJitter;
      params["ParamAngleY"] = Math.cos(tick * emotionProfile.headBobSpeed) * emotionProfile.headBobAmplitude + (Math.random() - 0.5) * emotionProfile.headRandomJitter;
      params["ParamAngleZ"] = Math.sin(tick * 0.1) * emotionProfile.headTiltAmplitude;
      params["ParamEyeBallX"] = Math.sin(tick * 0.15 + 1) * emotionProfile.eyeWanderAmplitude;
      params["ParamEyeBallY"] = Math.cos(tick * 0.12) * emotionProfile.eyeWanderAmplitude * 0.5;
      params["ParamBreath"] = 0.3 + Math.sin(tick * 0.15) * 0.15 * emotionProfile.breathIntensity;
      if (emotionProfile.mouthFormOffset !== 0) {
        params["ParamMouthForm"] = emotionProfile.mouthFormOffset + Math.sin(tick * 0.08) * 0.05;
      }
      this.cb?.onMicroExpression(params);
    }, 200);
  }

  private getEmotionProfile(emotion: EmotionType): {
    headSwaySpeed: number; headSwayAmplitude: number;
    headBobSpeed: number; headBobAmplitude: number;
    headTiltAmplitude: number; headRandomJitter: number;
    eyeWanderAmplitude: number; breathIntensity: number;
    mouthFormOffset: number;
  } {
    const profiles: Record<string, {
      headSwaySpeed: number; headSwayAmplitude: number;
      headBobSpeed: number; headBobAmplitude: number;
      headTiltAmplitude: number; headRandomJitter: number;
      eyeWanderAmplitude: number; breathIntensity: number;
      mouthFormOffset: number;
    }> = {
      excited: { headSwaySpeed: 0.5, headSwayAmplitude: 3, headBobSpeed: 0.4, headBobAmplitude: 2, headTiltAmplitude: 2, headRandomJitter: 1.5, eyeWanderAmplitude: 0.3, breathIntensity: 0.9, mouthFormOffset: 0.5 },
      angry: { headSwaySpeed: 0.4, headSwayAmplitude: 2.5, headBobSpeed: 0.3, headBobAmplitude: 1.5, headTiltAmplitude: 1, headRandomJitter: 1.2, eyeWanderAmplitude: 0.15, breathIntensity: 0.8, mouthFormOffset: -0.3 },
      sad: { headSwaySpeed: 0.15, headSwayAmplitude: 0.8, headBobSpeed: 0.1, headBobAmplitude: 0.5, headTiltAmplitude: 0.5, headRandomJitter: 0.3, eyeWanderAmplitude: 0.1, breathIntensity: 0.4, mouthFormOffset: -0.3 },
      shy: { headSwaySpeed: 0.2, headSwayAmplitude: 1, headBobSpeed: 0.15, headBobAmplitude: 0.8, headTiltAmplitude: 1.5, headRandomJitter: 0.5, eyeWanderAmplitude: 0.15, breathIntensity: 0.5, mouthFormOffset: -0.1 },
      thinking: { headSwaySpeed: 0.1, headSwayAmplitude: 0.5, headBobSpeed: 0.08, headBobAmplitude: 0.3, headTiltAmplitude: 2, headRandomJitter: 0.2, eyeWanderAmplitude: 0.2, breathIntensity: 0.4, mouthFormOffset: -0.1 },
      confused: { headSwaySpeed: 0.25, headSwayAmplitude: 1.5, headBobSpeed: 0.2, headBobAmplitude: 1, headTiltAmplitude: 2, headRandomJitter: 0.8, eyeWanderAmplitude: 0.25, breathIntensity: 0.5, mouthFormOffset: -0.15 },
      happy: { headSwaySpeed: 0.35, headSwayAmplitude: 2, headBobSpeed: 0.3, headBobAmplitude: 1.5, headTiltAmplitude: 1.5, headRandomJitter: 1, eyeWanderAmplitude: 0.2, breathIntensity: 0.7, mouthFormOffset: 0.4 },
      surprised: { headSwaySpeed: 0.3, headSwayAmplitude: 1.5, headBobSpeed: 0.25, headBobAmplitude: 1, headTiltAmplitude: 0.5, headRandomJitter: 0.8, eyeWanderAmplitude: 0.3, breathIntensity: 0.7, mouthFormOffset: 0 },
      fearful: { headSwaySpeed: 0.4, headSwayAmplitude: 1.5, headBobSpeed: 0.35, headBobAmplitude: 1, headTiltAmplitude: 0.5, headRandomJitter: 1.2, eyeWanderAmplitude: 0.3, breathIntensity: 0.8, mouthFormOffset: -0.1 },
      frustrated: { headSwaySpeed: 0.35, headSwayAmplitude: 2, headBobSpeed: 0.3, headBobAmplitude: 1.5, headTiltAmplitude: 1, headRandomJitter: 1, eyeWanderAmplitude: 0.15, breathIntensity: 0.7, mouthFormOffset: -0.4 },
      nostalgic: { headSwaySpeed: 0.12, headSwayAmplitude: 0.8, headBobSpeed: 0.1, headBobAmplitude: 0.5, headTiltAmplitude: 1.5, headRandomJitter: 0.3, eyeWanderAmplitude: 0.15, breathIntensity: 0.4, mouthFormOffset: 0.2 },
      curious: { headSwaySpeed: 0.25, headSwayAmplitude: 1.5, headBobSpeed: 0.2, headBobAmplitude: 1, headTiltAmplitude: 2, headRandomJitter: 0.6, eyeWanderAmplitude: 0.3, breathIntensity: 0.5, mouthFormOffset: 0.1 },
      bored: { headSwaySpeed: 0.08, headSwayAmplitude: 0.5, headBobSpeed: 0.06, headBobAmplitude: 0.3, headTiltAmplitude: 1, headRandomJitter: 0.2, eyeWanderAmplitude: 0.1, breathIntensity: 0.3, mouthFormOffset: -0.2 },
    };
    return profiles[emotion] ?? {
      headSwaySpeed: 0.3, headSwayAmplitude: 1.5, headBobSpeed: 0.2, headBobAmplitude: 1,
      headTiltAmplitude: 1, headRandomJitter: 0.5, eyeWanderAmplitude: 0.2, breathIntensity: 0.5,
      mouthFormOffset: 0,
    };
  }

  private stopMicroExpressions() {
    if (this.microExprTimer) { clearInterval(this.microExprTimer); this.microExprTimer = null; }
  }

  private setState(s: SchedulerState) {
    this.state = s;
    this.cb?.onStateChange(s);
    (window as unknown as Record<string, unknown>).__AI_IS_SPEAKING__ = s === "speaking";
  }

  getState() { return this.state; }

  private delay(ms: number) {
    return new Promise(r => setTimeout(r, ms));
  }
}

export const live2dScheduler = new Live2DScheduler();