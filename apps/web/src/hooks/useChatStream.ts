import { useState, useRef, useCallback, useEffect } from 'react';
import { apiFetch } from '../utils/auth';
import { useNativeTTS } from './useNativeTTS';
import { lipSyncController } from '../services/live2d/LipSyncController';
import { logger } from '../utils/logger';

type UseChatStreamOptions = {
  currentPersona: { id: string } | null;
  currentSessionId: string | null;
  selectedVoice: string;
  isVoiceEnabled: boolean;
  emotion?: string;
  onSessionIdUpdate: (sessionId: string) => void;
  onTimeModeUpdate: (mode: 'morning' | 'afternoon' | 'evening' | 'night') => void;
  onAuthError: () => void;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  emotion?: string;
  createdAt?: string;
};

function normalizeSseText(value?: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as { text?: string; content?: string; reply?: string; emotion?: string };
      return parsed.text || parsed.content || parsed.reply || '';
    } catch {
      return value;
    }
  }
  return value;
}

export function useChatStream(options: UseChatStreamOptions) {
  const {
    currentPersona,
    currentSessionId,
    selectedVoice,
    isVoiceEnabled,
    emotion,
    onSessionIdUpdate,
    onTimeModeUpdate,
    onAuthError,
  } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const { speak: speakNative, stop: stopNative } = useNativeTTS();
  const ttsQueueRef = useRef<string[]>([]);
  const isSynthesizingRef = useRef(false);
  const sentenceBufRef = useRef('');
  const processTTSRef = useRef<(() => void) | null>(null);

  const processTTSQueue = useCallback(async () => {
    if (isSynthesizingRef.current || ttsQueueRef.current.length === 0) return;
    isSynthesizingRef.current = true;

    while (ttsQueueRef.current.length > 0) {
      const text = ttsQueueRef.current.shift()!;
      try {
        const res = await apiFetch('/api/tts', {
          method: 'POST',
          body: JSON.stringify({ text, personaId: currentPersona?.id, voiceId: selectedVoice }),
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);

          lipSyncController.start(audio);

          audio.onended = () => {
            lipSyncController.stop();
            processTTSRef.current?.();
          };
          audio.onerror = () => {
            lipSyncController.stop();
            processTTSRef.current?.();
          };
          audio.play();
          return;
        }
      } catch (e) {
        logger.warn('Coqui TTS failed, fallback to native:', e);
      }
      speakNative(text, () => processTTSRef.current?.());
      return;
    }
    isSynthesizingRef.current = false;
  }, [currentPersona, selectedVoice, speakNative]);

  useEffect(() => {
    processTTSRef.current = processTTSQueue;
  }, [processTTSQueue]);

  const queueTextForTTS = useCallback((text: string) => {
    if (!isVoiceEnabled) return;

    sentenceBufRef.current += text;
    const sentences = sentenceBufRef.current.split(/([。！？.!?]\s*)/);
    sentenceBufRef.current = sentences.pop() || '';

    for (let i = 0; i < sentences.length; i += 2) {
      const s = (sentences[i] + (sentences[i + 1] || '')).trim();
      if (s.length > 2) {
        ttsQueueRef.current.push(s);
      }
    }
    processTTSQueue();
  }, [isVoiceEnabled, processTTSQueue]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || loading || !currentPersona) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: content.trim()
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setLoading(true);
    setError(undefined);
    stopNative();

    try {
      const body: Record<string, unknown> = {
        message: content.trim(),
        personaId: currentPersona.id,
      };
      if (currentSessionId) {
        body.sessionId = currentSessionId;
      }
      if (emotion) {
        body.emotion = emotion;
      }

      const res = await apiFetch(`/api/personas/${currentPersona.id}/chat`, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errMsg = await res.text();
        throw new Error(errMsg);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      let fullReply = '';
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) continue;
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as {
                token?: string;
                content?: string;
                text?: string;
                reply?: string;
                emotion?: string;
                sessionId?: string;
                type?: string;
                timeMode?: 'morning' | 'afternoon' | 'evening' | 'night';
              };
              if (data.type === 'connected') {
                if (data.emotion && currentPersona) {
                  window.dispatchEvent(new CustomEvent('ai-emotion-change', {
                    detail: { emotion: data.emotion, personaId: currentPersona.id }
                  }));
                }
                continue;
              }
              if (data.timeMode) {
                onTimeModeUpdate(data.timeMode);
              }
              if (data.emotion && currentPersona) {
                window.dispatchEvent(new CustomEvent('ai-emotion-change', {
                  detail: { emotion: data.emotion, personaId: currentPersona.id }
                }));
              }
              const deltaText = normalizeSseText(data.token ?? data.content ?? data.text);
              if (deltaText) {
                fullReply += deltaText;
                queueTextForTTS(deltaText);
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant' && last.id.startsWith('assistant-')) {
                    updated[updated.length - 1] = { ...last, content: fullReply, emotion: data.emotion || last.emotion };
                  } else {
                    updated.push({
                      id: `assistant-${Date.now()}`,
                      role: 'assistant',
                      content: fullReply,
                      emotion: data.emotion
                    });
                  }
                  return updated;
                });
              }
              const finalReply = normalizeSseText(data.reply);
              if (finalReply) {
                fullReply = finalReply;
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant' && last.id.startsWith('assistant-')) {
                    updated[updated.length - 1] = { ...last, content: fullReply, emotion: data.emotion || last.emotion };
                  } else {
                    updated.push({
                      id: `assistant-${Date.now()}`,
                      role: 'assistant',
                      content: fullReply,
                      emotion: data.emotion
                    });
                  }
                  return updated;
                });
              }
              if (data.sessionId) {
                onSessionIdUpdate(data.sessionId);
              }
            } catch {
              // Skip non-JSON data lines
            }
          }
        }
      }
      if (sentenceBufRef.current.trim().length > 0) {
        const remaining = sentenceBufRef.current.trim();
        ttsQueueRef.current.push(remaining);
        sentenceBufRef.current = '';
        processTTSQueue();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '连接服务器失败';
      if (err instanceof Error && message.includes('登录已过期')) {
        onAuthError();
        return;
      }
      setError(message);
      setMessages(prev => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: `出错了：${message}`
        }
      ]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, currentPersona, currentSessionId, emotion, stopNative, queueTextForTTS, onSessionIdUpdate, onTimeModeUpdate, onAuthError]);

  const setMessagesExternal = setMessages;

  return {
    messages,
    setMessages: setMessagesExternal,
    loading,
    error,
    sendMessage,
    stopNative,
    speakNative,
  };
}