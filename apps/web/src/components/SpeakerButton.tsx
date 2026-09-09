/* eslint-disable react-refresh/only-export-components */
import { useState, useContext } from 'react';
import { lipSyncController } from '../services/live2d/LipSyncController';
import { apiFetch } from '../utils/auth';
import { logger } from '../utils/logger';
import { AppContext } from '../contexts/AppContext';

interface SpeakerButtonProps {
  messageId: string;
  text: string;
  voiceId?: string;
  onPlayStart?: (messageId: string) => void;
  onPlayEnd?: (messageId: string) => void;
}

// 全局播放状态
let currentAudio: HTMLAudioElement | null = null;
let playingMessageId: string | null = null;
let synthesizingId: string | null = null;


export const SpeakerButton: React.FC<SpeakerButtonProps> = ({
  messageId,
  text,
  voiceId: propVoiceId,
  onPlayStart,
  onPlayEnd
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const { settings } = useContext(AppContext);
  
  // 【修复2】使用 persona 音色，fallback 到 propVoiceId 或默认音色
  const effectiveVoiceId = settings?.ttsVoice || propVoiceId || 'zh-CN-XiaoxiaoNeural';

  const handlePlay = async () => {
    // 【修复3】防重播：如果正在播放同一条消息，直接停止
    if (isPlaying && playingMessageId === messageId) {
      currentAudio?.pause();
      lipSyncController.stop();
      setIsPlaying(false);
      playingMessageId = null;
      onPlayEnd?.(messageId);
      return;
    }
    
    // 如果正在播放其他消息，停止它
    if (isPlaying && playingMessageId !== messageId) {
      currentAudio?.pause();
      lipSyncController.stop();
    }
    // 如果正在播放，先停止
    if (isPlaying && currentAudio) {
      currentAudio.pause();
      lipSyncController.stop();
      setIsPlaying(false);
      playingMessageId = null;
      onPlayEnd?.(messageId);
      return;
    }

    // 如果正在合成其他消息，不允许播放
    if (synthesizingId && synthesizingId !== messageId) {
      return;
    }

    try {
      setIsSynthesizing(true);
      synthesizingId = messageId;

      // 停止当前正在播放的音频
      if (currentAudio) {
        currentAudio.pause();
        lipSyncController.stop();
      }

      // 【修复2】使用 effectiveVoiceId 调用后端 TTS 接口
      const response = await apiFetch('/api/tts/stream', {
        method: 'POST',
        body: JSON.stringify({ text, voiceId: effectiveVoiceId })
      });

      if (!response.ok) {
        throw new Error('TTS request failed');
      }

      // 从响应头获取 word boundaries
      const boundariesStr = response.headers.get('X-Word-Boundaries');
      const wordBoundaries = boundariesStr ? JSON.parse(boundariesStr) : [];

      // 创建音频 Blob URL
      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      currentAudio = audio;
      playingMessageId = messageId;
      setIsSynthesizing(false);
      synthesizingId = null;
      setIsPlaying(true);

      // 开始口型联动
      lipSyncController.start(audio, wordBoundaries);

      audio.onended = () => {
        setIsPlaying(false);
        playingMessageId = null;
        lipSyncController.stop();
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        onPlayEnd?.(messageId);
      };

      audio.onerror = () => {
        setIsPlaying(false);
        playingMessageId = null;
        lipSyncController.stop();
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        synthesizingId = null;
        onPlayEnd?.(messageId);
        logger.error('音频播放失败');
      };

      onPlayStart?.(messageId);
      await audio.play();
    } catch (err) {
      setIsSynthesizing(false);
      synthesizingId = null;
      setIsPlaying(false);
      onPlayEnd?.(messageId);
      logger.error('语音生成失败:', err);
    }
  };

  return (
    <button
      onClick={handlePlay}
      disabled={isSynthesizing}
      className="ml-1 p-1 rounded-full opacity-50 hover:opacity-100 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
      title={isPlaying ? '停止播放' : '播放语音'}
    >
      {isSynthesizing ? (
        <span className="inline-block w-4 h-4 animate-spin">⏳</span>
      ) : isPlaying ? (
        <span className="inline-block w-4 h-4 animate-pulse">🔊</span>
      ) : (
        <span className="inline-block w-4 h-4">🔈</span>
      )}
    </button>
  );
};

// 导出全局状态管理函数
export const getPlayingMessageId = () => playingMessageId;
export const getSynthesizingId = () => synthesizingId;