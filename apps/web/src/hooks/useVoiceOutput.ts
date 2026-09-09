
/**
 * 语音输出 Hook
 * 提供语音播放功能，支持口型联动
 */
import { logger } from '../utils/logger';

import { useState, useRef, useCallback, useEffect } from 'react';
import { lipSyncController } from '../services/live2d/LipSyncController';
import { ttsCache } from '../services/tts/TtsCache';
import { handleTtsError } from '../services/tts/errorHandler';

interface UseVoiceOutputReturn {
  playingMessageId: string | null;
  synthesizingId: string | null;
  play: (text: string, messageId: string, voiceId?: string) => Promise<void>;
  stop: () => void;
}

export const useVoiceOutput = (): UseVoiceOutputReturn => {
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [synthesizingId, setSynthesizingId] = useState<string | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setPlayingMessageId(null);
    lipSyncController.stop();
  }, []);

  const play = useCallback(async (text: string, messageId: string, voiceId?: string) => {
    const selectedVoiceId = voiceId || 'zh-CN-XiaoxiaoNeural';

    // 防止并发合成
    if (synthesizingId) {
      logger.log('[VoiceOutput] Already synthesizing, ignoring request');
      return;
    }

    // 如果正在播放同一条消息，则停止播放
    if (playingMessageId === messageId) {
      stop();
      return;
    }

    // 停止当前播放
    stop();

    setSynthesizingId(messageId);

    try {
      // 检查缓存
      const cached = ttsCache.get(text, selectedVoiceId);
      let audioUrl: string;
      let wordBoundaries: Array<{ offset_ms: number; duration_ms: number; text: string }> = [];

      if (cached) {
        logger.log('[VoiceOutput] Using cached audio');
        audioUrl = cached.audioUrl;
        wordBoundaries = cached.wordBoundaries;
      } else {
        // 请求音频流
        const { apiFetch } = await import('../utils/auth');
        const res = await apiFetch('/api/tts/stream', {
          method: 'POST',
          body: JSON.stringify({ text, voiceId: selectedVoiceId })
        });

        if (!res.ok) {
          let errorMessage = '语音生成失败';
          try {
            const errorData = await res.json();
            errorMessage = errorData.message || errorMessage;
          } catch {
            // 如果无法解析错误响应，使用默认消息
          }
          throw new Error(errorMessage);
        }

        // 从响应头获取词边界
        const boundariesStr = res.headers.get('X-Word-Boundaries');
        wordBoundaries = boundariesStr ? JSON.parse(boundariesStr) : [];

        // 创建音频 Blob URL
        const blob = await res.blob();
        audioUrl = URL.createObjectURL(blob);

        // 存入缓存
        ttsCache.set(text, selectedVoiceId, audioUrl, wordBoundaries);
      }

      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      // 启动口型联动（优先使用词边界，没有则 fallback 到音频分析）
      lipSyncController.start(audio, wordBoundaries);

      audio.onended = () => {
        setPlayingMessageId(null);
        lipSyncController.stop();
        currentAudioRef.current = null;
      };

      audio.onerror = () => {
        logger.error('[VoiceOutput] Audio playback error');
        setPlayingMessageId(null);
        lipSyncController.stop();
        currentAudioRef.current = null;
      };

      setPlayingMessageId(messageId);
      setSynthesizingId(null);

      // 确保用户交互后播放
      try {
        await audio.play();
      } catch {
        // 如果自动播放被阻止，尝试用户交互
        logger.warn('[VoiceOutput] 自动播放被阻止，等待用户交互');
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          await playPromise.catch(err => {
            logger.error('[VoiceOutput] 播放失败:', err);
            throw err;
          });
        }
      }
    } catch (err) {
      logger.error('[VoiceOutput] Playback error:', err);
      const error = handleTtsError(err);
      logger.error(`[VoiceOutput] ${error.code}: ${error.message}`);
      setPlayingMessageId(null);
      setSynthesizingId(null);
    }
  }, [synthesizingId, playingMessageId, stop]);

  // 组件卸载时清理缓存
  useEffect(() => {
    return () => {
      ttsCache.clear();
    };
  }, []);

  return {
    playingMessageId,
    synthesizingId,
    play,
    stop
  };
};