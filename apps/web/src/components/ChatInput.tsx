import { useState, useRef, useEffect, useCallback } from 'react';
import { useChat } from '../contexts/ChatContext';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useVADAssistant } from '../hooks/useVADAssistant';
import { useSettings } from '../hooks/useSettings';
import type { Message } from '../types/index';
import { apiFetch } from '../utils/auth';
import { logger } from '../utils/logger';
import { expressionBus } from '../features/expression-bus';
import './ChatInput.css';

type EmotionKey = Message['emotion'] | 'neutral';

type Live2DModelLike = Record<string, unknown> | null;

// ── 类型接口定义 ──────────────────────────────

interface ChatInputProps {
  onEmotionChange: (emotion: EmotionKey) => void;
  live2dManager: {
    currentModel: Live2DModelLike;
    applyEmotion: (model: Live2DModelLike, emotion: EmotionKey) => void;
  };
}

interface STTMessage {
  type: string;
  text?: string;
}

interface ExpressionEvent {
  emotion: string;
}

interface RealtimeVoiceCallbacks {
  onTranscript?: (text: string) => void;
  onAIResponse?: (text: string) => void;
  onError?: (error: string) => void;
  onSpeakingStart?: () => void;
  onSpeakingEnd?: () => void;
}

const normalizeEmotion = (emotion?: string): EmotionKey => {
  if (!emotion) return 'neutral';
  return (['warm', 'shy', 'tsundere', 'sad', 'happy', 'neutral'] as EmotionKey[]).includes(emotion as EmotionKey)
    ? (emotion as EmotionKey)
    : 'neutral';
};

// 简单的实时语音实现（集成 expression-bus）
const useSimpleRealtimeVoice = (callbacks: RealtimeVoiceCallbacks) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const startListening = useCallback(async () => {
    try {
      // 获取麦克风
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 连接 WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/stt/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        ws.send(JSON.stringify({ type: 'start' }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as STTMessage;
          if (data.type === 'final' && data.text) {
            callbacks.onTranscript?.(data.text);
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
      };

      ws.onerror = () => {
        callbacks.onError?.('WebSocket 连接失败');
        setIsConnected(false);
      };

      // 开始录音
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm'
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          const buffer = await event.data.arrayBuffer();
          ws.send(new Uint8Array(buffer));
        }
      };

      mediaRecorder.start(100);
      setIsListening(true);
      expressionBus.listening();
    } catch (err) {
      logger.error('[RealtimeVoice] 麦克风访问失败:', err);
      callbacks.onError?.('无法访问麦克风');
    }
  }, [callbacks]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsListening(false);
    setIsConnected(false);
  }, []);

  // 监听 expression-bus 的表情事件
  useEffect(() => {
    const unsubscribe = expressionBus.on('*', (event: ExpressionEvent) => {
      if (event.emotion === 'speaking') {
        setIsSpeaking(true);
        callbacks.onSpeakingStart?.();
      } else if (event.emotion === 'listening') {
        setIsSpeaking(false);
        callbacks.onSpeakingEnd?.();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [callbacks]);

  return {
    isListening,
    isSpeaking,
    isConnected,
    startListening,
    stopListening,
  };
};

export const ChatInput = ({ onEmotionChange, live2dManager }: ChatInputProps) => {
  const { currentPersona, currentChat, messages, setMessages, createChat } = useChat();
  const { settings } = useSettings();
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [isRealtimeMode, setIsRealtimeMode] = useState(false);
  const [partialText, setPartialText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);

  const sendMessageRef = useRef<((text?: string) => Promise<void>) | null>(null);

  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  // 普通语音识别
  const { isListening, interimTranscript, isSupported, error, startListening, stopListening } = useVoiceInput(
    (text: string) => {
      if (text.trim()) {
        setInputValue(text);
        sendMessageRef.current?.(text);
      }
    }
  );

  // 实时语音 Hook（集成 expression-bus）
  const {
    isListening: isRealtimeListening,
    isConnected,
    startListening: startRealtime,
    stopListening: stopRealtime,
  } = useSimpleRealtimeVoice({
    onTranscript: (text) => {
      setPartialText('');
      setInputValue(text);
      // 发送消息
      if (text.trim()) {
        sendMessageRef.current?.(text);
      }
    },
    onError: (err: string) => {
      logger.error('[RealtimeVoice] 错误:', err);
      setSending(false);
    },
    onSpeakingStart: () => {
      expressionBus.speaking();
    },
    onSpeakingEnd: () => {
      expressionBus.listening();
    },
  });

  // VAD语音助手 Hook - 静音自动发送（全管线：VAD→STT→LLM→TTS→Live2D）
  const vad = useVADAssistant(
    {
      onTranscript: (text) => {
        setPartialText(text);
      },
      onResponseStart: () => {
        setPartialText('');
      },
      onResponseText: (text) => {
        setPartialText(text);
      },
      onResponseEnd: () => {
        setPartialText('');
      },
      onError: (error) => {
        logger.error('[VAD] 错误:', error);
        setPartialText('');
      },
      onAutoSend: (text) => {
        if (text.trim()) {
          sendMessageRef.current?.(text);
        }
      },
    },
    {
      personaId: currentPersona?.id,
    }
  );

  const { isListening: isVADListening, isProcessing: isVADProcessing, toggle: toggleVAD } = vad;

  // 发送消息
  const doSend = async (content: string, chatId: string) => {
    if (sendingRef.current || !currentPersona) return;
    setSending(true);

    const tempId = `temp_${Date.now()}`;
    const userMsg: Message = {
      id: tempId,
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputValue('');

    apiFetch(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ role: 'user', content })
    }).catch(err => logger.error('消息保存失败:', err));

    const context = newMessages.slice(-50);
    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: context,
          personaId: currentPersona.id
        })
      });

      if (!res.ok) throw new Error('消息发送失败');

      const { reply, emotion } = await res.json() as { reply: string; emotion?: string };

      const aiMsg: Message = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: reply,
        emotion,
        createdAt: new Date().toISOString()
      };
      setMessages([...messages, userMsg, aiMsg]);

      apiFetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ role: 'assistant', content: reply, emotion })
      }).catch(err => logger.error('AI消息保存失败:', err));

      const normalizedEmotion = normalizeEmotion(emotion);
      onEmotionChange(normalizedEmotion);

      // 通知 expression-bus（去掉 as any）
      expressionBus.fromLLM(normalizedEmotion);
      expressionBus.speaking();

      if (live2dManager.currentModel && live2dManager.applyEmotion) {
        live2dManager.applyEmotion(live2dManager.currentModel, normalizedEmotion);
      }
    } catch (err) {
      logger.error('消息发送失败:', err);
      const errorMsg = err instanceof Error ? err.message : '消息发送失败';
      setMessages([...messages, userMsg, {
        id: `error_${Date.now()}`,
        role: 'assistant',
        content: `⚠️ ${errorMsg}`,
        createdAt: new Date().toISOString()
      }]);
    } finally {
      setSending(false);
    }
  };

  const sendMessage = useCallback(async (textToSend?: string) => {
    const content = textToSend ?? inputValue.trim();
    if (!content || sendingRef.current || !currentPersona) return;

    let chatId = currentChat?.id;

    if (!chatId) {
      const title = content.slice(0, 20);
      try {
        const newChat = await createChat(currentPersona.id, title);
        chatId = newChat.id;
      } catch (error) {
        logger.error('创建对话失败:', error);
        return;
      }
    }

    doSend(content, chatId);
  }, [inputValue, currentPersona, currentChat, messages, createChat]);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const toggleRealtimeMode = useCallback(() => {
    if (isRealtimeMode) {
      stopRealtime();
      setIsRealtimeMode(false);
    } else {
      setIsRealtimeMode(true);
      startRealtime();
    }
  }, [isRealtimeMode, startRealtime, stopRealtime]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [currentChat]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isVoiceListening = isRealtimeMode ? isRealtimeListening : isListening;
  const displayText = isRealtimeMode ? partialText : (interimTranscript || '');

  return (
    <div className="chat-input-container">
      {/* 实时语音按钮 */}
      <button
        onClick={toggleRealtimeMode}
        className={`chat-mode-button ${isRealtimeMode ? 'active' : ''}`}
        title={isRealtimeMode ? '切换到普通模式' : '切换到实时语音模式'}
      >
        {isRealtimeMode ? '🔴' : '🎙️'}
      </button>

      {/* VAD语音按钮 - 静音自动发送 */}
      <button
        onClick={toggleVAD}
        className={`chat-vad-button ${isVADListening || isVADProcessing ? 'active' : ''}`}
        title={isVADListening ? 'VAD录音中...' : isVADProcessing ? '处理中...' : 'VAD语音模式'}
      >
        {isVADListening ? '🔴' : isVADProcessing ? '⚡' : '🎯'}
      </button>

      {isVADListening && (
        <div className="chat-vad-status">🟢 VAD正在听...</div>
      )}

      {isVADProcessing && (
        <div className="chat-vad-status">⚡ 处理中...</div>
      )}

      {settings.voiceInput && !isRealtimeMode && (
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={!isSupported}
          className={`chat-voice-button ${!isSupported ? 'opacity-30 cursor-not-allowed' : ''} ${isListening ? 'listening' : ''}`}
          title={!isSupported ? '当前浏览器不支持语音输入' : isListening ? '点击停止录音' : '点击开始语音输入'}
        >
          🎤
        </button>
      )}

      {isRealtimeMode && (
        <div className="chat-realtime-status">
          {isConnected ? '🟢' : '🟡'}
          {isRealtimeListening ? ' 正在听...' : ' 连接中...'}
        </div>
      )}


      <div className="chat-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isVoiceListening ? '正在听...' : '轻轻说一句也可以...'}
          disabled={sending || (isRealtimeMode && !inputValue)}
          className={`chat-input-field ${isVoiceListening ? 'listening' : ''}`}
        />
        {displayText && (
          <div className="chat-interim-transcript">
            {displayText}
          </div>
        )}
      </div>

      <button
        onClick={() => sendMessage()}
        disabled={sending || !inputValue.trim()}
        className="chat-send-button"
      >
        {sending ? '...' : '发送'}
      </button>

      {error && (
        <div className="chat-voice-error">
          {error}
        </div>
      )}
    </div>
  );
};