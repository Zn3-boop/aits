/**
 * Live2D 控制权管理 Hook —— 修复版
 * 
 * 核心修复：
 * 1. 直接操作 Live2DDriver，不再绕无用的中间事件（live2d-set-emotion）
 * 2. 监听正确的事件名 ai-emotion-change（而非 trigger-live2d-emotion）
 * 3. 口型同步：TTS 开始/结束直接启停 LipSyncEnhancer
 */
import { useEffect } from 'react';
import { getLive2DDriver } from '../features/live2d-driver';
import { lipSyncEnhancer } from '../live2d-enhancements/LipSyncEnhancer';

const aiSpeakingRef = { value: false };

declare global {
  interface Window {
    __AI_IS_SPEAKING__?: boolean;
  }
}

export function useLive2DControl() {
  // ── AI 说话时锁定 ──
  useEffect(() => {
    const onStart = () => {
      aiSpeakingRef.value = true;
      window.__AI_IS_SPEAKING__ = true;
    };
    const onEnd = () => {
      aiSpeakingRef.value = false;
      window.__AI_IS_SPEAKING__ = false;
    };
    window.addEventListener('ai-speech-started', onStart);
    window.addEventListener('ai-speech-ended', onEnd);
    return () => {
      window.removeEventListener('ai-speech-started', onStart);
      window.removeEventListener('ai-speech-ended', onEnd);
    };
  }, []);

  // ── AI 情绪 → 直接驱动 Live2D ──
  // 修复：监听 ai-emotion-change（而非 trigger-live2d-emotion）
  useEffect(() => {
    const handler = (e: CustomEvent<{ emotion: string; intensity?: number }>) => {
      if (!aiSpeakingRef.value) return;
      const driver = getLive2DDriver();
      if (driver) driver.driveEmotion(e.detail.emotion);
    };
    window.addEventListener('ai-emotion-change', handler as EventListener);
    // 兼容旧事件名
    window.addEventListener('trigger-live2d-emotion', handler as EventListener);
    return () => {
      window.removeEventListener('ai-emotion-change', handler as EventListener);
      window.removeEventListener('trigger-live2d-emotion', handler as EventListener);
    };
  }, []);

  // ── 用户情绪 → AI 沉默时全量响应，AI 说话时仅高强度透传 ──
  useEffect(() => {
    const handler = (e: CustomEvent<{ emotion: string; confidence: number }>) => {
      const driver = getLive2DDriver();
      if (!driver) return;

      if (aiSpeakingRef.value) {
        if (e.detail.confidence > 0.7 && e.detail.emotion !== 'neutral') {
          driver.driveEmotion(e.detail.emotion);
        }
      } else if (e.detail.confidence > 0.35) {
        driver.driveEmotion(e.detail.emotion);
      }
    };
    window.addEventListener('user-emotion-detected', handler as EventListener);
    return () => window.removeEventListener('user-emotion-detected', handler as EventListener);
  }, []);

  // ── 口型同步：TTS 开始/结束直接启停 LipSyncEnhancer + 语音节奏 ──
  useEffect(() => {
    const onStart = (e: CustomEvent<{ audioElement?: HTMLAudioElement; audio?: HTMLAudioElement; text?: string; durationMs?: number }>) => {
      const audio = e.detail?.audioElement || e.detail?.audio;
      if (audio) {
        lipSyncEnhancer.start(audio).catch(() => {
          lipSyncEnhancer.startSilentSimulation(
            audio.dataset.text || '…',
            audio.duration ? audio.duration * 1000 : undefined
          );
        });
        const driver = getLive2DDriver();
        if (driver && audio.duration && isFinite(audio.duration)) {
          driver.startSpeechGesture(audio.duration * 1000, 0.6);
        } else if (driver && e.detail?.durationMs) {
          driver.startSpeechGesture(e.detail.durationMs, 0.6);
        }
      } else if (e.detail?.text) {
        lipSyncEnhancer.startSilentSimulation(e.detail.text, e.detail.durationMs);
        const driver = getLive2DDriver();
        if (driver && e.detail?.durationMs) {
          driver.startSpeechGesture(e.detail.durationMs, 0.6);
        }
      }
    };
    const onEnd = () => {
      lipSyncEnhancer.stop();
      const driver = getLive2DDriver();
      if (driver) driver.endSpeechGesture();
    };

    window.addEventListener('ai-speech-started', onStart as EventListener);
    window.addEventListener('ai-speech-ended', onEnd);
    window.addEventListener('lipsync-start', onStart as EventListener);
    window.addEventListener('lipsync-stop', onEnd);

    return () => {
      window.removeEventListener('ai-speech-started', onStart as EventListener);
      window.removeEventListener('ai-speech-ended', onEnd);
      window.removeEventListener('lipsync-start', onStart as EventListener);
      window.removeEventListener('lipsync-stop', onEnd);
    };
  }, []);

  return { isAISpeaking: () => aiSpeakingRef.value };
}

export function isAISpeaking(): boolean {
  return aiSpeakingRef.value || window.__AI_IS_SPEAKING__ === true;
}