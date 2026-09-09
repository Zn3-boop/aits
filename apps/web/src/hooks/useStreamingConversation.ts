/**
 * 流式对话 Hook - 管理 SSE 连接、音频队列、情绪响应
 * 使用 TTSManager 统一管理 TTS 播放
 * 集成时间轴：AI 回复完成后生成表情-动作时间轴，与 TTS 播放同步
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ttsManager } from '../services/tts/TTSManager';
import { expressionBus } from '../features/expression-bus';
import { generateTimeline } from '../services/timeline-generator';
import { emotionTimelineSync } from '../live2d-enhancements/EmotionTimelineSync';
import { apiFetch } from '../utils/auth';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface StreamingState {
  isResponding: boolean;
  currentText: string;
  currentEmotion: string;
  isSpeaking: boolean;
}

interface UseStreamingConversationOptions {
  personaId?: string;
  sessionId?: string;
}

export const useStreamingConversation = (options: UseStreamingConversationOptions = {}) => {
  const { personaId, sessionId: initialSessionId } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<StreamingState>({
    isResponding: false,
    currentText: '',
    currentEmotion: 'neutral',
    isSpeaking: false,
  });
  const [currentSessionId, setCurrentSessionId] = useState(initialSessionId);

  const abortRef = useRef<AbortController | null>(null);
  const fullTextRef = useRef('');
  const timelineSyncRef = useRef<(() => void) | null>(null);

  const stopAudio = useCallback(() => {
    ttsManager.stop();
    expressionBus.stopTimeline();
    setState((s) => ({ ...s, isSpeaking: false }));
  }, []);

  useEffect(() => {
    const handleUserSpeak = () => {
      console.log('[useStreamingConversation] 用户开始说话，打断 AI');
      ttsManager.interrupt();
      expressionBus.stopTimeline();
    };
    window.addEventListener('user-speech-started', handleUserSpeak);
    return () => window.removeEventListener('user-speech-started', handleUserSpeak);
  }, []);

  useEffect(() => {
    const unsubscribe = ttsManager.onProgress((elapsedMs: number) => {
      expressionBus.syncTimelineTime(elapsedMs);
    });
    timelineSyncRef.current = unsubscribe;
    return () => {
      unsubscribe();
    };
  }, []);

  const sendMessage = useCallback(
    async (userText: string) => {
      abortRef.current?.abort();
      ttsManager.interrupt();
      expressionBus.stopTimeline();

      setMessages((prev) => [...prev, { role: 'user', content: userText }]);
      setState({
        isResponding: true,
        currentText: '',
        currentEmotion: 'neutral',
        isSpeaking: false,
      });
      fullTextRef.current = '';

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const endpoint = personaId
          ? `/api/personas/${personaId}/chat`
          : '/api/chat/stream';

        console.log('[useStreamingConversation] 发送请求到:', endpoint);

        const res = await apiFetch(endpoint, {
          method: 'POST',
          body: JSON.stringify({
            message: userText,
            ...(currentSessionId ? { sessionId: currentSessionId } : {}),
            ...(personaId ? { personaId } : {}),
          }),
          signal: abort.signal,
        });

        if (!res.ok) {
          throw new Error(`请求失败: ${res.status}`);
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter((l) => l.trim());

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;

            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') continue;

            let data: Record<string, unknown>;
            try {
              data = JSON.parse(dataStr) as Record<string, unknown>;
            } catch {
              continue;
            }

            console.log('[useStreamingConversation] 收到事件:', data.type);

            switch (data.type as string) {
              case 'connected':
                if (data.sessionId) {
                  setCurrentSessionId(data.sessionId as string);
                }
                break;

              case 'token':
              case 'text':
              case 'delta': {
                const rawChunk = (data.content as string) || '';
                const { cleanText } = emotionTimelineSync.feedLLMChunk(rawChunk);
                fullTextRef.current += cleanText;
                setState((s) => ({ ...s, currentText: fullTextRef.current }));
                break;
              }

              case 'emotion':
                setState((s) => ({ ...s, currentEmotion: data.emotion as string }));
                window.dispatchEvent(
                  new CustomEvent('trigger-live2d-emotion', {
                    detail: { emotion: data.emotion },
                  })
                );
                break;

              case 'audio_chunk':
                if (data.audio) {
                  ttsManager.play(data.audio as string);
                }
                break;

              case 'done': {
                setMessages((prev) => [
                  ...prev,
                  { role: 'assistant', content: fullTextRef.current },
                ]);
                setState((s) => ({ ...s, isResponding: false }));

                emotionTimelineSync.finalizeLLM();

                const fullText = fullTextRef.current;
                if (fullText.trim()) {
                  const timeline = generateTimeline(fullText);
                  expressionBus.loadTimeline(timeline);

                  if (ttsManager.getIsPlaying()) {
                    const currentElapsed = ttsManager.getElapsedTime();
                    expressionBus.startTimeline(currentElapsed);
                  } else {
                    expressionBus.startTimeline(0);
                  }

                  console.log('[useStreamingConversation] 时间轴已加载，共', timeline.length, '个条目');
                }
                break;
              }

              case 'error':
                console.error('[useStreamingConversation] 错误:', data.error || data.message);
                setState((s) => ({ ...s, isResponding: false }));
                break;
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('[useStreamingConversation] 请求失败:', err);
        }
        setState((s) => ({ ...s, isResponding: false }));
      }
    },
    [personaId, currentSessionId]
  );

  const stopResponse = useCallback(() => {
    abortRef.current?.abort();
    ttsManager.stop();
    expressionBus.stopTimeline();
    setState((s) => ({ ...s, isResponding: false }));
  }, []);

  return {
    messages,
    state,
    sendMessage,
    stopResponse,
    stopAudio,
    sessionId: currentSessionId,
  };
};