/**
 * useSegmentedTTS - 全局语音开关 + 单条消息朗读
 *
 * 后端 SSE 已经做了逐段 audio_chunk，这里主要提供：
 * 1. 全局语音开关（控制所有 TTS 播放）
 * 2. ChatMessageList 单条消息朗读（调用 /api/tts/synthesize）
 */

import { useRef, useCallback, useState } from 'react';
import { apiFetch } from '../utils/auth';

let globalVoiceEnabled = true;
export const setGlobalVoiceEnabled = (v: boolean) => {
  globalVoiceEnabled = v;
};
export const getGlobalVoiceEnabled = () => globalVoiceEnabled;

export function useSegmentedTTS() {
  const [isPlaying, setIsPlaying] = useState(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const playText = useCallback(async (text: string) => {
    if (!globalVoiceEnabled || !text.trim()) return;

    setIsPlaying(true);
    try {
      const res = await apiFetch('/api/tts/synthesize', {
        method: 'POST',
        body: JSON.stringify({ text: text.trim().slice(0, 500), voiceId: 'zh-CN-XiaoxiaoNeural' }),
      });
      if (!res.ok) throw new Error('TTS 失败');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const audio = new Audio(url);
      currentAudioRef.current = audio;

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.play().catch(() => resolve());
      });
    } catch (e) {
      console.error('[SegmentedTTS] 播放失败:', e);
    } finally {
      setIsPlaying(false);
      currentAudioRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    currentAudioRef.current?.pause();
    currentAudioRef.current = null;
    setIsPlaying(false);
  }, []);

  return { playText, stop, isPlaying };
}