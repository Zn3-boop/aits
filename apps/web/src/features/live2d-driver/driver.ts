import * as PIXI from "pixi.js";
import { Application, settings, type DisplayObject } from "pixi.js";
import type { Live2DExpressionParams } from "@lpm/live2d-mapper";
import { logger } from "../../utils/logger";

// ========== 方案 A：全局静音补丁（解决 Live2D motion 音效 404/AbortError）==========
// pixi-live2d-display 播 motion 时会 audio.play()，但：
// 1. 文件缺失导致 404
// 2. 浏览器自动播放策略导致 AbortError
// 这个补丁静默所有 audio.play() 调用，让 motion 继续走动画曲线
if (typeof window !== "undefined" && typeof HTMLAudioElement !== "undefined") {
  const origPlay = HTMLAudioElement.prototype.play;
  HTMLAudioElement.prototype.play = function (this: HTMLAudioElement) {
    // 返回 resolved promise，静默所有音频错误
    // 这解决了 AbortError (play interrupted by pause) 和 404 Not Found 的刷屏问题
    return Promise.resolve().then(() => {
      origPlay.call(this).catch(() => {
        // 静默忽略所有音频错误，不刷屏
      });
    });
  };
  logger.log('[Live2D] 🔇 音频补丁已应用，所有 motion 音效将被静默');
}

// 用于控制台调试：可随时通过 window.LIVE2D_SOUND_ENABLED = true 临时启用音效
declare global {
  interface Window {
    LIVE2D_SOUND_ENABLED?: boolean;
  }
}

if (typeof window !== "undefined") {
  const w = window as typeof window & { PIXI?: typeof PIXI };
  if (!w.PIXI || typeof w.PIXI !== "object") {
    (w as unknown as { PIXI: typeof PIXI }).PIXI = PIXI;
  } else {
    Object.assign(w.PIXI, PIXI);
  }
  (settings as unknown as Record<string, unknown>).FAIL_IF_MAJOR_PERFORMANCE_CAVEAT = false;
}

try {
  const baseTexture = PIXI.BaseTexture as unknown as { defaultOptions?: Record<string, unknown> };
  if (baseTexture.defaultOptions) {
    baseTexture.defaultOptions.mipmap = PIXI.MIPMAP_MODES.OFF;
    baseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.LINEAR;
  }
} catch (_e) {
  // ignore PIXI init error
}

// ========== 全局 Live2D 声音静音补丁 ==========
// 防止 pixi-live2d-display 播放 motion 音效时产生 AbortError 和 404 报错
const initLive2DMutePatch = () => {
  if (typeof window === "undefined") return;
  if ((window as Window & { __LIVE2D_MUTE_PATCHED__?: boolean }).__LIVE2D_MUTE_PATCHED__) return;
  (window as Window & { __LIVE2D_MUTE_PATCHED__?: boolean }).__LIVE2D_MUTE_PATCHED__ = true;

  // 静默 HTMLAudioElement.prototype.play
  if (typeof HTMLAudioElement !== "undefined" && HTMLAudioElement.prototype) {
    const origPlay = HTMLAudioElement.prototype.play;
    HTMLAudioElement.prototype.play = function (this: HTMLAudioElement) {
      // 静默返回 resolved Promise，不实际播放
      return Promise.resolve().then(() => {
        // 即使原始 play 失败也不抛出错误
        return origPlay.call(this).catch(() => {
          // 吞掉所有音频播放错误
        });
      });
    };
  }

  // 静默 Audio 构造函数
  if (typeof Audio !== "undefined") {
    const OrigAudio = Audio;
    (window as typeof window & { __MutedAudio?: typeof Audio }).__MutedAudio = OrigAudio;
  }

  console.log('[Live2D] 🔇 全局声音静音补丁已应用');
};

// 在模块加载时立即应用补丁（早于任何 Live2D 初始化）
initLive2DMutePatch();

export interface Live2DConfig {
  canvasId?: string;
  canvas?: HTMLCanvasElement;
  modelUrl?: string;
  width?: number;
  height?: number;
}

export interface CustomAnimKeyframe {
  time: number;
  params: Record<string, number>;
  easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
}

export type PresetAnimName =
  | 'nod' | 'shake' | 'tiltHead' | 'lookAround'
  | 'wave' | 'bow' | 'stretch' | 'bounce'
  | 'doubleBlink' | 'wink' | 'lookUp'
  | 'pout' | 'giggle' | 'sigh'
  | 'think' | 'surprise' | 'embarassed' | 'yawn'
  | 'shoulderShrug' | 'headRub' | 'deepBreath'
  | 'lookDown' | 'sideEye' | 'noseScratch'
  | 'earWiggle' | 'lipBite' | 'headTiltSlow';

const PRESET_ANIMS: Record<PresetAnimName, { duration: number; keyframes: CustomAnimKeyframe[] }> = {
  nod: {
    duration: 800,
    keyframes: [
      { time: 0, params: { ParamAngleY: 0, ParamAngleX: 0, ParamAngleZ: 0 } },
      { time: 200, params: { ParamAngleY: 8, ParamAngleX: 0, ParamAngleZ: 2 }, easing: 'easeIn' },
      { time: 400, params: { ParamAngleY: -3, ParamAngleX: 0, ParamAngleZ: -1 }, easing: 'easeOut' },
      { time: 600, params: { ParamAngleY: 5, ParamAngleX: 0, ParamAngleZ: 1 }, easing: 'easeInOut' },
      { time: 800, params: { ParamAngleY: 0, ParamAngleX: 0, ParamAngleZ: 0 }, easing: 'easeOut' },
    ],
  },
  shake: {
    duration: 1000,
    keyframes: [
      { time: 0, params: { ParamAngleX: 0, ParamAngleZ: 0, ParamBodyAngleX: 0 } },
      { time: 150, params: { ParamAngleX: -12, ParamAngleZ: -3, ParamBodyAngleX: -5 }, easing: 'easeIn' },
      { time: 350, params: { ParamAngleX: 12, ParamAngleZ: 3, ParamBodyAngleX: 5 }, easing: 'easeInOut' },
      { time: 550, params: { ParamAngleX: -10, ParamAngleZ: -2, ParamBodyAngleX: -4 }, easing: 'easeInOut' },
      { time: 750, params: { ParamAngleX: 8, ParamAngleZ: 2, ParamBodyAngleX: 3 }, easing: 'easeInOut' },
      { time: 1000, params: { ParamAngleX: 0, ParamAngleZ: 0, ParamBodyAngleX: 0 }, easing: 'easeOut' },
    ],
  },
  tiltHead: {
    duration: 1200,
    keyframes: [
      { time: 0, params: { ParamAngleZ: 0, ParamAngleX: 0 } },
      { time: 400, params: { ParamAngleZ: 15, ParamAngleX: 5 }, easing: 'easeOut' },
      { time: 800, params: { ParamAngleZ: 12, ParamAngleX: 3 }, easing: 'easeInOut' },
      { time: 1200, params: { ParamAngleZ: 0, ParamAngleX: 0 }, easing: 'easeInOut' },
    ],
  },
  lookAround: {
    duration: 2000,
    keyframes: [
      { time: 0, params: { ParamEyeBallX: 0, ParamEyeBallY: 0, ParamAngleX: 0 } },
      { time: 400, params: { ParamEyeBallX: -0.8, ParamEyeBallY: 0.2, ParamAngleX: -5 }, easing: 'easeOut' },
      { time: 800, params: { ParamEyeBallX: 0.7, ParamEyeBallY: -0.1, ParamAngleX: 5 }, easing: 'easeInOut' },
      { time: 1200, params: { ParamEyeBallX: -0.3, ParamEyeBallY: 0.5, ParamAngleX: -3 }, easing: 'easeInOut' },
      { time: 1600, params: { ParamEyeBallX: 0.5, ParamEyeBallY: 0.3, ParamAngleX: 3 }, easing: 'easeInOut' },
      { time: 2000, params: { ParamEyeBallX: 0, ParamEyeBallY: 0, ParamAngleX: 0 }, easing: 'easeOut' },
    ],
  },
  wave: {
    duration: 1500,
    keyframes: [
      { time: 0, params: { ParamAngleX: 0, ParamAngleZ: 0, ParamBodyAngleX: 0 } },
      { time: 200, params: { ParamAngleX: 8, ParamAngleZ: 5, ParamBodyAngleX: 3 }, easing: 'easeOut' },
      { time: 500, params: { ParamAngleX: -5, ParamAngleZ: -8, ParamBodyAngleX: -2 }, easing: 'easeInOut' },
      { time: 800, params: { ParamAngleX: 6, ParamAngleZ: 6, ParamBodyAngleX: 2 }, easing: 'easeInOut' },
      { time: 1100, params: { ParamAngleX: -3, ParamAngleZ: -4, ParamBodyAngleX: -1 }, easing: 'easeInOut' },
      { time: 1500, params: { ParamAngleX: 0, ParamAngleZ: 0, ParamBodyAngleX: 0 }, easing: 'easeOut' },
    ],
  },
  bow: {
    duration: 2000,
    keyframes: [
      { time: 0, params: { ParamAngleY: 0, ParamBodyAngleY: 0, ParamAngleX: 0 } },
      { time: 600, params: { ParamAngleY: 12, ParamBodyAngleY: 5, ParamAngleX: 0 }, easing: 'easeInOut' },
      { time: 1000, params: { ParamAngleY: 15, ParamBodyAngleY: 8, ParamAngleX: 0 }, easing: 'easeInOut' },
      { time: 1600, params: { ParamAngleY: 5, ParamBodyAngleY: 2, ParamAngleX: 0 }, easing: 'easeInOut' },
      { time: 2000, params: { ParamAngleY: 0, ParamBodyAngleY: 0, ParamAngleX: 0 }, easing: 'easeOut' },
    ],
  },
  stretch: {
    duration: 1800,
    keyframes: [
      { time: 0, params: { ParamAngleY: 0, ParamAngleX: 0, ParamBodyAngleY: 0, ParamEyeLOpen: 0, ParamEyeROpen: 0 } },
      { time: 300, params: { ParamAngleY: -5, ParamAngleX: 0, ParamBodyAngleY: -2, ParamEyeLOpen: -0.3, ParamEyeROpen: -0.3 }, easing: 'easeIn' },
      { time: 700, params: { ParamAngleY: 10, ParamAngleX: 8, ParamBodyAngleY: 3, ParamEyeLOpen: 0.3, ParamEyeROpen: 0.3 }, easing: 'easeOut' },
      { time: 1100, params: { ParamAngleY: 8, ParamAngleX: -6, ParamBodyAngleY: 2, ParamEyeLOpen: 0.2, ParamEyeROpen: 0.2 }, easing: 'easeInOut' },
      { time: 1800, params: { ParamAngleY: 0, ParamAngleX: 0, ParamBodyAngleY: 0, ParamEyeLOpen: 0, ParamEyeROpen: 0 }, easing: 'easeOut' },
    ],
  },
  bounce: {
    duration: 1200,
    keyframes: [
      { time: 0, params: { ParamAngleY: 0, ParamBodyAngleY: 0 } },
      { time: 200, params: { ParamAngleY: -8, ParamBodyAngleY: -3 }, easing: 'easeIn' },
      { time: 400, params: { ParamAngleY: 6, ParamBodyAngleY: 2 }, easing: 'easeOut' },
      { time: 600, params: { ParamAngleY: -4, ParamBodyAngleY: -1 }, easing: 'easeIn' },
      { time: 800, params: { ParamAngleY: 3, ParamBodyAngleY: 1 }, easing: 'easeOut' },
      { time: 1200, params: { ParamAngleY: 0, ParamBodyAngleY: 0 }, easing: 'easeOut' },
    ],
  },
  doubleBlink: {
    duration: 600,
    keyframes: [
      { time: 0, params: { ParamEyeLOpen: 0, ParamEyeROpen: 0 } },
      { time: 100, params: { ParamEyeLOpen: 1, ParamEyeROpen: 1 }, easing: 'easeOut' },
      { time: 200, params: { ParamEyeLOpen: 0, ParamEyeROpen: 0 }, easing: 'easeIn' },
      { time: 350, params: { ParamEyeLOpen: 1, ParamEyeROpen: 1 }, easing: 'easeOut' },
      { time: 600, params: { ParamEyeLOpen: 0, ParamEyeROpen: 0 } },
    ],
  },
  wink: {
    duration: 800,
    keyframes: [
      { time: 0, params: { ParamEyeLOpen: 0, ParamEyeROpen: 1, ParamMouthForm: 0.3 } },
      { time: 400, params: { ParamEyeLOpen: 0, ParamEyeROpen: 1, ParamMouthForm: 0.5 }, easing: 'easeInOut' },
      { time: 800, params: { ParamEyeLOpen: 0, ParamEyeROpen: 0, ParamMouthForm: 0 } },
    ],
  },
  lookUp: {
    duration: 1500,
    keyframes: [
      { time: 0, params: { ParamAngleY: 0, ParamEyeBallY: 0 } },
      { time: 400, params: { ParamAngleY: -10, ParamEyeBallY: -0.6 }, easing: 'easeOut' },
      { time: 1000, params: { ParamAngleY: -8, ParamEyeBallY: -0.5 }, easing: 'easeInOut' },
      { time: 1500, params: { ParamAngleY: 0, ParamEyeBallY: 0 }, easing: 'easeOut' },
    ],
  },
  pout: {
    duration: 1200,
    keyframes: [
      { time: 0, params: { ParamMouthForm: 0, ParamMouthOpenY: 0, ParamAngleZ: 0 } },
      { time: 300, params: { ParamMouthForm: -0.8, ParamMouthOpenY: 0.1, ParamAngleZ: 8 }, easing: 'easeOut' },
      { time: 800, params: { ParamMouthForm: -0.6, ParamMouthOpenY: 0.05, ParamAngleZ: 6 }, easing: 'easeInOut' },
      { time: 1200, params: { ParamMouthForm: 0, ParamMouthOpenY: 0, ParamAngleZ: 0 }, easing: 'easeOut' },
    ],
  },
  giggle: {
    duration: 1500,
    keyframes: [
      { time: 0, params: { ParamAngleZ: 0, ParamBodyAngleX: 0, ParamMouthForm: 0, ParamEyeLSmile: 0, ParamEyeRSmile: 0 } },
      { time: 250, params: { ParamAngleZ: 5, ParamBodyAngleX: 2, ParamMouthForm: 0.6, ParamEyeLSmile: 0.5, ParamEyeRSmile: 0.5 }, easing: 'easeOut' },
      { time: 500, params: { ParamAngleZ: -4, ParamBodyAngleX: -2, ParamMouthForm: 0.8, ParamEyeLSmile: 0.7, ParamEyeRSmile: 0.7 }, easing: 'easeInOut' },
      { time: 750, params: { ParamAngleZ: 4, ParamBodyAngleX: 1, ParamMouthForm: 0.7, ParamEyeLSmile: 0.6, ParamEyeRSmile: 0.6 }, easing: 'easeInOut' },
      { time: 1000, params: { ParamAngleZ: -3, ParamBodyAngleX: -1, ParamMouthForm: 0.5, ParamEyeLSmile: 0.4, ParamEyeRSmile: 0.4 }, easing: 'easeInOut' },
      { time: 1500, params: { ParamAngleZ: 0, ParamBodyAngleX: 0, ParamMouthForm: 0, ParamEyeLSmile: 0, ParamEyeRSmile: 0 }, easing: 'easeOut' },
    ],
  },
  sigh: {
    duration: 2000,
    keyframes: [
      { time: 0, params: { ParamAngleY: 0, ParamBodyAngleY: 0, ParamMouthOpenY: 0, ParamEyeLOpen: 0, ParamEyeROpen: 0 } },
      { time: 400, params: { ParamAngleY: 5, ParamBodyAngleY: 2, ParamMouthOpenY: 0.15, ParamEyeLOpen: -0.1, ParamEyeROpen: -0.1 }, easing: 'easeIn' },
      { time: 800, params: { ParamAngleY: 8, ParamBodyAngleY: 3, ParamMouthOpenY: 0.1, ParamEyeLOpen: -0.2, ParamEyeROpen: -0.2 }, easing: 'easeInOut' },
      { time: 1400, params: { ParamAngleY: 6, ParamBodyAngleY: 2, ParamMouthOpenY: 0, ParamEyeLOpen: -0.15, ParamEyeROpen: -0.15 }, easing: 'easeInOut' },
      { time: 2000, params: { ParamAngleY: 0, ParamBodyAngleY: 0, ParamMouthOpenY: 0, ParamEyeLOpen: 0, ParamEyeROpen: 0 }, easing: 'easeOut' },
    ],
  },
  think: {
    duration: 2500,
    keyframes: [
      { time: 0, params: { ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 0, ParamEyeBallX: 0, ParamEyeBallY: 0, ParamBrowLY: 0, ParamBrowRY: 0 } },
      { time: 500, params: { ParamAngleX: -8, ParamAngleY: -3, ParamAngleZ: 6, ParamEyeBallX: -0.5, ParamEyeBallY: -0.3, ParamBrowLY: 0.3, ParamBrowRY: 0.3 }, easing: 'easeOut' },
      { time: 1200, params: { ParamAngleX: -6, ParamAngleY: -2, ParamAngleZ: 8, ParamEyeBallX: -0.3, ParamEyeBallY: -0.2, ParamBrowLY: 0.4, ParamBrowRY: 0.2 }, easing: 'easeInOut' },
      { time: 1800, params: { ParamAngleX: -10, ParamAngleY: -4, ParamAngleZ: 5, ParamEyeBallX: -0.6, ParamEyeBallY: -0.1, ParamBrowLY: 0.3, ParamBrowRY: 0.3 }, easing: 'easeInOut' },
      { time: 2500, params: { ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 0, ParamEyeBallX: 0, ParamEyeBallY: 0, ParamBrowLY: 0, ParamBrowRY: 0 }, easing: 'easeOut' },
    ],
  },
  surprise: {
    duration: 1000,
    keyframes: [
      { time: 0, params: { ParamAngleY: 0, ParamEyeLOpen: 0, ParamEyeROpen: 0, ParamMouthOpenY: 0, ParamBrowLY: 0, ParamBrowRY: 0 } },
      { time: 150, params: { ParamAngleY: -12, ParamEyeLOpen: 1, ParamEyeROpen: 1, ParamMouthOpenY: 0.6, ParamBrowLY: 1, ParamBrowRY: 1 }, easing: 'easeOut' },
      { time: 500, params: { ParamAngleY: -8, ParamEyeLOpen: 0.8, ParamEyeROpen: 0.8, ParamMouthOpenY: 0.4, ParamBrowLY: 0.8, ParamBrowRY: 0.8 }, easing: 'easeInOut' },
      { time: 1000, params: { ParamAngleY: 0, ParamEyeLOpen: 0, ParamEyeROpen: 0, ParamMouthOpenY: 0, ParamBrowLY: 0, ParamBrowRY: 0 }, easing: 'easeOut' },
    ],
  },
  embarassed: {
    duration: 2000,
    keyframes: [
      { time: 0, params: { ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 0, ParamCheek: 0, ParamEyeLSmile: 0, ParamEyeRSmile: 0 } },
      { time: 400, params: { ParamAngleX: 10, ParamAngleY: 5, ParamAngleZ: 12, ParamCheek: 0.8, ParamEyeLSmile: 0.3, ParamEyeRSmile: 0.3 }, easing: 'easeOut' },
      { time: 1000, params: { ParamAngleX: 8, ParamAngleY: 4, ParamAngleZ: 10, ParamCheek: 1, ParamEyeLSmile: 0.5, ParamEyeRSmile: 0.5 }, easing: 'easeInOut' },
      { time: 1500, params: { ParamAngleX: 6, ParamAngleY: 3, ParamAngleZ: 8, ParamCheek: 0.6, ParamEyeLSmile: 0.3, ParamEyeRSmile: 0.3 }, easing: 'easeInOut' },
      { time: 2000, params: { ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 0, ParamCheek: 0, ParamEyeLSmile: 0, ParamEyeRSmile: 0 }, easing: 'easeOut' },
    ],
  },
  yawn: {
    duration: 3000,
    keyframes: [
      { time: 0, params: { ParamAngleY: 0, ParamMouthOpenY: 0, ParamEyeLOpen: 0, ParamEyeROpen: 0, ParamBrowLY: 0, ParamBrowRY: 0 } },
      { time: 500, params: { ParamAngleY: 8, ParamMouthOpenY: 0.3, ParamEyeLOpen: -0.3, ParamEyeROpen: -0.3, ParamBrowLY: -0.2, ParamBrowRY: -0.2 }, easing: 'easeIn' },
      { time: 1200, params: { ParamAngleY: 12, ParamMouthOpenY: 0.8, ParamEyeLOpen: -0.5, ParamEyeROpen: -0.5, ParamBrowLY: -0.3, ParamBrowRY: -0.3 }, easing: 'easeOut' },
      { time: 1800, params: { ParamAngleY: 10, ParamMouthOpenY: 0.5, ParamEyeLOpen: -0.4, ParamEyeROpen: -0.4, ParamBrowLY: -0.2, ParamBrowRY: -0.2 }, easing: 'easeInOut' },
      { time: 2400, params: { ParamAngleY: 5, ParamMouthOpenY: 0.1, ParamEyeLOpen: -0.1, ParamEyeROpen: -0.1, ParamBrowLY: 0, ParamBrowRY: 0 }, easing: 'easeInOut' },
      { time: 3000, params: { ParamAngleY: 0, ParamMouthOpenY: 0, ParamEyeLOpen: 0, ParamEyeROpen: 0, ParamBrowLY: 0, ParamBrowRY: 0 }, easing: 'easeOut' },
    ],
  },
  shoulderShrug: {
    duration: 1200,
    keyframes: [
      { time: 0, params: { ParamBodyAngleX: 0, ParamBodyAngleY: 0, ParamAngleZ: 0, ParamBrowLY: 0, ParamBrowRY: 0 } },
      { time: 300, params: { ParamBodyAngleX: 0, ParamBodyAngleY: -3, ParamAngleZ: 3, ParamBrowLY: 0.4, ParamBrowRY: 0.4 }, easing: 'easeOut' },
      { time: 600, params: { ParamBodyAngleX: 2, ParamBodyAngleY: -2, ParamAngleZ: -2, ParamBrowLY: 0.3, ParamBrowRY: 0.3 }, easing: 'easeInOut' },
      { time: 900, params: { ParamBodyAngleX: -1, ParamBodyAngleY: -1, ParamAngleZ: 1, ParamBrowLY: 0.2, ParamBrowRY: 0.2 }, easing: 'easeInOut' },
      { time: 1200, params: { ParamBodyAngleX: 0, ParamBodyAngleY: 0, ParamAngleZ: 0, ParamBrowLY: 0, ParamBrowRY: 0 }, easing: 'easeOut' },
    ],
  },
  headRub: {
    duration: 1800,
    keyframes: [
      { time: 0, params: { ParamAngleX: 0, ParamAngleZ: 0, ParamEyeBallX: 0, ParamBrowLY: 0, ParamBrowRY: 0 } },
      { time: 300, params: { ParamAngleX: 8, ParamAngleZ: -5, ParamEyeBallX: 0.4, ParamBrowLY: 0.3, ParamBrowRY: -0.2 }, easing: 'easeOut' },
      { time: 600, params: { ParamAngleX: 6, ParamAngleZ: 8, ParamEyeBallX: -0.3, ParamBrowLY: -0.1, ParamBrowRY: 0.3 }, easing: 'easeInOut' },
      { time: 1000, params: { ParamAngleX: 10, ParamAngleZ: -3, ParamEyeBallX: 0.5, ParamBrowLY: 0.2, ParamBrowRY: 0 }, easing: 'easeInOut' },
      { time: 1400, params: { ParamAngleX: 5, ParamAngleZ: 4, ParamEyeBallX: -0.2, ParamBrowLY: 0, ParamBrowRY: 0.2 }, easing: 'easeInOut' },
      { time: 1800, params: { ParamAngleX: 0, ParamAngleZ: 0, ParamEyeBallX: 0, ParamBrowLY: 0, ParamBrowRY: 0 }, easing: 'easeOut' },
    ],
  },
  deepBreath: {
    duration: 2500,
    keyframes: [
      { time: 0, params: { ParamBreath: 0, ParamBodyAngleY: 0, ParamAngleY: 0 } },
      { time: 800, params: { ParamBreath: 0.8, ParamBodyAngleY: -2, ParamAngleY: -3 }, easing: 'easeIn' },
      { time: 1200, params: { ParamBreath: 1, ParamBodyAngleY: -3, ParamAngleY: -4 }, easing: 'easeOut' },
      { time: 1800, params: { ParamBreath: 0.4, ParamBodyAngleY: -1, ParamAngleY: -2 }, easing: 'easeInOut' },
      { time: 2500, params: { ParamBreath: 0, ParamBodyAngleY: 0, ParamAngleY: 0 }, easing: 'easeOut' },
    ],
  },
  lookDown: {
    duration: 2000,
    keyframes: [
      { time: 0, params: { ParamAngleY: 0, ParamEyeBallY: 0, ParamBrowLY: 0, ParamBrowRY: 0 } },
      { time: 500, params: { ParamAngleY: 10, ParamEyeBallY: 0.6, ParamBrowLY: -0.3, ParamBrowRY: -0.3 }, easing: 'easeOut' },
      { time: 1200, params: { ParamAngleY: 8, ParamEyeBallY: 0.5, ParamBrowLY: -0.2, ParamBrowRY: -0.2 }, easing: 'easeInOut' },
      { time: 2000, params: { ParamAngleY: 0, ParamEyeBallY: 0, ParamBrowLY: 0, ParamBrowRY: 0 }, easing: 'easeOut' },
    ],
  },
  sideEye: {
    duration: 1500,
    keyframes: [
      { time: 0, params: { ParamEyeBallX: 0, ParamAngleX: 0, ParamAngleZ: 0, ParamBrowLY: 0, ParamBrowRY: 0 } },
      { time: 300, params: { ParamEyeBallX: -0.8, ParamAngleX: -3, ParamAngleZ: 4, ParamBrowLY: 0.2, ParamBrowRY: -0.3 }, easing: 'easeOut' },
      { time: 900, params: { ParamEyeBallX: -0.6, ParamAngleX: -2, ParamAngleZ: 3, ParamBrowLY: 0.1, ParamBrowRY: -0.2 }, easing: 'easeInOut' },
      { time: 1500, params: { ParamEyeBallX: 0, ParamAngleX: 0, ParamAngleZ: 0, ParamBrowLY: 0, ParamBrowRY: 0 }, easing: 'easeOut' },
    ],
  },
  noseScratch: {
    duration: 1500,
    keyframes: [
      { time: 0, params: { ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 0, ParamEyeBallX: 0 } },
      { time: 300, params: { ParamAngleX: 6, ParamAngleY: -2, ParamAngleZ: -4, ParamEyeBallX: 0.4 }, easing: 'easeOut' },
      { time: 700, params: { ParamAngleX: 8, ParamAngleY: -3, ParamAngleZ: -6, ParamEyeBallX: 0.5 }, easing: 'easeInOut' },
      { time: 1100, params: { ParamAngleX: 5, ParamAngleY: -1, ParamAngleZ: -3, ParamEyeBallX: 0.3 }, easing: 'easeInOut' },
      { time: 1500, params: { ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 0, ParamEyeBallX: 0 }, easing: 'easeOut' },
    ],
  },
  earWiggle: {
    duration: 800,
    keyframes: [
      { time: 0, params: { ParamAngleZ: 0, ParamBrowLY: 0, ParamBrowRY: 0 } },
      { time: 150, params: { ParamAngleZ: 3, ParamBrowLY: 0.5, ParamBrowRY: -0.3 }, easing: 'easeOut' },
      { time: 300, params: { ParamAngleZ: -2, ParamBrowLY: -0.2, ParamBrowRY: 0.5 }, easing: 'easeInOut' },
      { time: 450, params: { ParamAngleZ: 2, ParamBrowLY: 0.3, ParamBrowRY: -0.2 }, easing: 'easeInOut' },
      { time: 600, params: { ParamAngleZ: -1, ParamBrowLY: -0.1, ParamBrowRY: 0.3 }, easing: 'easeInOut' },
      { time: 800, params: { ParamAngleZ: 0, ParamBrowLY: 0, ParamBrowRY: 0 }, easing: 'easeOut' },
    ],
  },
  lipBite: {
    duration: 1200,
    keyframes: [
      { time: 0, params: { ParamMouthForm: 0, ParamMouthOpenY: 0, ParamAngleZ: 0, ParamEyeLSmile: 0, ParamEyeRSmile: 0 } },
      { time: 300, params: { ParamMouthForm: -0.4, ParamMouthOpenY: 0.05, ParamAngleZ: 5, ParamEyeLSmile: 0.2, ParamEyeRSmile: 0.2 }, easing: 'easeOut' },
      { time: 700, params: { ParamMouthForm: -0.3, ParamMouthOpenY: 0.03, ParamAngleZ: 4, ParamEyeLSmile: 0.3, ParamEyeRSmile: 0.3 }, easing: 'easeInOut' },
      { time: 1200, params: { ParamMouthForm: 0, ParamMouthOpenY: 0, ParamAngleZ: 0, ParamEyeLSmile: 0, ParamEyeRSmile: 0 }, easing: 'easeOut' },
    ],
  },
  headTiltSlow: {
    duration: 3000,
    keyframes: [
      { time: 0, params: { ParamAngleZ: 0, ParamAngleX: 0, ParamAngleY: 0 } },
      { time: 800, params: { ParamAngleZ: 10, ParamAngleX: 3, ParamAngleY: -2 }, easing: 'easeOut' },
      { time: 1600, params: { ParamAngleZ: 8, ParamAngleX: 2, ParamAngleY: -1 }, easing: 'easeInOut' },
      { time: 2200, params: { ParamAngleZ: 5, ParamAngleX: 1, ParamAngleY: -1 }, easing: 'easeInOut' },
      { time: 3000, params: { ParamAngleZ: 0, ParamAngleX: 0, ParamAngleY: 0 }, easing: 'easeOut' },
    ],
  },
};

function applyEasing(t: number, easing: CustomAnimKeyframe['easing']): number {
  switch (easing) {
    case 'easeIn': return t * t;
    case 'easeOut': return 1 - (1 - t) * (1 - t);
    case 'easeInOut': return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    default: return t;
  }
}

type MutableModel = DisplayObject & {
  width: number;
  height: number;
  scale: { set: (value: number) => void; x?: number; y?: number };
  x: number;
  y: number;
  anchor?: { set: (x: number, y: number) => void };
  motion?: (group: string, index?: number, priority?: number) => Promise<void>;
  expression?: (id: string) => void;
  destroy?: (options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }) => void;
  once?: (event: string, listener: () => void) => void;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  internalModel?: {
    coreModel?: {
      setParameterValueById?: (id: string, value: number) => void;
      addParameterValueById?: (id: string, value: number) => void;
      getParameterCount?: () => number;
      getParameterId?: (index: number) => string;
      _model?: {
        parameters?: {
          ids?: string[];
        };
      };
    };
    motionManager?: {
      motionGroups?: Record<string, unknown[]>;
    };
    settings?: {
      expressions?: Array<{ name?: string; Name?: string }>;
      motions?: Record<string, unknown[]>;
    };
  };
};

const ensureCubismRuntime = async () => {
  if (typeof window === "undefined") return;
  const runtimeWindow = window as Window & {
    Live2DCubismCore?: unknown;
    __live2dCubismLoadingPromise__?: Promise<void>;
  };
  if (runtimeWindow.Live2DCubismCore) return;
  if (!runtimeWindow.__live2dCubismLoadingPromise__) {
    runtimeWindow.__live2dCubismLoadingPromise__ = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector('script[data-live2d-cubism-core="true"]') as HTMLScriptElement | null;
      if (existing) {
        if (runtimeWindow.Live2DCubismCore) { resolve(); return; }
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("加载 Live2D Cubism Core 失败")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "/live2d/sdk/live2dcubismcore.min.js";
      script.async = false;
      script.dataset.live2dCubismCore = "true";
      script.onload = () => {
        if (runtimeWindow.Live2DCubismCore) {
          resolve();
        } else {
          reject(new Error("Cubism Core 脚本已加载但全局变量未注入"));
        }
      };
      script.onerror = () => reject(new Error("加载 Live2D Cubism Core 失败"));
      document.head.appendChild(script);
    });
  }
  await runtimeWindow.__live2dCubismLoadingPromise__;
  if (!runtimeWindow.Live2DCubismCore) throw new Error("Cubism runtime 未注入");
};

type Live2DModelConstructor = {
  new (...args: unknown[]): DisplayObject & {
    width: number;
    height: number;
    scale: { set: (value: number) => void; x?: number; y?: number };
    x: number;
    y: number;
    anchor?: { set: (x: number, y: number) => void };
    motion?: (group: string, index?: number, priority?: number) => Promise<void>;
    expression?: (id: string) => void;
    destroy?: (options?: { children?: boolean; texture?: boolean; baseTexture?: boolean }) => void;
    once?: (event: string, listener: () => void) => void;
    on?: (event: string, listener: (...args: unknown[]) => void) => void;
    internalModel?: Record<string, unknown>;
  };
  from: (url: string) => Promise<InstanceType<Live2DModelConstructor>>;
  registerTicker: (ticker: unknown) => void;
};

let _cachedLive2DModel: Live2DModelConstructor | null = null;

const ensurePIXIGlobal = () => {
  if (typeof window === "undefined") return;
  const w = window as typeof window & { PIXI?: typeof PIXI };
  if (!w.PIXI || typeof w.PIXI !== "object") {
    (w as unknown as { PIXI: typeof PIXI }).PIXI = PIXI;
  } else {
    Object.assign(w.PIXI, PIXI);
  }
};

const loadPixiLive2DDisplay = (): Promise<void> => {
  const w = window as typeof window & { __pixiLive2DLoadingPromise__?: Promise<void> };
  if (w.__pixiLive2DLoadingPromise__) return w.__pixiLive2DLoadingPromise__;

  w.__pixiLive2DLoadingPromise__ = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-pixi-live2d="true"]') as HTMLScriptElement | null;
    if (existing) {
      const pixiWin = window as typeof window & { PIXI?: { live2d?: { Live2DModel?: unknown } } };
      if (pixiWin.PIXI?.live2d?.Live2DModel) { resolve(); return; }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("加载 pixi-live2d-display 失败")), { once: true });
      return;
    }

    ensurePIXIGlobal();

    const script = document.createElement("script");
    script.src = "/live2d/sdk/pixi-live2d-display-cubism4.min.js";
    script.async = false;
    script.dataset.pixiLive2d = "true";
    script.onload = () => {
      const pixiWin = window as typeof window & { PIXI?: { live2d?: { Live2DModel?: unknown } } };
      if (pixiWin.PIXI?.live2d?.Live2DModel) {
        logger.log("[Live2D] ✅ pixi-live2d-display 通过 script 标签加载成功");
        resolve();
      } else {
        reject(new Error("pixi-live2d-display 脚本已加载但 PIXI.live2d.Live2DModel 未注入"));
      }
    };
    script.onerror = () => reject(new Error("加载 pixi-live2d-display 脚本失败"));
    document.head.appendChild(script);
  });

  return w.__pixiLive2DLoadingPromise__;
};

const getLive2DModel = async (): Promise<Live2DModelConstructor> => {
  if (_cachedLive2DModel) return _cachedLive2DModel;
  await ensureCubismRuntime();
  ensurePIXIGlobal();
  await loadPixiLive2DDisplay();

  const pixiWin = window as typeof window & { PIXI?: { live2d?: { Live2DModel?: Live2DModelConstructor } } };
  const Live2DModelClass = pixiWin.PIXI?.live2d?.Live2DModel;
  if (!Live2DModelClass) {
    throw new Error("PIXI.live2d.Live2DModel 未找到，pixi-live2d-display 可能未正确加载");
  }

  _cachedLive2DModel = Live2DModelClass;
  _cachedLive2DModel.registerTicker(PIXI.Ticker);
  return _cachedLive2DModel;
};

const MAX_LIVE2D_INSTANCES = 4;
const _live2dInstances = new Map<string, Live2DDriver>();

const registerLive2DInstance = async (id: string, driver: Live2DDriver): Promise<void> => {
  if (_live2dInstances.size >= MAX_LIVE2D_INSTANCES) {
    const oldestKey = _live2dInstances.keys().next().value;
    if (oldestKey) {
      const old = _live2dInstances.get(oldestKey);
      old?.destroy();
      _live2dInstances.delete(oldestKey);
    }
  }
  _live2dInstances.set(id, driver);
};

const unregisterLive2DInstance = (id: string): void => {
  _live2dInstances.delete(id);
};

// ========== 新增：独立实例工厂（StagePreview 专用）==========
export const createLive2DDriver = (config: Live2DConfig): Live2DDriver => {
  return new Live2DDriver(config);
};

export class Live2DDriver {
  private app: Application | null = null;
  private model: InstanceType<Live2DModelConstructor> | null = null;
  private canvasId: string;
  private canvasElement: HTMLCanvasElement | null = null;
  private _originalCanvas: HTMLCanvasElement | null = null;
  private modelUrl: string;
  private width: number;
  private height: number;
  private _destroyed = false;
  private _modelReady = false;
  readonly instanceId: string = `live2d-${Math.random().toString(36).slice(2, 8)}`;
  private lipSyncTimer: number | null = null;
  private expressionResetTimer: ReturnType<typeof setTimeout> | null = null;
  private idleMotionTimer: ReturnType<typeof setInterval> | null = null;
  private _paramNameCache: Map<string, string> = new Map();
  private _overrideParams: Map<string, number> = new Map();
  private _overrideActive = false;
  private _emotionParams: Map<string, number> = new Map();
  private _emotionParamsActive = false;
  private _currentOverrideParams: Map<string, number> = new Map();
  private _overrideTransitionSpeed = 0.15;
  private _microActionTime = 0;
  private _microBlinkTimer = 0;
  private _nextBlinkInterval = 3000 + Math.random() * 4000;
  private _lastBlinkTime = 0;
  private _microHeadDrift = { x: 0, y: 0, targetX: 0, targetY: 0, nextChangeTime: 0 };
  private _breathPhase = 0;
  private _breathSpeed = 0.8;
  private _eyeBallDrift = { x: 0, y: 0, targetX: 0, targetY: 0, nextChangeTime: 0 };
  private _idleActionTimer = 0;
  private _nextIdleActionTime = 4000 + Math.random() * 8000;
  private _lastIdleActionTime = 0;
  private _bodySwayPhase = 0;
  private _bodySwaySpeed = 0.3;
  private _customAnim: {
    playing: boolean;
    startTime: number;
    duration: number;
    keyframes: CustomAnimKeyframe[];
    onComplete?: () => void;
  } | null = null;

  private _tickerCallback: (() => void) | null = null;

  private _speechBeat = { active: false, startTime: 0, duration: 0, intensity: 0.5 };
  private _lipCache = { openY: 0, form: 0 };

  private resolveParamId(id: string): string {
    if (this._paramNameCache.has(id)) return this._paramNameCache.get(id)!;
    const coreModel = (this.model as unknown as MutableModel | null)?.internalModel?.coreModel;
    if (!coreModel) return id;

    let allIds: string[] = [];
    try {
      const count = coreModel.getParameterCount?.() || 0;
      for (let i = 0; i < count; i++) {
        const paramId = coreModel.getParameterId?.(i);
        if (paramId) allIds.push(paramId);
      }
    } catch {
      allIds = coreModel._model?.parameters?.ids || [];
    }

    if (allIds.includes(id)) {
      this._paramNameCache.set(id, id);
      return id;
    }
    const upper = id.replace(/([A-Z])/g, '_$1').replace(/^_/, '').toUpperCase();
    if (allIds.includes(upper)) {
      this._paramNameCache.set(id, upper);
      return upper;
    }
    this._paramNameCache.set(id, id);
    return id;
  }

  setParam(id: string, value: number): void {
    const coreModel = (this.model as unknown as MutableModel | null)?.internalModel?.coreModel;
    if (!coreModel) return;
    const resolved = this.resolveParamId(id);
    // 如果已经发现过参数列表，检查参数是否存在
    if (this._allParamIds.size > 0 && !this._allParamIds.has(resolved)) return;
    try {
      coreModel.setParameterValueById?.(resolved, value);
    } catch {
      // Parameter not found, ignore silently
    }
  }

  addParam(id: string, value: number): void {
    const coreModel = (this.model as unknown as MutableModel | null)?.internalModel?.coreModel;
    if (!coreModel) return;
    const resolved = this.resolveParamId(id);
    if (this._allParamIds.size > 0 && !this._allParamIds.has(resolved)) return;
    try { coreModel.addParameterValueById?.(resolved, value); } catch { /* ignore */ }
  }

  constructor(config: Live2DConfig = {}) {
    this.canvasId = config.canvasId ?? "live2d-canvas";
    this.canvasElement = config.canvas ?? null;
    this.modelUrl = config.modelUrl ?? "/live2d/models/kei_basic_free/runtime/kei_basic_free.model3.json";
    this.width = config.width ?? 400;
    this.height = config.height ?? 600;
  }

  async init(): Promise<void> {
    if (this._destroyed) {
      throw new Error('Live2DDriver 已销毁，无法重新初始化');
    }

    const containerCanvas = this.canvasElement ?? document.getElementById(this.canvasId) as HTMLCanvasElement | null;
    if (!containerCanvas) {
      throw new Error(`Canvas element with id "${this.canvasId}" not found`);
    }

    if (!document.contains(containerCanvas)) {
      throw new Error('Canvas element is not in the DOM');
    }

    this._originalCanvas = containerCanvas;

    if (this.app) {
      logger.log('[Live2D] Application 已初始化，跳过');
      return;
    }

    const cssW = Math.max(1, this.width);
    const cssH = Math.max(1, this.height);

    const pixiWindow = window as typeof window & { PIXI?: typeof PIXI };
    if ('PIXI' in window && pixiWindow.PIXI && 'PREFER_ENV' in settings) {
      (settings as unknown as { PREFER_ENV: number }).PREFER_ENV = 2;
    }

    // 清理可能存在的旧 WebGL 上下文
    const existingCanvas = containerCanvas.parentNode?.querySelector('canvas.live2d-canvas') as HTMLCanvasElement | null;
    if (existingCanvas) {
      try {
        const gl = existingCanvas.getContext('webgl2') || existingCanvas.getContext('webgl');
        if (gl) {
          const ext = gl.getExtension('WEBGL_lose_context');
          if (ext) ext.loseContext();
        }
        existingCanvas.remove();
      } catch { /* ignore */ }
    }

    const tryCreateApp = async (): Promise<Application | null> => {
      if (this._destroyed) return null;

      const attempts = [
        {
          width: cssW,
          height: cssH,
          backgroundAlpha: 0,
          antialias: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
        },
        {
          width: cssW,
          height: cssH,
          backgroundAlpha: 0,
          antialias: false,
          resolution: 1,
          autoDensity: true,
        },
        {
          width: cssW,
          height: cssH,
          backgroundAlpha: 0,
          forceCanvas: true,
        },
      ];

      for (let i = 0; i < attempts.length; i++) {
        if (this._destroyed) return null;

        logger.log(`[Live2D] 尝试 ${i + 1}:`, { opts: attempts[i] });

        try {
          const app = new Application(attempts[i]);
          logger.log(`[Live2D] ✅ PIXI Application 创建成功 (尝试 ${i + 1})`);

          const pixiCanvas = app.view as HTMLCanvasElement;
          logger.log('[Live2D] Debug: pixiCanvas:', !!pixiCanvas, 'parentNode:', !!containerCanvas.parentNode, 'parentNode tagName:', containerCanvas.parentNode?.nodeName);
          
          if (pixiCanvas && containerCanvas.parentNode) {
            // 调试：强制样式确保 canvas 可见
            pixiCanvas.style.width = '100%';
            pixiCanvas.style.height = '100%';
            pixiCanvas.style.maxWidth = '100%';
            pixiCanvas.style.maxHeight = '100%';
            pixiCanvas.style.minWidth = '200px';
            pixiCanvas.style.minHeight = '200px';
            pixiCanvas.style.display = 'block';
            pixiCanvas.style.visibility = 'visible';
            pixiCanvas.style.opacity = '1';
            pixiCanvas.style.position = 'relative';
            pixiCanvas.style.zIndex = '1';
            pixiCanvas.classList.add('live2d-canvas');
            containerCanvas.style.display = 'none';
            containerCanvas.parentNode.insertBefore(pixiCanvas, containerCanvas.nextSibling);
            this.canvasElement = pixiCanvas;
            
            // 调试日志
            logger.log('[Live2D] PIXI canvas 样式已设置:', {
              display: pixiCanvas.style.display,
              visibility: pixiCanvas.style.visibility,
              opacity: pixiCanvas.style.opacity,
              width: pixiCanvas.style.width,
              height: pixiCanvas.style.height,
              clientWidth: pixiCanvas.clientWidth,
              clientHeight: pixiCanvas.clientHeight,
              offsetWidth: pixiCanvas.offsetWidth,
              offsetHeight: pixiCanvas.offsetHeight,
            });
          } else {
            logger.warn('[Live2D] Debug: 跳过 canvas 样式设置 - pixiCanvas:', !!pixiCanvas, 'parentNode:', !!containerCanvas.parentNode);
            // parentNode 为 null，尝试等待 DOM 稳定后重新获取
            if (pixiCanvas) {
              logger.log('[Live2D] Debug: 等待 DOM 稳定后重新获取 parentNode');
              await new Promise(resolve => setTimeout(resolve, 100));
              
              // 重新检查 parentNode
              if (containerCanvas.parentNode) {
                logger.log('[Live2D] Debug: DOM 稳定后 parentNode 恢复');
                pixiCanvas.style.width = '100%';
                pixiCanvas.style.height = '100%';
                pixiCanvas.style.display = 'block';
                pixiCanvas.style.visibility = 'visible';
                pixiCanvas.style.position = 'absolute';
                pixiCanvas.classList.add('live2d-canvas');
                containerCanvas.style.display = 'none';
                containerCanvas.parentNode.insertBefore(pixiCanvas, containerCanvas.nextSibling);
                this.canvasElement = pixiCanvas;
              } else {
                // 仍然没有 parentNode，将 canvas 插入到 shell 容器的父元素
                logger.log('[Live2D] Debug: 使用备用方案插入 canvas');
                const shell = document.querySelector('.live2d-stage-shell') || document.querySelector('section[aria-label*="Live2D"]');
                if (shell) {
                  pixiCanvas.style.width = '100%';
                  pixiCanvas.style.height = '100%';
                  pixiCanvas.style.display = 'block';
                  pixiCanvas.style.visibility = 'visible';
                  pixiCanvas.style.position = 'absolute';
                  pixiCanvas.style.top = '0';
                  pixiCanvas.style.left = '0';
                  pixiCanvas.classList.add('live2d-canvas');
                  shell.appendChild(pixiCanvas);
                  this.canvasElement = pixiCanvas;
                } else {
                  // 最后方案：插入到 body
                  pixiCanvas.style.width = '100%';
                  pixiCanvas.style.height = '100%';
                  pixiCanvas.style.display = 'block';
                  pixiCanvas.style.visibility = 'visible';
                  pixiCanvas.style.position = 'absolute';
                  pixiCanvas.classList.add('live2d-canvas');
                  document.body.appendChild(pixiCanvas);
                  this.canvasElement = pixiCanvas;
                }
              }
            }
          }

          return app;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const name = err instanceof Error ? err.name : 'Error';
          logger.error(`[Live2D] 尝试 ${i + 1} 失败:`, name, msg);
          logger.warn(`[Live2D] Application 创建失败 (尝试 ${i + 1}/${attempts.length}): [${name}] ${msg}`);
        }
      }

      logger.error('[Live2D] 所有尝试均失败，当前活跃 WebGL 上下文数可能已耗尽');
      return null;
    };

    this.app = await tryCreateApp();
    if (!this.app) {
      throw new Error('Failed to create PIXI Application');
    }

    await registerLive2DInstance(this.instanceId, this);
  }

  async loadModel(url?: string): Promise<InstanceType<Live2DModelConstructor>> {
    const modelUrl = url ?? this.modelUrl;
    if (!this.app) throw new Error("Application not initialized. Call init() first.");

    this._modelReady = false;

    if (this.model) {
      this.app.stage.removeChild(this.model as unknown as DisplayObject);
      this.model.destroy();
      this.model = null;
    }

    const Live2DModelClass = await getLive2DModel();
    this.model = await Live2DModelClass.from(modelUrl);

    const internalModel = (this.model as unknown as { internalModel?: { focusController?: unknown; hitAreas?: unknown[] } }).internalModel;
    if (internalModel && !Array.isArray(internalModel.hitAreas)) internalModel.hitAreas = [];

    const modelWithFlags = this.model as unknown as { buttonMode?: boolean; interactive?: boolean; interactiveChildren?: boolean };
    modelWithFlags.buttonMode = false;
    modelWithFlags.interactive = false;
    modelWithFlags.interactiveChildren = false;

    const displayModel = this.model as unknown as MutableModel;

    this.app.stage.addChild(displayModel);

    await new Promise<void>((resolve) => {
      const onReady = () => {
        this._modelReady = true;
        logger.log('[Live2D] ✅ 模型 ready');
        resolve();
      };

      if (displayModel.internalModel?.motionManager) {
        onReady();
        return;
      }

      const readyTimeout = setTimeout(() => {
        logger.warn('[Live2D] ⚠️ 等待模型 ready 超时，强制继续');
        onReady();
      }, 5000);

      this.model?.once?.('ready', () => {
        clearTimeout(readyTimeout);
        onReady();
      });
    });

    this._fitModel();

    this._discoverModelCapabilities();
    this._startOverrideTicker();

    return this.model;
  }

  private _fitModel(): void {
    if (!this.model || !this.app) {
      logger.warn('[Live2D] _fitModel: model or app is null');
      return;
    }

    const displayModel = this.model as unknown as MutableModel | null;
    if (!displayModel) return;

    // 用 this.width/height，不是 app.screen（避免 PIXI v8 兼容性问题）
    const canvasW = this.width;
    const canvasH = this.height;

    let rawW = 500, rawH = 500;
    const internal = (this.model as unknown as { internalModel?: { originalWidth?: number; originalHeight?: number; width?: number; height?: number; model?: { width?: number; height?: number } } }).internalModel;
    if (internal?.originalWidth && internal?.originalHeight) {
      rawW = internal.originalWidth;
      rawH = internal.originalHeight;
    } else if (internal?.width && internal?.height) {
      rawW = internal.width;
      rawH = internal.height;
    } else if (internal?.model?.width && internal?.model?.height) {
      rawW = internal.model.width;
      rawH = internal.model.height;
    } else {
      const bounds = displayModel.getBounds();
      if (bounds.width > 0 && bounds.height > 0) {
        rawW = bounds.width;
        rawH = bounds.height;
      }
    }

    // 等比例缩放，留 5% 边距，并限制 scale 范围防止过小或过大
    const rawScale = Math.min(canvasW / rawW, canvasH / rawH) * 0.95;
    const scale = Math.max(Math.min(rawScale, 3.0), 0.05);

    if (!isFinite(scale) || scale <= 0) {
      logger.warn(`[Live2D] 缩放异常: scale=${scale}, canvasW=${canvasW}, canvasH=${canvasH}, rawW=${rawW}, rawH=${rawH}`);
      return;
    }

    if (displayModel.scale?.set) {
      displayModel.scale.set(scale, scale);
    }

    // 【修复1】设置锚点为底部中央，确保模型正确定位
    if (displayModel.anchor?.set) {
      displayModel.anchor.set(0.5, 1.0);
    }

    // Live2D 模型坐标系：原点在画布中央底部
    displayModel.x = canvasW / 2;
    displayModel.y = canvasH;

    logger.log(`[Live2D] 📐 fit: 画布=${canvasW}x${canvasH}, 原始=${rawW}x${rawH}, scale=${scale.toFixed(3)}, pos=(${displayModel.x}, ${displayModel.y})`);
  }

  resize(width: number, height: number): void {
    if (this._destroyed || !this.app) return;
    this.width = width;
    this.height = height;

    // 轻量 resize：只改 renderer 尺寸，不重建
    this.app.renderer.resize(width, height);
    this._fitModel();

    logger.log(`[Live2D] 📐 resize: ${width}x${height}`);
  }

  private _updateCanvasDPR(): void {
    if (!this.app) return;
    const canvas = this.app.view as HTMLCanvasElement;
    if (!canvas) return;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
  }

  private _availableMotionGroups: Set<string> = new Set();
  private _availableExpressions: string[] = [];
  private _hasExpressions = false;
  private _allParamIds: Set<string> = new Set();

  private _discoverModelCapabilities(): void {
    const displayModel = this.model as unknown as MutableModel & {
      internalModel?: {
        motionManager?: { motionGroups?: Record<string, unknown[]> };
        settings?: { expressions?: Array<{ name?: string; Name?: string }>; motions?: Record<string, unknown[]> };
      };
    } | null;
    if (!displayModel?.internalModel) return;

    const settings = displayModel.internalModel.settings;
    const motionManager = displayModel.internalModel.motionManager;

    const coreModel = (this.model as unknown as MutableModel | null)?.internalModel?.coreModel;
    if (coreModel) {
      try {
        const count = coreModel.getParameterCount?.() || 0;
        for (let i = 0; i < count; i++) {
          const paramId = coreModel.getParameterId?.(i);
          if (paramId) this._allParamIds.add(paramId);
        }
      } catch { /* ignore */ }

      if (this._allParamIds.size === 0 && coreModel._model?.parameters?.ids) {
        for (const id of coreModel._model.parameters.ids) {
          if (id) this._allParamIds.add(id);
        }
      }
    }

    if (this._allParamIds.size === 0) {
      try {
        const params = (this.model as unknown as { internalModel?: { coreModel?: { _model?: { parameters?: Array<{ id?: string }> } } } })
          .internalModel?.coreModel?._model?.parameters;
        if (Array.isArray(params)) {
          for (const p of params) {
            if (p && typeof p === 'object' && 'id' in p && p.id) this._allParamIds.add(p.id);
          }
        }
      } catch { /* ignore */ }
    }

    if (this._allParamIds.size === 0) {
      try {
        const settingsParams = (this.model as unknown as { internalModel?: { settings?: { parameters?: Array<{ id?: string }> } } })
          .internalModel?.settings?.parameters;
        if (Array.isArray(settingsParams)) {
          for (const p of settingsParams) {
            if (p && typeof p === 'object' && 'id' in p && p.id) this._allParamIds.add(p.id);
          }
        }
      } catch { /* ignore */ }
    }
    logger.log('[Live2D] 📋 模型参数:', Array.from(this._allParamIds));

    this._detectParamNamingConvention();

    if (settings?.motions) {
      Object.keys(settings.motions).forEach(g => this._availableMotionGroups.add(g));
    }
    if (motionManager?.motionGroups) {
      Object.keys(motionManager.motionGroups).forEach(g => this._availableMotionGroups.add(g));
    }
    logger.log('[Live2D] 🎬 可用动作组:', Array.from(this._availableMotionGroups));

    for (const group of this._availableMotionGroups) {
      if (!this.motionGroupMap[group]) {
        this.motionGroupMap[group] = [group];
      }
    }

    const expressions = settings?.expressions;
    this._hasExpressions = Array.isArray(expressions) && expressions.length > 0;
    if (this._hasExpressions && Array.isArray(expressions)) {
      this._availableExpressions = expressions.map((e: { name?: string; Name?: string }) => e.name || e.Name || '');
      logger.log('[Live2D] 😊 可用表情:', this._availableExpressions);
      this._buildExpressionMap();
    } else {
      logger.log('[Live2D] 😊 模型无内置表情，使用参数驱动');
    }

    this._updateEmotionMotionMapping();
    this._buildEmotionConfigs();
  }

  private _paramConvention: 'UPPER' | 'CamelCase' | 'unknown' = 'unknown';

  private _detectParamNamingConvention(): void {
    const ids = Array.from(this._allParamIds);
    if (ids.length === 0) {
      this._paramConvention = 'unknown';
      logger.log('[Live2D] 📐 参数命名风格: 未知 (无参数)');
      return;
    }
    const hasUpper = ids.some(id => id.startsWith('PARAM_'));
    const hasCamel = ids.some(id => id.startsWith('Param') && !id.startsWith('PARAM_'));
    if (hasUpper && !hasCamel) {
      this._paramConvention = 'UPPER';
      logger.log('[Live2D] 📐 参数命名风格: UPPER (PARAM_*)');
    } else if (hasCamel && !hasUpper) {
      this._paramConvention = 'CamelCase';
      logger.log('[Live2D] 📐 参数命名风格: CamelCase (Param*)');
    } else if (hasUpper && hasCamel) {
      this._paramConvention = 'UPPER';
      logger.log('[Live2D] 📐 参数命名风格: 混合，优先 UPPER');
    } else {
      this._paramConvention = 'unknown';
      logger.log('[Live2D] 📐 参数命名风格: 未知');
    }
  }

  private _buildExpressionMap(): void {
    this.expressionNameMap = {};
    const names = this._availableExpressions;
    for (const name of names) {
      const lower = name.toLowerCase();
      if (lower === 'normal' || lower === 'default') {
        this.expressionNameMap.neutral = name;
      } else if (lower === 'happy' || lower === 'smile') {
        this.expressionNameMap.happy = name;
        this.expressionNameMap.warm = name;
        this.expressionNameMap.excited = name;
        this.expressionNameMap.relieved = name;
        this.expressionNameMap.nostalgic = name;
        this.expressionNameMap.proud = name;
      } else if (lower === 'sad' || lower === 'cry') {
        this.expressionNameMap.sad = name;
        this.expressionNameMap.concerned = name;
        this.expressionNameMap.sleepy = name;
        this.expressionNameMap.apologetic = name;
        this.expressionNameMap.bored = name;
      } else if (lower === 'angry') {
        this.expressionNameMap.angry = name;
        this.expressionNameMap.disgusted = name;
        this.expressionNameMap.tsundere = name;
        this.expressionNameMap.frustrated = name;
      } else if (lower === 'surprised') {
        this.expressionNameMap.surprised = name;
        this.expressionNameMap.fearful = name;
        this.expressionNameMap.curious = name;
      } else if (lower === 'blushing') {
        this.expressionNameMap.shy = name;
        this.expressionNameMap.embarrassed = name;
      } else if (lower === 'thinking' || lower === 'think') {
        this.expressionNameMap.thinking = name;
        this.expressionNameMap.confused = name;
      }
    }
    if (!this.expressionNameMap.neutral) {
      this.expressionNameMap.neutral = names[0] || 'Normal';
    }
    logger.log('[Live2D] 😊 表情映射:', this.expressionNameMap);
  }

  private _updateEmotionMotionMapping(): void {
    const groups = this._availableMotionGroups;
    if (groups.size === 0) return;

    const emotionMotionPriority: Record<string, string[]> = {
      happy: ['Tap', 'Tap@Body', 'Flick', 'Flick@Body', 'FlickUp', 'Idle'],
      sad: ['Idle', 'FlickDown', 'Flick', 'Tap'],
      angry: ['Flick3', 'Flick@Body', 'Tap@Body', 'Flick', 'Tap'],
      surprised: ['FlickUp', 'Flick', 'Tap', 'Idle'],
      fearful: ['FlickUp', 'Flick', 'Tap', 'Idle'],
      disgusted: ['Flick3', 'Flick', 'Tap', 'Idle'],
      shy: ['Idle', 'Tap', 'Flick'],
      warm: ['Tap', 'Tap@Body', 'Idle', 'Flick'],
      tsundere: ['Flick3', 'Flick@Body', 'Tap@Body', 'Flick', 'Tap'],
      concerned: ['Idle', 'Flick', 'Tap'],
      sleepy: ['Idle', 'Flick'],
      neutral: ['Idle'],
      excited: ['Tap', 'Tap@Body', 'FlickUp', 'Flick', 'Idle'],
      confused: ['Idle', 'Flick', 'Tap'],
      bored: ['Idle', 'Flick'],
      relieved: ['Idle', 'Tap', 'Flick'],
      frustrated: ['Flick3', 'Flick@Body', 'Flick', 'Tap', 'Idle'],
      nostalgic: ['Idle', 'Flick', 'Tap'],
      curious: ['Tap', 'Flick', 'Idle'],
      apologetic: ['Idle', 'Flick', 'Tap'],
      proud: ['Tap', 'Tap@Body', 'Flick', 'Idle'],
      embarrassed: ['Idle', 'Tap', 'Flick'],
    };

    for (const [emotion, priority] of Object.entries(emotionMotionPriority)) {
      const bestMatch = priority.find(g => groups.has(g));
      if (bestMatch && this.emotionParams[emotion]) {
        this.emotionParams[emotion].motionGroup = bestMatch;
      }
    }

    logger.log('[Live2D] 🎭 情绪动作映射:',
      Object.fromEntries(
        Object.entries(this.emotionParams)
          .map(([k, v]) => [k, v.motionGroup])
      )
    );
  }

  private _buildEmotionConfigs(): void {
    const c = this._paramConvention;
    const p = (upperId: string, camelId: string): string[] => {
      if (c === 'CamelCase') return [camelId];
      if (c === 'UPPER') return [upperId];
      return [upperId, camelId];
    };

    this._emotionConfigs = {
      neutral: {
        motionGroup: this.emotionParams.neutral?.motionGroup ?? 'Idle',
        expressionOverride: null,
        paramAdditions: {},
      },
      happy: {
        motionGroup: this.emotionParams.happy?.motionGroup ?? 'Tap',
        expressionOverride: this.expressionNameMap.happy ?? null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, 0.5]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, 0.5]),
          ...p('PARAM_BROW_L_ANGLE', 'ParamBrowLAngle').map(id => [id, 0.3]),
          ...p('PARAM_BROW_R_ANGLE', 'ParamBrowRAngle').map(id => [id, 0.3]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, 0.8]),
          ...p('PARAM_TERE', 'ParamTere').map(id => [id, 0.6]),
          ...p('PARAM_EYE_L_OPEN', 'ParamEyeLOpen').map(id => [id, -0.2]),
          ...p('PARAM_EYE_R_OPEN', 'ParamEyeROpen').map(id => [id, -0.2]),
          ['ParamEyeLSmile', 0.8],
          ['ParamEyeRSmile', 0.8],
          ['ParamCheek', 0.6],
        ]),
      },
      sad: {
        motionGroup: this.emotionParams.sad?.motionGroup ?? 'Idle',
        expressionOverride: this.expressionNameMap.sad ?? null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, -0.6]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, -0.6]),
          ...p('PARAM_BROW_L_ANGLE', 'ParamBrowLAngle').map(id => [id, 0.6]),
          ...p('PARAM_BROW_R_ANGLE', 'ParamBrowRAngle').map(id => [id, 0.6]),
          ...p('PARAM_BROW_L_FORM', 'ParamBrowLForm').map(id => [id, -1]),
          ...p('PARAM_BROW_R_FORM', 'ParamBrowRForm').map(id => [id, -1]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, -0.8]),
          ...p('PARAM_EYE_L_OPEN', 'ParamEyeLOpen').map(id => [id, -0.3]),
          ...p('PARAM_EYE_R_OPEN', 'ParamEyeROpen').map(id => [id, -0.3]),
        ]),
      },
      angry: {
        motionGroup: this.emotionParams.angry?.motionGroup ?? 'Flick3',
        expressionOverride: this.expressionNameMap.angry ?? null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, -0.8]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, -0.8]),
          ...p('PARAM_BROW_L_ANGLE', 'ParamBrowLAngle').map(id => [id, -1]),
          ...p('PARAM_BROW_R_ANGLE', 'ParamBrowRAngle').map(id => [id, -1]),
          ...p('PARAM_BROW_L_FORM', 'ParamBrowLForm').map(id => [id, -1]),
          ...p('PARAM_BROW_R_FORM', 'ParamBrowRForm').map(id => [id, -1]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, -0.5]),
        ]),
      },
      surprised: {
        motionGroup: this.emotionParams.surprised?.motionGroup ?? 'FlickUp',
        expressionOverride: this.expressionNameMap.surprised ?? null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, 0.8]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, 0.8]),
          ...p('PARAM_BROW_L_FORM', 'ParamBrowLForm').map(id => [id, 1]),
          ...p('PARAM_BROW_R_FORM', 'ParamBrowRForm').map(id => [id, 1]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, -0.5]),
          ...p('PARAM_MOUTH_OPEN_Y', 'ParamMouthOpenY').map(id => [id, 0.3]),
        ]),
      },
      fearful: {
        motionGroup: this.emotionParams.fearful?.motionGroup ?? 'FlickUp',
        expressionOverride: this.expressionNameMap.fearful ?? null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, 0.6]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, 0.6]),
          ...p('PARAM_BROW_L_FORM', 'ParamBrowLForm').map(id => [id, 0.5]),
          ...p('PARAM_BROW_R_FORM', 'ParamBrowRForm').map(id => [id, 0.5]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, -0.3]),
          ...p('PARAM_EYE_L_OPEN', 'ParamEyeLOpen').map(id => [id, 0.5]),
          ...p('PARAM_EYE_R_OPEN', 'ParamEyeROpen').map(id => [id, 0.5]),
        ]),
      },
      disgusted: {
        motionGroup: this.emotionParams.disgusted?.motionGroup ?? 'Flick3',
        expressionOverride: this.expressionNameMap.disgusted ?? null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, -0.3]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, -0.3]),
          ...p('PARAM_BROW_L_ANGLE', 'ParamBrowLAngle').map(id => [id, -0.5]),
          ...p('PARAM_BROW_R_ANGLE', 'ParamBrowRAngle').map(id => [id, -0.5]),
          ...p('PARAM_BROW_L_FORM', 'ParamBrowLForm').map(id => [id, -1]),
          ...p('PARAM_BROW_R_FORM', 'ParamBrowRForm').map(id => [id, -1]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, -0.8]),
        ]),
      },
      shy: {
        motionGroup: this.emotionParams.shy?.motionGroup ?? 'Idle',
        expressionOverride: this.expressionNameMap.shy ?? null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, -0.25]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, -0.25]),
          ...p('PARAM_BROW_L_ANGLE', 'ParamBrowLAngle').map(id => [id, 0.5]),
          ...p('PARAM_BROW_R_ANGLE', 'ParamBrowRAngle').map(id => [id, 0.5]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, -0.2]),
          ...p('PARAM_TERE', 'ParamTere').map(id => [id, 1]),
          ...p('PARAM_EYE_L_OPEN', 'ParamEyeLOpen').map(id => [id, -0.3]),
          ...p('PARAM_EYE_R_OPEN', 'ParamEyeROpen').map(id => [id, -0.3]),
          ['ParamCheek', 1],
        ]),
      },
      warm: {
        motionGroup: this.emotionParams.warm?.motionGroup ?? 'Tap',
        expressionOverride: this.expressionNameMap.warm ?? null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, 0.3]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, 0.3]),
          ...p('PARAM_BROW_L_ANGLE', 'ParamBrowLAngle').map(id => [id, 0.2]),
          ...p('PARAM_BROW_R_ANGLE', 'ParamBrowRAngle').map(id => [id, 0.2]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, 0.6]),
          ...p('PARAM_TERE', 'ParamTere').map(id => [id, 0.4]),
          ...p('PARAM_EYE_L_OPEN', 'ParamEyeLOpen').map(id => [id, -0.15]),
          ...p('PARAM_EYE_R_OPEN', 'ParamEyeROpen').map(id => [id, -0.15]),
          ['ParamEyeLSmile', 0.5],
          ['ParamEyeRSmile', 0.5],
          ['ParamCheek', 0.4],
        ]),
      },
      tsundere: {
        motionGroup: this.emotionParams.tsundere?.motionGroup ?? 'Flick3',
        expressionOverride: this.expressionNameMap.tsundere ?? null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, -0.5]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, -0.5]),
          ...p('PARAM_BROW_L_ANGLE', 'ParamBrowLAngle').map(id => [id, -0.6]),
          ...p('PARAM_BROW_R_ANGLE', 'ParamBrowRAngle').map(id => [id, -0.6]),
          ...p('PARAM_BROW_L_FORM', 'ParamBrowLForm').map(id => [id, -1]),
          ...p('PARAM_BROW_R_FORM', 'ParamBrowRForm').map(id => [id, -1]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, -0.3]),
          ...p('PARAM_TERE', 'ParamTere').map(id => [id, 0.6]),
          ['ParamCheek', 0.7],
        ]),
      },
      concerned: {
        motionGroup: this.emotionParams.concerned?.motionGroup ?? 'Idle',
        expressionOverride: this.expressionNameMap.concerned ?? null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, -0.3]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, -0.3]),
          ...p('PARAM_BROW_L_ANGLE', 'ParamBrowLAngle').map(id => [id, 0.4]),
          ...p('PARAM_BROW_R_ANGLE', 'ParamBrowRAngle').map(id => [id, 0.4]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, -0.3]),
        ]),
      },
      sleepy: {
        motionGroup: this.emotionParams.sleepy?.motionGroup ?? 'Idle',
        expressionOverride: this.expressionNameMap.sleepy ?? null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, -0.2]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, -0.2]),
          ...p('PARAM_EYE_L_OPEN', 'ParamEyeLOpen').map(id => [id, -0.5]),
          ...p('PARAM_EYE_R_OPEN', 'ParamEyeROpen').map(id => [id, -0.5]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, 0]),
        ]),
      },
      tired: {
        motionGroup: 'Idle',
        expressionOverride: this.expressionNameMap.sleepy ?? null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, -0.3]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, -0.3]),
          ...p('PARAM_EYE_L_OPEN', 'ParamEyeLOpen').map(id => [id, -0.4]),
          ...p('PARAM_EYE_R_OPEN', 'ParamEyeROpen').map(id => [id, -0.4]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, -0.1]),
        ]),
      },
      listening: {
        motionGroup: 'Idle',
        expressionOverride: null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, 0.3]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, 0.3]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, 0.2]),
        ]),
      },
      speaking: {
        motionGroup: 'Tap',
        expressionOverride: null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, 0.5]),
        ]),
      },
      thinking: {
        motionGroup: 'Idle',
        expressionOverride: null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, 0.2]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, -0.1]),
          ...p('PARAM_BROW_L_ANGLE', 'ParamBrowLAngle').map(id => [id, 0.3]),
          ...p('PARAM_BROW_R_ANGLE', 'ParamBrowRAngle').map(id => [id, -0.2]),
        ]),
      },
      excited: {
        motionGroup: this.emotionParams.excited?.motionGroup ?? 'Tap',
        expressionOverride: this.expressionNameMap.happy ?? null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, 0.8]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, 0.8]),
          ...p('PARAM_BROW_L_ANGLE', 'ParamBrowLAngle').map(id => [id, 0.5]),
          ...p('PARAM_BROW_R_ANGLE', 'ParamBrowRAngle').map(id => [id, 0.5]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, 1]),
          ['ParamCheek', 0.6],
          ['ParamEyeLSmile', 0.7],
          ['ParamEyeRSmile', 0.7],
        ]),
      },
      confused: {
        motionGroup: this.emotionParams.confused?.motionGroup ?? 'Idle',
        expressionOverride: null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, 0.5]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, -0.3]),
          ...p('PARAM_BROW_L_ANGLE', 'ParamBrowLAngle').map(id => [id, 0.3]),
          ...p('PARAM_BROW_R_ANGLE', 'ParamBrowRAngle').map(id => [id, -0.4]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, -0.2]),
        ]),
      },
      bored: {
        motionGroup: this.emotionParams.bored?.motionGroup ?? 'Idle',
        expressionOverride: null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, -0.15]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, -0.15]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, -0.3]),
        ]),
      },
      relieved: {
        motionGroup: this.emotionParams.relieved?.motionGroup ?? 'Idle',
        expressionOverride: this.expressionNameMap.happy ?? null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, 0.2]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, 0.2]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, 0.4]),
          ['ParamCheek', 0.3],
          ['ParamEyeLSmile', 0.4],
          ['ParamEyeRSmile', 0.4],
        ]),
      },
      frustrated: {
        motionGroup: this.emotionParams.frustrated?.motionGroup ?? 'Flick3',
        expressionOverride: this.expressionNameMap.angry ?? null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, -0.6]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, -0.6]),
          ...p('PARAM_BROW_L_ANGLE', 'ParamBrowLAngle').map(id => [id, -0.7]),
          ...p('PARAM_BROW_R_ANGLE', 'ParamBrowRAngle').map(id => [id, -0.7]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, -0.6]),
        ]),
      },
      nostalgic: {
        motionGroup: this.emotionParams.nostalgic?.motionGroup ?? 'Idle',
        expressionOverride: this.expressionNameMap.happy ?? null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, 0.15]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, 0.15]),
          ...p('PARAM_BROW_L_ANGLE', 'ParamBrowLAngle').map(id => [id, 0.3]),
          ...p('PARAM_BROW_R_ANGLE', 'ParamBrowRAngle').map(id => [id, 0.3]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, 0.3]),
          ['ParamCheek', 0.3],
          ['ParamEyeLSmile', 0.3],
          ['ParamEyeRSmile', 0.3],
        ]),
      },
      curious: {
        motionGroup: this.emotionParams.curious?.motionGroup ?? 'Tap',
        expressionOverride: null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, 0.5]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, 0.5]),
          ...p('PARAM_BROW_L_ANGLE', 'ParamBrowLAngle').map(id => [id, 0.3]),
          ...p('PARAM_BROW_R_ANGLE', 'ParamBrowRAngle').map(id => [id, 0.3]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, 0.2]),
        ]),
      },
      apologetic: {
        motionGroup: this.emotionParams.apologetic?.motionGroup ?? 'Idle',
        expressionOverride: this.expressionNameMap.sad ?? null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, -0.4]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, -0.4]),
          ...p('PARAM_BROW_L_ANGLE', 'ParamBrowLAngle').map(id => [id, 0.6]),
          ...p('PARAM_BROW_R_ANGLE', 'ParamBrowRAngle').map(id => [id, 0.6]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, -0.4]),
          ...p('PARAM_TERE', 'ParamTere').map(id => [id, 0.3]),
          ['ParamCheek', 0.4],
        ]),
      },
      proud: {
        motionGroup: this.emotionParams.proud?.motionGroup ?? 'Tap',
        expressionOverride: this.expressionNameMap.happy ?? null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, 0.5]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, 0.5]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, 0.6]),
          ['ParamCheek', 0.4],
          ['ParamEyeLSmile', 0.4],
          ['ParamEyeRSmile', 0.4],
        ]),
      },
      embarrassed: {
        motionGroup: 'Idle',
        expressionOverride: this.expressionNameMap.shy ?? null,
        paramAdditions: Object.fromEntries([
          ...p('PARAM_BROW_L_Y', 'ParamBrowLY').map(id => [id, -0.25]),
          ...p('PARAM_BROW_R_Y', 'ParamBrowRY').map(id => [id, -0.25]),
          ...p('PARAM_BROW_L_ANGLE', 'ParamBrowLAngle').map(id => [id, 0.5]),
          ...p('PARAM_BROW_R_ANGLE', 'ParamBrowRAngle').map(id => [id, 0.5]),
          ...p('PARAM_MOUTH_FORM', 'ParamMouthForm').map(id => [id, -0.2]),
          ...p('PARAM_TERE', 'ParamTere').map(id => [id, 1]),
          ['ParamCheek', 1],
        ]),
      },
    };

    logger.log('[Live2D] 🎭 情绪配置已构建（混合模式：Expression + 参数补充）');
  }

  private _startOverrideTicker(): void {
    this._stopOverrideTicker();
    this._tickerCallback = () => {
      const coreModel = (this.model as unknown as MutableModel | null)?.internalModel?.coreModel;
      if (!coreModel) return;
      const now = Date.now();
      const dt = 1 / 60;

      if (this._targetEmotionParams.size > 0 || this._currentEmotionParams.size > 0) {
        const allKeys = new Set([...this._targetEmotionParams.keys(), ...this._currentEmotionParams.keys()]);
        for (const id of allKeys) {
          const target = this._targetEmotionParams.get(id) ?? 0;
          const current = this._currentEmotionParams.get(id) ?? 0;
          const diff = target - current;
          let next: number;
          if (Math.abs(diff) < 0.008) {
            next = target;
            if (target === 0) {
              this._currentEmotionParams.delete(id);
              continue;
            }
          } else {
            const t = 0.15;
            const c1 = 1.70158;
            const c3 = c1 + 1;
            const easedT = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
            next = current + diff * easedT * 0.12;
          }
          this._currentEmotionParams.set(id, next);

          const resolved = this.resolveParamId(id);
          if (this._allParamIds.size > 0 && !this._allParamIds.has(resolved)) continue;
          try { coreModel.addParameterValueById?.(resolved, next); } catch { /* ignore */ }
        }
        this._emotionParamsActive = this._currentEmotionParams.size > 0;
      }

      if (this._overrideActive && this._overrideParams.size > 0 && !this._emotionMotionPlaying) {
        for (const [id, targetValue] of this._overrideParams) {
          const resolved = this.resolveParamId(id);
          if (this._allParamIds.size > 0 && !this._allParamIds.has(resolved)) continue;
          if (this._targetEmotionParams.has(id) || this._currentEmotionParams.has(id)) continue;

          const isAngleParam = id.includes('Angle') || id.includes('BodyAngle');
          const isEyeBall = id.includes('EyeBall');
          const isBreath = id.includes('Breath');
          const isBlinkParam = id.includes('EyeLOpen') || id.includes('EyeROpen');
          const lerpSpeed = isAngleParam ? 0.12 : isEyeBall ? 0.18 : isBreath ? 0.1 : isBlinkParam ? 0.4 : 0.15;

          const currentVal = this._currentOverrideParams.get(id) ?? 0;
          const diff = targetValue - currentVal;
          let smoothVal: number;
          if (Math.abs(diff) < 0.005) {
            smoothVal = targetValue;
          } else {
            smoothVal = currentVal + diff * lerpSpeed;
          }
          this._currentOverrideParams.set(id, smoothVal);
          try { coreModel.setParameterValueById?.(resolved, smoothVal); } catch { /* ignore */ }
        }

        const staleKeys = Array.from(this._currentOverrideParams.keys()).filter(k => !this._overrideParams.has(k));
        for (const k of staleKeys) {
          const currentVal = this._currentOverrideParams.get(k)!;
          if (Math.abs(currentVal) < 0.01) {
            this._currentOverrideParams.delete(k);
          } else {
            const decayed = currentVal * 0.85;
            this._currentOverrideParams.set(k, decayed);
            const resolved = this.resolveParamId(k);
            if (this._allParamIds.size > 0 && !this._allParamIds.has(resolved)) continue;
            try { coreModel.setParameterValueById?.(resolved, decayed); } catch { /* ignore */ }
          }
        }
      }

      // ===== 口型层：最高优先级，覆盖情绪对嘴巴的参数 =====
      if (this._lipCache.openY > 0.01 || Math.abs(this._lipCache.form) > 0.01) {
        const mouthOpenResolved = this.resolveParamId('ParamMouthOpenY');
        const mouthFormResolved = this.resolveParamId('ParamMouthForm');
        if (this._allParamIds.size === 0 || this._allParamIds.has(mouthOpenResolved)) {
          try { coreModel.setParameterValueById?.(mouthOpenResolved, this._lipCache.openY); } catch { /* ignore */ }
        }
        if (this._allParamIds.size === 0 || this._allParamIds.has(mouthFormResolved)) {
          try { coreModel.setParameterValueById?.(mouthFormResolved, this._lipCache.form); } catch { /* ignore */ }
        }
      } else {
        const mouthOpenResolved = this.resolveParamId('ParamMouthOpenY');
        if (this._allParamIds.size === 0 || this._allParamIds.has(mouthOpenResolved)) {
          try { coreModel.setParameterValueById?.(mouthOpenResolved, 0); } catch { /* ignore */ }
        }
      }

      this._microActionTime = now;

      this._breathPhase += dt * this._breathSpeed;
      const breathVal = 0.15 + Math.sin(this._breathPhase * Math.PI * 2) * 0.12
        + Math.sin(this._breathPhase * Math.PI * 2 * 0.37) * 0.03;
      if (!this._overrideParams.has('ParamBreath') && !this._targetEmotionParams.has('ParamBreath')) {
        const resolved = this.resolveParamId('ParamBreath');
        if (this._allParamIds.size === 0 || this._allParamIds.has(resolved)) {
          try { coreModel.addParameterValueById?.(resolved, breathVal); } catch { /* ignore */ }
        }
      }

      // ===== 基础层：始终活跃的微行为 =====
      // 说话时减小幅度但不全停，人说话时也有眼球移动/头部微动/呼吸
      const isSpeaking = this._overrideActive || this._emotionMotionPlaying || this._speechBeat.active;

      // ===== 句间眨眼：说话结束后强制眨眼，说话时抑制随机眨眼 =====
      const shouldBlink = now - this._lastBlinkTime > this._nextBlinkInterval;
      const justFinishedSpeech = !this._speechBeat.active && this._speechBeat.duration > 0 && (now - this._speechBeat.startTime - this._speechBeat.duration < 300);
      if ((shouldBlink && !isSpeaking) || justFinishedSpeech) {
        this._lastBlinkTime = now;
        this._nextBlinkInterval = justFinishedSpeech ? 2000 : 2500 + Math.random() * 5000;
        if (!this._customAnim?.playing) {
          this.playPresetAnim('doubleBlink');
        }
      }
      const idleScale = isSpeaking ? 0.25 : 1.0;

      // ===== 眼球漂移（基础层，始终活跃）=====
      if (now > this._eyeBallDrift.nextChangeTime) {
        this._eyeBallDrift.targetX = (Math.random() - 0.5) * 1.2;
        this._eyeBallDrift.targetY = (Math.random() - 0.5) * 0.6;
        this._eyeBallDrift.nextChangeTime = now + 2000 + Math.random() * 4000;
      }
      this._eyeBallDrift.x += (this._eyeBallDrift.targetX - this._eyeBallDrift.x) * 0.02;
      this._eyeBallDrift.y += (this._eyeBallDrift.targetY - this._eyeBallDrift.y) * 0.02;
      {
        const eyeXResolved = this.resolveParamId('ParamEyeBallX');
        const eyeYResolved = this.resolveParamId('ParamEyeBallY');
        if (this._allParamIds.size === 0 || this._allParamIds.has(eyeXResolved)) {
          try { coreModel.addParameterValueById?.(eyeXResolved, this._eyeBallDrift.x * 0.3 * idleScale); } catch { /* ignore */ }
        }
        if (this._allParamIds.size === 0 || this._allParamIds.has(eyeYResolved)) {
          try { coreModel.addParameterValueById?.(eyeYResolved, this._eyeBallDrift.y * 0.3 * idleScale); } catch { /* ignore */ }
        }
      }

      // ===== 头部微漂移（基础层，始终活跃）=====
      if (now > this._microHeadDrift.nextChangeTime) {
        this._microHeadDrift.targetX = (Math.random() - 0.5) * 6;
        this._microHeadDrift.targetY = (Math.random() - 0.5) * 4;
        this._microHeadDrift.nextChangeTime = now + 3000 + Math.random() * 5000;
      }
      this._microHeadDrift.x += (this._microHeadDrift.targetX - this._microHeadDrift.x) * 0.015;
      this._microHeadDrift.y += (this._microHeadDrift.targetY - this._microHeadDrift.y) * 0.015;
      {
        const angleXResolved = this.resolveParamId('ParamAngleX');
        const angleYResolved = this.resolveParamId('ParamAngleY');
        if (this._allParamIds.size === 0 || this._allParamIds.has(angleXResolved)) {
          try { coreModel.addParameterValueById?.(angleXResolved, this._microHeadDrift.x * 0.3 * idleScale); } catch { /* ignore */ }
        }
        if (this._allParamIds.size === 0 || this._allParamIds.has(angleYResolved)) {
          try { coreModel.addParameterValueById?.(angleYResolved, this._microHeadDrift.y * 0.3 * idleScale); } catch { /* ignore */ }
        }
      }

      // ===== 身体微摆（基础层，始终活跃）=====
      this._bodySwayPhase += dt * this._bodySwaySpeed;
      {
        const bodySway = (Math.sin(this._bodySwayPhase * Math.PI * 2) * 0.8
          + Math.sin(this._bodySwayPhase * Math.PI * 2 * 0.37) * 0.3) * idleScale;
        const bodyXResolved = this.resolveParamId('ParamBodyAngleX');
        if (this._allParamIds.size === 0 || this._allParamIds.has(bodyXResolved)) {
          try { coreModel.addParameterValueById?.(bodyXResolved, bodySway); } catch { /* ignore */ }
        }
      }

      // ===== 语音节奏层：说话时头部随重音摆动 =====
      if (this._speechBeat.active) {
        const speechElapsed = now - this._speechBeat.startTime;
        const speechProgress = Math.min(speechElapsed / this._speechBeat.duration, 1);

        const beat = Math.sin(speechElapsed * 0.008) * 0.5 + 0.5;
        const phraseGesture =
          speechProgress < 0.1 ? -2 * (1 - speechProgress * 10)
          : speechProgress > 0.9 ? -1 * (speechProgress - 0.9) * 10
          : Math.sin(beat * Math.PI * 4) * 1.5 * this._speechBeat.intensity;

        const angleYResolved = this.resolveParamId('ParamAngleY');
        if (this._allParamIds.size === 0 || this._allParamIds.has(angleYResolved)) {
          try { coreModel.addParameterValueById?.(angleYResolved, phraseGesture); } catch { /* ignore */ }
        }

        const browBounce = Math.sin(speechElapsed * 0.012) * 0.15 * this._speechBeat.intensity;
        const browLResolved = this.resolveParamId('ParamBrowLY');
        const browRResolved = this.resolveParamId('ParamBrowRY');
        if (this._allParamIds.size === 0 || this._allParamIds.has(browLResolved)) {
          try { coreModel.addParameterValueById?.(browLResolved, browBounce); } catch { /* ignore */ }
        }
        if (this._allParamIds.size === 0 || this._allParamIds.has(browRResolved)) {
          try { coreModel.addParameterValueById?.(browRResolved, browBounce); } catch { /* ignore */ }
        }
      }

      // ===== 随机小动作（空闲时触发，说话时也有概率触发微点头）=====
      if (!isSpeaking && !this._customAnim?.playing && now - this._lastIdleActionTime > this._nextIdleActionTime) {
        this._lastIdleActionTime = now;
        this._nextIdleActionTime = 4000 + Math.random() * 8000;
        const idleAnims: PresetAnimName[] = ['nod', 'tiltHead', 'lookAround', 'stretch', 'lookUp', 'sigh', 'think', 'deepBreath', 'headTiltSlow', 'lookDown', 'sideEye', 'noseScratch', 'shoulderShrug', 'headRub', 'lipBite', 'earWiggle', 'doubleBlink', 'yawn'];
        const pick = idleAnims[Math.floor(Math.random() * idleAnims.length)];
        this.playPresetAnim(pick);
        logger.log(`[Live2D] 🌿 空闲小动作: ${pick}`);
      }

      // ===== 说话时微动作（2% 概率每帧触发微点头，模拟强调语气）=====
      if (isSpeaking && !this._customAnim?.playing && Math.random() < 0.02) {
        this.playPresetAnim('nod');
      }

      if (this._customAnim?.playing) {
        const elapsed = now - this._customAnim.startTime;
        const progress = Math.min(elapsed / this._customAnim.duration, 1);

          if (progress >= 1) {
          this._customAnim.playing = false;
          const lastKf = this._customAnim.keyframes[this._customAnim.keyframes.length - 1];
          if (lastKf) {
            for (const id of Object.keys(lastKf.params)) {
              this._overrideParams.delete(id);
            }
          }
          const cb = this._customAnim.onComplete;
          this._customAnim = null;
          cb?.();
        } else {
          const keyframes = this._customAnim.keyframes;
          let kfA = keyframes[0];
          let kfB = keyframes[keyframes.length - 1];
          for (let i = 0; i < keyframes.length - 1; i++) {
            if (elapsed >= keyframes[i].time && elapsed < keyframes[i + 1].time) {
              kfA = keyframes[i];
              kfB = keyframes[i + 1];
              break;
            }
          }
          const segDuration = kfB.time - kfA.time;
          const segProgress = segDuration > 0 ? (elapsed - kfA.time) / segDuration : 1;
          const easedT = applyEasing(Math.min(Math.max(segProgress, 0), 1), kfB.easing);

          for (const paramId of Object.keys(kfA.params)) {
            const valA = kfA.params[paramId] ?? 0;
            const valB = kfB.params[paramId] ?? 0;
            const interpolated = valA + (valB - valA) * easedT;
            const resolved = this.resolveParamId(paramId);
            if (this._allParamIds.size > 0 && !this._allParamIds.has(resolved)) continue;
            try { coreModel.setParameterValueById?.(resolved, interpolated); } catch { /* ignore */ }
          }
        }
      }
    };
    if (this.app?.ticker) {
      this.app.ticker.add(this._tickerCallback);
      logger.log('[Live2D] ✅ Override Ticker 已启动（含参数平滑过渡 + 微动作）');
    } else {
      logger.warn('[Live2D] ⚠️ app.ticker 不可用');
    }
  }

  private _stopOverrideTicker(): void {
    if (this._tickerCallback && this.app?.ticker) {
      this.app.ticker.remove(this._tickerCallback);
    }
    this._tickerCallback = null;
  }

  private _emotionMotionPlaying = false;
  private _emotionMotionTimer: ReturnType<typeof setTimeout> | null = null;
  private _lastDriveTime = 0;
  private _driveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _targetEmotionParams: Map<string, number> = new Map();
  private _currentEmotionParams: Map<string, number> = new Map();
  private _emotionTransitionSpeed = 0.08;

  setOverrideParam(id: string, value: number): void {
    this._overrideParams.set(id, value);
    this._overrideActive = true;
  }

  clearOverrideParams(): void {
    this._overrideActive = false;
    this._overrideParams.clear();
  }

  playMotion(group = "Idle", index = 0): void {
    const displayModel = this.model as unknown as MutableModel | null;
    if (!displayModel) return;
    if (typeof displayModel.motion !== 'function') {
      logger.warn('[Live2D] ⚠️ 模型不支持 motion 方法');
      return;
    }
    try {
      const result = displayModel.motion(group, index, 3);
      logger.log(`[Live2D] 🎬 播放动作: ${group}[${index}] (priority=FORCE)`, result);
      if (result && typeof result.catch === 'function') {
        result.catch((err: unknown) => {
          logger.warn(`[Live2D] ⚠️ 动作播放异步失败: ${group}[${index}]`, err);
        });
      }
    } catch (err) {
      logger.warn(`[Live2D] 动作播放失败: ${group}[${index}]`, err);
    }
  }

  playPresetAnim(name: PresetAnimName, onComplete?: () => void): boolean {
    const preset = PRESET_ANIMS[name];
    if (!preset) {
      logger.warn(`[Live2D] 🎬 未知预设动画: ${name}`);
      return false;
    }
    return this.playCustomAnim(preset.keyframes, preset.duration, onComplete);
  }

  playCustomAnim(keyframes: CustomAnimKeyframe[], duration: number, onComplete?: () => void): boolean {
    if (!keyframes || keyframes.length < 2) {
      logger.warn('[Live2D] 🎬 自定义动画至少需要2个关键帧');
      return false;
    }
    if (!this.model) {
      logger.warn('[Live2D] 🎬 模型未加载，无法播放自定义动画');
      return false;
    }

    if (this._customAnim?.playing) {
      this._customAnim.playing = false;
      const lastKf = this._customAnim.keyframes[this._customAnim.keyframes.length - 1];
      if (lastKf) {
        for (const id of Object.keys(lastKf.params)) {
          this._overrideParams.delete(id);
        }
      }
    }

    const maxTime = Math.max(...keyframes.map(kf => kf.time));
    const scale = maxTime > 0 ? duration / maxTime : 1;
    const scaledKeyframes = keyframes.map(kf => ({
      ...kf,
      time: kf.time * scale,
    }));

    const animParamIds = new Set<string>();
    for (const kf of scaledKeyframes) {
      for (const id of Object.keys(kf.params)) {
        animParamIds.add(id);
      }
    }

    this._customAnim = {
      playing: true,
      startTime: Date.now(),
      duration,
      keyframes: scaledKeyframes,
      onComplete,
    };

    logger.log(`[Live2D] 🎬 播放自定义动画: ${animParamIds.size}个参数, ${duration}ms, ${scaledKeyframes.length}个关键帧`);
    return true;
  }

  stopCustomAnim(): void {
    if (this._customAnim?.playing) {
      this._customAnim.playing = false;
      const lastKf = this._customAnim.keyframes[this._customAnim.keyframes.length - 1];
      if (lastKf) {
        for (const id of Object.keys(lastKf.params)) {
          this._overrideParams.delete(id);
        }
      }
      this._customAnim = null;
      logger.log('[Live2D] 🎬 自定义动画已停止');
    }
  }

  getAvailablePresetAnims(): PresetAnimName[] {
    return Object.keys(PRESET_ANIMS) as PresetAnimName[];
  }

  private emotionParams: Record<string, {
    motionGroup?: string; motionIndex?: number;
    expression?: string;
    params: Record<string, number>;
  }> = {
    neutral: {
      motionGroup: 'Idle', motionIndex: 0,
      params: {},
    },
    listening: {
      motionGroup: 'Idle', motionIndex: 0,
      params: {
        PARAM_BROW_L_Y: 0.3, PARAM_BROW_R_Y: 0.3,
        PARAM_MOUTH_FORM: 0.2,
        ParamBrowLY: 0.3, ParamBrowRY: 0.3,
      },
    },
    speaking: {
      motionGroup: 'Tap', motionIndex: 0,
      params: {
        PARAM_MOUTH_FORM: 0.5,
        ParamMouthForm: 0.5,
      },
    },
    thinking: {
      motionGroup: 'Idle', motionIndex: 0,
      params: {
        PARAM_BROW_L_Y: 0.2, PARAM_BROW_R_Y: -0.1,
        PARAM_BROW_L_ANGLE: 0.3, PARAM_BROW_R_ANGLE: -0.2,
        ParamBrowLY: 0.2, ParamBrowRY: -0.1,
      },
    },
    happy: {
      motionGroup: 'Tap', motionIndex: 0,
      expression: 'happy',
      params: {
        PARAM_BROW_L_Y: 0.6, PARAM_BROW_R_Y: 0.6,
        PARAM_BROW_L_ANGLE: 0.4, PARAM_BROW_R_ANGLE: 0.4,
        PARAM_MOUTH_FORM: 1,
        PARAM_TERE: 0.8,
        ParamBrowLY: 0.6, ParamBrowRY: 0.6,
        ParamMouthForm: 1,
        ParamCheek: 0.8, ParamEyeLSmile: 0.8, ParamEyeRSmile: 0.8,
      },
    },
    sad: {
      motionGroup: 'Idle', motionIndex: 0,
      expression: 'sad',
      params: {
        PARAM_BROW_L_Y: -0.6, PARAM_BROW_R_Y: -0.6,
        PARAM_BROW_L_ANGLE: 0.62, PARAM_BROW_R_ANGLE: 0.68,
        PARAM_BROW_L_FORM: -1, PARAM_BROW_R_FORM: -1,
        PARAM_MOUTH_FORM: -0.85,
        ParamBrowLY: -0.6, ParamBrowRY: -0.6,
        ParamMouthForm: -0.8,
      },
    },
    angry: {
      motionGroup: 'Flick3', motionIndex: 0,
      expression: 'angry',
      params: {
        PARAM_BROW_L_Y: -0.8, PARAM_BROW_R_Y: -0.8,
        PARAM_BROW_L_ANGLE: -1, PARAM_BROW_R_ANGLE: -1,
        PARAM_BROW_L_FORM: -1, PARAM_BROW_R_FORM: -1,
        PARAM_MOUTH_FORM: -0.5,
        ParamBrowLY: -0.8, ParamBrowRY: -0.8,
        ParamMouthForm: -0.5,
      },
    },
    surprised: {
      motionGroup: 'FlickUp', motionIndex: 0,
      expression: 'surprised',
      params: {
        PARAM_BROW_L_Y: 0.39, PARAM_BROW_R_Y: 0.33,
        PARAM_BROW_L_ANGLE: 0.19, PARAM_BROW_R_ANGLE: 0.19,
        PARAM_BROW_L_FORM: 1, PARAM_BROW_R_FORM: 1,
        PARAM_MOUTH_FORM: -0.69,
        ParamBrowLY: 1, ParamBrowRY: 1,
        ParamMouthForm: 0.3,
      },
    },
    fearful: {
      motionGroup: 'FlickUp', motionIndex: 0,
      expression: 'surprised',
      params: {
        PARAM_BROW_L_Y: 0.8, PARAM_BROW_R_Y: 0.8,
        PARAM_BROW_L_ANGLE: 0.5, PARAM_BROW_R_ANGLE: 0.5,
        PARAM_MOUTH_FORM: -0.3,
        ParamBrowLY: 0.8, ParamBrowRY: 0.8,
      },
    },
    disgusted: {
      motionGroup: 'Flick3', motionIndex: 0,
      expression: 'angry',
      params: {
        PARAM_BROW_L_Y: -0.3, PARAM_BROW_R_Y: -0.3,
        PARAM_BROW_L_ANGLE: -0.5, PARAM_BROW_R_ANGLE: -0.5,
        PARAM_BROW_L_FORM: -1, PARAM_BROW_R_FORM: -1,
        PARAM_MOUTH_FORM: -0.8,
        ParamBrowLY: -0.3, ParamBrowRY: -0.3,
      },
    },
    shy: {
      motionGroup: 'Idle', motionIndex: 0,
      expression: 'shy',
      params: {
        PARAM_BROW_L_Y: -0.25, PARAM_BROW_R_Y: -0.25,
        PARAM_BROW_L_ANGLE: 0.54, PARAM_BROW_R_ANGLE: 0.59,
        PARAM_BROW_L_FORM: -0.42, PARAM_BROW_R_FORM: -0.45,
        PARAM_MOUTH_FORM: -0.21,
        PARAM_TERE: 1,
        ParamBrowLY: 0.3, ParamBrowRY: 0.3,
        ParamCheek: 1,
      },
    },
    warm: {
      motionGroup: 'Tap', motionIndex: 0,
      expression: 'happy',
      params: {
        PARAM_BROW_L_Y: 0.4, PARAM_BROW_R_Y: 0.4,
        PARAM_BROW_L_ANGLE: 0.3, PARAM_BROW_R_ANGLE: 0.3,
        PARAM_MOUTH_FORM: 0.7,
        PARAM_TERE: 0.5,
        ParamBrowLY: 0.4, ParamBrowRY: 0.4,
        ParamMouthForm: 0.7, ParamCheek: 0.5,
        ParamEyeLSmile: 0.5, ParamEyeRSmile: 0.5,
      },
    },
    tsundere: {
      motionGroup: 'Flick3', motionIndex: 0,
      expression: 'angry',
      params: {
        PARAM_BROW_L_Y: -0.5, PARAM_BROW_R_Y: -0.5,
        PARAM_BROW_L_ANGLE: -0.6, PARAM_BROW_R_ANGLE: -0.6,
        PARAM_BROW_L_FORM: -1, PARAM_BROW_R_FORM: -1,
        PARAM_MOUTH_FORM: -0.3,
        PARAM_TERE: 0.6,
        ParamBrowLY: -0.5, ParamBrowRY: -0.5,
        ParamCheek: 0.6,
      },
    },
    concerned: {
      motionGroup: 'Idle', motionIndex: 0,
      expression: 'sad',
      params: {
        PARAM_BROW_L_Y: -0.4, PARAM_BROW_R_Y: -0.4,
        PARAM_BROW_L_ANGLE: 0.5, PARAM_BROW_R_ANGLE: 0.55,
        PARAM_MOUTH_FORM: -0.3,
        ParamBrowLY: -0.4, ParamBrowRY: -0.4,
        ParamMouthForm: -0.3, ParamCheek: 0.2,
      },
    },
    sleepy: {
      motionGroup: 'Idle', motionIndex: 0,
      expression: 'sad',
      params: {
        PARAM_BROW_L_Y: -0.2, PARAM_BROW_R_Y: -0.2,
        PARAM_BROW_L_ANGLE: 0.2, PARAM_BROW_R_ANGLE: 0.2,
        PARAM_MOUTH_FORM: 0,
        ParamBrowLY: -0.2, ParamBrowRY: -0.2,
      },
    },
    thinking: {
      motionGroup: 'Idle', motionIndex: 0,
      expression: null,
      params: {
        PARAM_BROW_L_Y: 0.3, PARAM_BROW_R_Y: 0.3,
        PARAM_BROW_L_ANGLE: 0.4, PARAM_BROW_R_ANGLE: 0.3,
        PARAM_MOUTH_FORM: -0.1,
        ParamBrowLY: 0.3, ParamBrowRY: 0.3,
        ParamMouthForm: -0.1,
      },
    },
    excited: {
      motionGroup: 'Tap', motionIndex: 0,
      expression: 'happy',
      params: {
        PARAM_BROW_L_Y: 0.8, PARAM_BROW_R_Y: 0.8,
        PARAM_BROW_L_ANGLE: 0.5, PARAM_BROW_R_ANGLE: 0.5,
        PARAM_MOUTH_FORM: 1,
        ParamBrowLY: 0.8, ParamBrowRY: 0.8,
        ParamMouthForm: 1, ParamCheek: 0.6,
        ParamEyeLSmile: 0.7, ParamEyeRSmile: 0.7,
      },
    },
    confused: {
      motionGroup: 'Idle', motionIndex: 0,
      expression: null,
      params: {
        PARAM_BROW_L_Y: 0.5, PARAM_BROW_R_Y: -0.3,
        PARAM_BROW_L_ANGLE: 0.3, PARAM_BROW_R_ANGLE: -0.4,
        PARAM_MOUTH_FORM: -0.2,
        ParamBrowLY: 0.5, ParamBrowRY: -0.3,
        ParamMouthForm: -0.2,
      },
    },
    bored: {
      motionGroup: 'Idle', motionIndex: 0,
      expression: null,
      params: {
        PARAM_BROW_L_Y: -0.15, PARAM_BROW_R_Y: -0.15,
        PARAM_MOUTH_FORM: -0.3,
        ParamBrowLY: -0.15, ParamBrowRY: -0.15,
        ParamMouthForm: -0.3,
      },
    },
    relieved: {
      motionGroup: 'Idle', motionIndex: 0,
      expression: 'happy',
      params: {
        PARAM_BROW_L_Y: 0.2, PARAM_BROW_R_Y: 0.2,
        PARAM_MOUTH_FORM: 0.4,
        ParamBrowLY: 0.2, ParamBrowRY: 0.2,
        ParamMouthForm: 0.4, ParamCheek: 0.3,
        ParamEyeLSmile: 0.4, ParamEyeRSmile: 0.4,
      },
    },
    frustrated: {
      motionGroup: 'Flick3', motionIndex: 0,
      expression: 'angry',
      params: {
        PARAM_BROW_L_Y: -0.6, PARAM_BROW_R_Y: -0.6,
        PARAM_BROW_L_ANGLE: -0.7, PARAM_BROW_R_ANGLE: -0.7,
        PARAM_MOUTH_FORM: -0.6,
        ParamBrowLY: -0.6, ParamBrowRY: -0.6,
        ParamMouthForm: -0.6,
      },
    },
    nostalgic: {
      motionGroup: 'Idle', motionIndex: 0,
      expression: 'happy',
      params: {
        PARAM_BROW_L_Y: 0.15, PARAM_BROW_R_Y: 0.15,
        PARAM_BROW_L_ANGLE: 0.3, PARAM_BROW_R_ANGLE: 0.3,
        PARAM_MOUTH_FORM: 0.3,
        ParamBrowLY: 0.15, ParamBrowRY: 0.15,
        ParamMouthForm: 0.3, ParamCheek: 0.3,
        ParamEyeLSmile: 0.3, ParamEyeRSmile: 0.3,
      },
    },
    curious: {
      motionGroup: 'Tap', motionIndex: 0,
      expression: null,
      params: {
        PARAM_BROW_L_Y: 0.5, PARAM_BROW_R_Y: 0.5,
        PARAM_BROW_L_ANGLE: 0.3, PARAM_BROW_R_ANGLE: 0.3,
        PARAM_MOUTH_FORM: 0.2,
        ParamBrowLY: 0.5, ParamBrowRY: 0.5,
        ParamMouthForm: 0.2,
      },
    },
    apologetic: {
      motionGroup: 'Idle', motionIndex: 0,
      expression: 'sad',
      params: {
        PARAM_BROW_L_Y: -0.4, PARAM_BROW_R_Y: -0.4,
        PARAM_BROW_L_ANGLE: 0.6, PARAM_BROW_R_ANGLE: 0.6,
        PARAM_MOUTH_FORM: -0.4,
        PARAM_TERE: 0.3,
        ParamBrowLY: -0.4, ParamBrowRY: -0.4,
        ParamMouthForm: -0.4, ParamCheek: 0.4,
      },
    },
    proud: {
      motionGroup: 'Tap', motionIndex: 0,
      expression: 'happy',
      params: {
        PARAM_BROW_L_Y: 0.5, PARAM_BROW_R_Y: 0.5,
        PARAM_MOUTH_FORM: 0.6,
        ParamBrowLY: 0.5, ParamBrowRY: 0.5,
        ParamMouthForm: 0.6, ParamCheek: 0.4,
        ParamEyeLSmile: 0.4, ParamEyeRSmile: 0.4,
      },
    },
  };

  private motionGroupMap: Record<string, string[]> = {
    Idle: ['Idle'],
    Tap: ['Tap'],
    Flick: ['Flick'],
    FlickUp: ['FlickUp'],
    Flick3: ['Flick3'],
  };

  private _emotionConfigs: Record<string, {
    motionGroup: string;
    expressionOverride: string | null;
    paramAdditions: Record<string, number>;
  }> = {};

  private _lastMotionTime = 0;
  private _lastMotionGroup = '';
  private _lastEmotion = 'neutral';

  driveEmotion(emotion = "neutral"): void {
    const config = this._emotionConfigs[emotion];
    if (!config) {
      logger.warn(`[Live2D] 🎭 未知情绪: ${emotion}，跳过`);
      return;
    }

    const now = Date.now();
    const prevEmotion = this._lastEmotion;

    const isSameEmotion = emotion === prevEmotion && emotion !== 'neutral';
    const isDebounced = isSameEmotion && (now - this._lastDriveTime) < 5000;

    this._lastDriveTime = now;
    this._lastEmotion = emotion;
    logger.log(`[Live2D] 🎭 driveEmotion: ${emotion} (上次: ${prevEmotion}, 防抖: ${isDebounced})`);

    if (!isDebounced) {
      if (this._availableMotionGroups.size > 0) {
        const motionGroup = config.motionGroup || 'Idle';
        let groupToPlay = motionGroup;
        if (!this._availableMotionGroups.has(groupToPlay)) {
          const available = Array.from(this._availableMotionGroups);
          groupToPlay = available.includes('Tap') ? 'Tap'
            : available.includes('Flick') ? 'Flick'
            : available.includes('Idle') ? 'Idle'
            : available[0];
          logger.log(`[Live2D] 🔄 动作回退: ${motionGroup} → ${groupToPlay}`);
        }

        const motionCount = this._getMotionCount(groupToPlay);
        const motionIndex = motionCount > 1 ? Math.floor(Math.random() * motionCount) : 0;

        this.playMotion(groupToPlay, motionIndex);
        this._lastMotionTime = now;
        this._lastMotionGroup = groupToPlay;

        this._emotionMotionPlaying = true;
        if (this._emotionMotionTimer) clearTimeout(this._emotionMotionTimer);
        this._emotionMotionTimer = setTimeout(() => {
          this._emotionMotionPlaying = false;
        }, 1500);
      }

      const emotionToPresetAnim: Partial<Record<string, PresetAnimName>> = {
        happy: 'giggle',
        sad: 'lookDown',
        angry: 'shake',
        surprised: 'surprise',
        fearful: 'shake',
        disgusted: 'sideEye',
        shy: 'embarassed',
        excited: 'bounce',
        thinking: 'think',
        warm: 'headTiltSlow',
        tsundere: 'pout',
        concerned: 'lookUp',
        sleepy: 'yawn',
        neutral: 'deepBreath',
        confused: 'headRub',
        bored: 'sigh',
        relieved: 'deepBreath',
        frustrated: 'shoulderShrug',
        nostalgic: 'headTiltSlow',
        curious: 'lookAround',
        apologetic: 'bow',
        proud: 'nod',
      };

      const presetAnim = emotionToPresetAnim[emotion];
      if (presetAnim) {
        setTimeout(() => this.playPresetAnim(presetAnim), 200);
      }
    }

    if (this._hasExpressions && config.expressionOverride) {
      this.setExpression(config.expressionOverride);
    } else if (this._hasExpressions && emotion === 'neutral') {
      this.setExpression(this.expressionNameMap.neutral || 'Normal');
    }

    this._targetEmotionParams.clear();
    const params = config.paramAdditions;
    if (params && Object.keys(params).length > 0) {
      for (const [id, value] of Object.entries(params)) {
        const resolved = this.resolveParamId(id);
        if (this._allParamIds.size > 0 && !this._allParamIds.has(resolved)) continue;
        this._targetEmotionParams.set(resolved, value);
      }
      this._emotionParamsActive = true;
      logger.log(`[Live2D] 🎭 参数目标: ${emotion} (${this._targetEmotionParams.size}个参数)`);
    } else {
      this._emotionParamsActive = false;
    }

    if (this.expressionResetTimer) window.clearTimeout(this.expressionResetTimer);
    if (emotion !== 'neutral') {
      this.expressionResetTimer = window.setTimeout(() => {
        this._resetEmotion();
      }, 15000);
    }
  }

  private _resetEmotion(): void {
    if (this._hasExpressions) {
      this.setExpression(this.expressionNameMap.neutral || 'Normal');
    }
    this._targetEmotionParams.clear();
    this._emotionParamsActive = false;
    this._lastEmotion = 'neutral';
    logger.log('[Live2D] 🎭 情绪已重置（参数将平滑归零）');
  }

  private _getMotionCount(group: string): number {
    const displayModel = this.model as unknown as MutableModel & {
      internalModel?: {
        settings?: { motions?: Record<string, unknown[]> };
      };
    } | null;
    if (!displayModel?.internalModel?.settings?.motions) return 1;
    const groupMotions = displayModel.internalModel.settings.motions[group];
    return Array.isArray(groupMotions) ? groupMotions.length : 1;
  }

  private expressionNameMap: Record<string, string> = {
    happy: 'Normal',
    sad: 'Sad',
    angry: 'Angry',
    surprised: 'Surprised',
    fearful: 'Surprised',
    disgusted: 'Angry',
    shy: 'Blushing',
    warm: 'Normal',
    tsundere: 'Angry',
    neutral: 'Normal',
    concerned: 'Sad',
    sleepy: 'Sad',
    excited: 'Normal',
    confused: 'Normal',
    bored: 'Sad',
    relieved: 'Normal',
    frustrated: 'Angry',
    nostalgic: 'Normal',
    curious: 'Surprised',
    apologetic: 'Sad',
    proud: 'Normal',
    embarrassed: 'Blushing',
  };

  private _currentExpression = '';

  setExpression(expression = "neutral"): void {
    const displayModel = this.model as unknown as MutableModel | null;
    if (!displayModel) return;
    try {
      const exprList = (displayModel as unknown as { internalModel?: { settings?: { expressions?: Array<{ name?: string; Name?: string }> } } }).internalModel?.settings?.expressions;
      if (!Array.isArray(exprList) || exprList.length === 0) {
        return;
      }
      const availableNames: string[] = exprList.map((e) => e.name || e.Name || '');
      const mappedName = this.expressionNameMap[expression] || expression;
      const nameToUse = availableNames.includes(mappedName) ? mappedName
        : availableNames.includes(expression) ? expression
        : availableNames.find(n => n.toLowerCase() === expression.toLowerCase()) || null;
      if (nameToUse) {
        if (this._currentExpression === nameToUse) {
          logger.log(`[Live2D] 😊 表情未变: ${nameToUse}，跳过`);
          return;
        }
        this._currentExpression = nameToUse;
        displayModel.expression?.(nameToUse);
        logger.log(`[Live2D] 😊 设置表情: ${nameToUse} (映射: ${expression})`);
      } else {
        logger.warn(`[Live2D] ⚠️ 找不到表情: ${expression}，可用: ${availableNames.join(', ')}`);
      }
    } catch (err) {
      logger.warn(`[Live2D] 表情设置失败: ${expression}`, err);
    }
  }

  setMouthOpen(value: number): void {
    this._lipCache.openY = Math.max(0, Math.min(1, value));
  }

  setLipForm(value: number): void {
    this._lipCache.form = Math.max(-1, Math.min(1, value));
  }

  startSpeechGesture(durationMs: number, intensity = 0.6): void {
    this._speechBeat = { active: true, startTime: Date.now(), duration: durationMs, intensity };
  }

  endSpeechGesture(): void {
    this._speechBeat.active = false;
  }

  setPose(pose: { yaw?: number; pitch?: number; roll?: number }): void {
    this.setParam("ParamAngleX", pose.yaw ?? 0);
    this.setParam("ParamAngleY", pose.pitch ?? 0);
    this.setParam("ParamAngleZ", pose.roll ?? 0);
    this.setParam("ParamBodyAngleX", (pose.yaw ?? 0) * 0.35);
  }

  previewSpeech(visemes: Array<{ time: number; value: number }>, audio?: HTMLAudioElement | null): void {
    if (this.lipSyncTimer) { window.clearInterval(this.lipSyncTimer); this.lipSyncTimer = null; }
    if (!visemes.length) { this.setMouthOpen(0); return; }
    const startedAt = performance.now();
    this.lipSyncTimer = window.setInterval(() => {
      const elapsed = audio && !audio.paused ? audio.currentTime : (performance.now() - startedAt) / 1000;
      const current = visemes.findLast((frame) => elapsed >= frame.time) ?? visemes[0];
      this.setMouthOpen(current?.value ?? 0);
      const lastFrame = visemes[visemes.length - 1];
      if ((audio && audio.ended) || elapsed > lastFrame.time + 0.24) {
        if (this.lipSyncTimer) { window.clearInterval(this.lipSyncTimer); this.lipSyncTimer = null; }
        this.setMouthOpen(0);
      }
    }, 33);
  }

  speak(payload: {
    visemes: Array<{ time: number; value: number }>;
    expression?: string;
    motionGroup?: string;
    pose?: { yaw?: number; pitch?: number; roll?: number };
    audio?: HTMLAudioElement | null;
  }): void {
    this.setPose(payload.pose ?? {});
    this.playMotion(payload.motionGroup ?? "Idle", 0);
    if (payload.expression) {
      this.setExpression(payload.expression);
      if (this.expressionResetTimer) window.clearTimeout(this.expressionResetTimer);
      this.expressionResetTimer = window.setTimeout(() => this.setExpression(this.expressionNameMap.neutral || 'Normal'), 2200);
    }
    this.previewSpeech(payload.visemes, payload.audio);
  }

  startIdleMotion(intervalMs = 10000): void {
    this.stopIdleMotion();
    this.idleMotionTimer = setInterval(() => {
      if (!this.model) return;
      this.playMotion('Idle', 0);
    }, intervalMs);
  }

  stopIdleMotion(): void {
    if (this.idleMotionTimer) { clearInterval(this.idleMotionTimer); this.idleMotionTimer = null; }
  }

  getModel(): InstanceType<Live2DModelConstructor> | null { return this.model; }
  
  applyLive2DParams(params: Live2DExpressionParams): void {
    let appliedCount = 0;
    
    for (const [id, value] of Object.entries(params)) {
      try {
        this.setParam(id, value);
        appliedCount++;
      } catch {
        try {
          this.addParam(id, value);
          appliedCount++;
        } catch {
          // 参数不存在，忽略
        }
      }
    }
    logger.log(`[Live2D] ✅ 已应用 ${appliedCount} 个参数`);
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._modelReady = false;

    unregisterLive2DInstance(this.instanceId);
    this.stopIdleMotion();
    this._stopOverrideTicker();
    if (this.lipSyncTimer) { window.clearInterval(this.lipSyncTimer); this.lipSyncTimer = null; }
    if (this.expressionResetTimer) { window.clearTimeout(this.expressionResetTimer); this.expressionResetTimer = null; }
    if (this._emotionMotionTimer) { clearTimeout(this._emotionMotionTimer); this._emotionMotionTimer = null; }

    if (this.model) {
      try {
        this.app?.stage.removeChild(this.model as unknown as DisplayObject);
        this.model.destroy();
      } catch { /* ignore */ }
      this.model = null;
    }
    if (this.app) {
      try {
        const appCanvas = this.app.view as HTMLCanvasElement;
        const gl = appCanvas?.getContext('webgl2') || appCanvas?.getContext('webgl') || appCanvas?.getContext('experimental-webgl');
        if (gl && 'getExtension' in gl) {
          const ext = (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context');
          if (ext) ext.loseContext();
        }
        this.app.destroy(false, { children: true, texture: true, baseTexture: true });
        if (appCanvas && appCanvas.parentNode) {
          appCanvas.parentNode.removeChild(appCanvas);
        }
      } catch { /* ignore */ }
      this.app = null;
    }

    if (this._originalCanvas) {
      this._originalCanvas.style.display = '';
      this._originalCanvas = null;
    }

    this._allParamIds.clear();
    this._paramNameCache.clear();
    this._overrideParams.clear();
    this._currentOverrideParams.clear();
    this._emotionParams.clear();
    this._targetEmotionParams.clear();
    this._currentEmotionParams.clear();
    this._availableMotionGroups.clear();
    this._availableExpressions = [];
    this._hasExpressions = false;
    this._emotionConfigs = {};
    this._emotionParamsActive = false;
    this._overrideActive = false;
    this._emotionMotionPlaying = false;
    this._lastEmotion = 'neutral';
    this._currentExpression = '';
    this._customAnim = null;
  }
}

// ========== 全局单例保留给主页面使用 ==========
let live2dDriverInstance: Live2DDriver | null = null;
let live2dInitPromise: Promise<Live2DDriver> | null = null;
let live2dInstanceCanvasId: string | null = null;
let live2dInstanceModelUrl: string | null = null;

export const initLive2D = async (config?: Live2DConfig): Promise<Live2DDriver> => {
  const nextCanvasId = config?.canvasId ?? "live2d-canvas";
  const nextModelUrl = config?.modelUrl ?? "/live2d/models/kei_basic_free/runtime/kei_basic_free.model3.json";
  const hasCanvasElement = !!config?.canvas;

  if (!hasCanvasElement && live2dDriverInstance && live2dInstanceCanvasId === nextCanvasId && live2dInstanceModelUrl === nextModelUrl) {
    return live2dDriverInstance;
  }
  if (live2dInitPromise) {
    await live2dInitPromise.catch(() => undefined);
    if (!hasCanvasElement && live2dDriverInstance && live2dInstanceCanvasId === nextCanvasId && live2dInstanceModelUrl === nextModelUrl) {
      return live2dDriverInstance;
    }
  }
  destroyLive2D();

  const driver = new Live2DDriver(config);
  live2dInitPromise = (async () => {
    await driver.init();
    await driver.loadModel(config?.modelUrl);
    live2dDriverInstance = driver;
    live2dInstanceCanvasId = nextCanvasId;
    live2dInstanceModelUrl = nextModelUrl;
    return driver;
  })();

  try {
    const driver = await live2dInitPromise;
    driver.startIdleMotion(10000);
    return driver;
  } finally {
    live2dInitPromise = null;
  }
};

export const getLive2DDriver = (): Live2DDriver | null => live2dDriverInstance;

export const destroyLive2D = (): void => {
  if (live2dDriverInstance) { live2dDriverInstance.destroy(); live2dDriverInstance = null; }
  live2dInstanceCanvasId = null;
  live2dInstanceModelUrl = null;
  live2dInitPromise = null;
};