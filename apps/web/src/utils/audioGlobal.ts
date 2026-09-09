/**
 * 全局音频状态管理
 * 用于控制所有音频播放的统一停止功能
 */

// 全局音频状态
let globalAudioInstance: HTMLAudioElement | null = null;
let globalIsPlaying = false;
let globalStopCallback: (() => void) | null = null;

/**
 * 注册全局音频实例
 */
export const registerGlobalAudio = (audio: HTMLAudioElement | null, stopCallback?: () => void) => {
  globalAudioInstance = audio;
  globalStopCallback = stopCallback || null;
};

/**
 * 停止所有音频播放
 */
export const stopAllAudio = () => {
  if (globalAudioInstance) {
    globalAudioInstance.pause();
    globalAudioInstance = null;
  }
  if (globalStopCallback) {
    globalStopCallback();
    globalStopCallback = null;
  }
  globalIsPlaying = false;
};

/**
 * 检查是否有任何音频正在播放
 */
export const isAnyAudioPlaying = () => globalIsPlaying;

/**
 * 设置全局播放状态
 */
export const setGlobalPlaying = (playing: boolean) => {
  globalIsPlaying = playing;
};
