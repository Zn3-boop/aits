/**
 * 语音聊天页面 - VAD 语音助手 + 逐段 TTS + 面部追踪
 *
 * 全链路（useVADAssistant）：
 *   麦克风 → VAD 检测 → WebSocket → Whisper STT → 文本
 *   → SSE 流式请求 → Ollama LLM → 逐句 TTS → 音频播放
 *   → 静音后自动重新监听（连续模式）
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useVADAssistant } from '../hooks/useVADAssistant';
import { useFaceExpression } from '../hooks/useFaceExpression';
import { useStreamingConversation } from '../hooks/useStreamingConversation';
import { useLive2DControl } from '../hooks/useLive2DControl';
import { ttsManager } from '../services/tts/TTSManager';
import { expressionBus } from '../features/expression-bus';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const mapTextToEmotion = (text: string): string => {
  const lower = text.toLowerCase();
  if (lower.includes('开心') || lower.includes('高兴') || lower.includes('哈哈') || lower.includes('笑')) return 'happy';
  if (lower.includes('难过') || lower.includes('伤心') || lower.includes('悲伤')) return 'sad';
  if (lower.includes('生气') || lower.includes('愤怒')) return 'angry';
  if (lower.includes('惊讶') || lower.includes('哇')) return 'surprised';
  if (lower.includes('害怕') || lower.includes('恐惧')) return 'fearful';
  if (lower.includes('恶心') || lower.includes('讨厌')) return 'disgusted';
  if (lower.includes('思考') || lower.includes('想')) return 'thinking';
  if (lower.includes('哦') || lower.includes('嗯')) return 'listening';
  return 'neutral';
};

export const VoiceChatPage = ({ personaId: propPersonaId }: { personaId?: string }) => {
  const personaId = propPersonaId || 'default';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRealtimeMode, setIsRealtimeMode] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(() => ttsManager.isEnabled());
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState('neutral');
  const videoRef = useRef<HTMLVideoElement>(null);

  const sendMessageRef = useRef<(text: string) => Promise<void>>(() => Promise.resolve());
  const [isSending, setIsSending] = useState(false);

  const conversation = useStreamingConversation({ personaId });
  useLive2DControl();
  useFaceExpression(videoRef);

  useEffect(() => {
    setIsAISpeaking(conversation.state.isSpeaking);
  }, [conversation.state.isSpeaking]);

  useEffect(() => {
    const handleSpeechStart = () => setIsAISpeaking(true);
    const handleSpeechEnd = () => setIsAISpeaking(false);
    window.addEventListener('ai-speech-started', handleSpeechStart);
    window.addEventListener('ai-speech-ended', handleSpeechEnd);
    return () => {
      window.removeEventListener('ai-speech-started', handleSpeechStart);
      window.removeEventListener('ai-speech-ended', handleSpeechEnd);
    };
  }, []);

  useEffect(() => {
    const handleEmotion = (e: CustomEvent<{ emotion: string }>) => {
      setCurrentEmotion(e.detail.emotion);
    };
    window.addEventListener('live2d-set-emotion', handleEmotion as EventListener);
    return () => window.removeEventListener('live2d-set-emotion', handleEmotion as EventListener);
  }, []);

  useEffect(() => {
    if (conversation.messages.length > messages.length) {
      const lastMsg = conversation.messages[conversation.messages.length - 1];
      if (lastMsg.role === 'assistant') {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'assistant',
            content: lastMsg.content,
            timestamp: new Date(),
          },
        ]);
        const emotion = mapTextToEmotion(lastMsg.content);
        expressionBus.fromLLM(emotion as 'happy' | 'sad' | 'angry' | 'surprised' | 'fearful' | 'disgusted' | 'neutral' | 'thinking' | 'listening' | 'speaking');
      }
    }
  }, [conversation.messages, messages.length]);

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isSending) return;

      setIsSending(true);

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInputText('');

      ttsManager.stop();
      expressionBus.listening();

      try {
        await conversation.sendMessage(text);
      } finally {
        setIsSending(false);
      }
    },
    [conversation, isSending]
  );

  useEffect(() => {
    sendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  const vad = useVADAssistant(
    {
      onTranscript: (text) => {
        setInputText(text);
      },
      onResponseStart: () => {
        setInputText('');
      },
      onResponseText: (text) => {
        setInputText(text);
      },
      onResponseEnd: () => {
        setInputText('');
      },
      onError: (err) => {
        console.error('[VoiceChatPage] VAD 错误:', err);
      },
      onAutoSend: (text) => {
        if (text.trim()) {
          const userMessage: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: text,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, userMessage]);
          setInputText('');
          ttsManager.stop();
          expressionBus.listening();
          conversation.sendMessage(text);
        }
      },
    },
    {
      personaId,
      silenceMs: 1500,
      minSpeechMs: 300,
      threshold: 0.02,
    }
  );

  const { isListening, isProcessing, isSpeaking: isUserSpeaking, isConnected, error: voiceError, start: startVAD, stop: stopVAD, toggle: _toggleVAD } = vad;

  const toggleRealtimeMode = useCallback(() => {
    if (isRealtimeMode) {
      stopVAD();
      setIsRealtimeMode(false);
      setInputText('');
    } else {
      setInputText('');
      setIsRealtimeMode(true);
      startVAD();
    }
  }, [isRealtimeMode, startVAD, stopVAD]);

  useEffect(() => {
    return () => {
      if (isRealtimeMode) {
        stopVAD();
      }
    };
  }, [isRealtimeMode, stopVAD]);

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    ttsManager.setEnabled(next);
    if (!next) conversation.stopAudio();
  };

  return (
    <div className="voice-chat-page" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <video
        ref={videoRef}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
        playsInline
        muted
      />

      {/* 工具栏 */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 20,
          padding: 12,
          background: '#f5f5f5',
          borderRadius: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={toggleRealtimeMode}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 18px',
            borderRadius: 8,
            border: 'none',
            background: isRealtimeMode ? '#ff4444' : '#4CAF50',
            color: 'white',
            fontSize: 14,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {isRealtimeMode ? <MicOff size={18} /> : <Mic size={18} />}
          {isRealtimeMode ? '退出实时语音' : '实时语音'}
          {isRealtimeMode && isUserSpeaking && <span style={{ width: 8, height: 8, background: '#fff', borderRadius: '50%', animation: 'pulse 1s infinite', marginLeft: 4 }} />}
        </button>

        <button
          onClick={toggleVoice}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 18px',
            borderRadius: 8,
            border: '1px solid #ddd',
            background: voiceEnabled ? '#e3f2fd' : '#fff',
            color: voiceEnabled ? '#1976d2' : '#666',
            fontSize: 14,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          {voiceEnabled ? '语音开' : '语音关'}
        </button>

        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#666' }}>
          {isRealtimeMode && isUserSpeaking && (
            <span style={{ color: '#4CAF50', fontWeight: 600 }}>🎙️ 检测到语音...</span>
          )}
          {isRealtimeMode && isListening && !isUserSpeaking && !isProcessing && (
            <span style={{ color: '#999' }}>⏳ 请说话...</span>
          )}
          {isRealtimeMode && isProcessing && (
            <span style={{ color: '#2196F3', fontWeight: 600 }}>🤖 AI 回复中...</span>
          )}
          {isRealtimeMode && !isConnected && (
            <span style={{ color: '#ff4444' }}>⚠️ 未连接</span>
          )}
          {voiceError && <span style={{ color: '#ff4444' }}>{voiceError}</span>}
        </div>
      </div>

      {/* AI 状态 */}
      <div style={{ marginBottom: 20, padding: 10, background: '#f0f0f0', borderRadius: 8 }}>
        <div>
          🤖 AI 状态: {isAISpeaking ? <span style={{ color: '#4CAF50' }}>🗣️ 说话中</span> : <span style={{ color: '#666' }}>😶 等待中</span>}
        </div>
        <div>😊 当前情绪: {currentEmotion}</div>
        <div style={{ fontSize: 12, color: '#999' }}>
          TTS: {ttsManager.isEnabled() ? '开启（后端推送音频）' : '关闭'} |
          {isRealtimeMode ? '🎤 VAD 连续语音 (Whisper→LLM→TTS)' : '⌨️ 文字输入模式'}
          {isRealtimeMode && isConnected && ' | ✅ WS已连接'}
        </div>
      </div>

      {/* 输入区域 */}
      <div style={{ marginBottom: 20 }}>
        {isRealtimeMode && (
          <div style={{ padding: '10px 14px', background: isUserSpeaking ? '#e8f5e9' : isProcessing ? '#e3f2fd' : inputText ? '#fff9c4' : '#fff3cd', borderRadius: 8, marginBottom: 8, fontSize: 13, color: isUserSpeaking ? '#2e7d32' : isProcessing ? '#1565c0' : inputText ? '#f57f17' : '#856404' }}>
            {isUserSpeaking ? (
              <>🎙️ 检测到语音，正在识别...</>
            ) : isProcessing ? (
              <>🤖 AI 正在回复...</>
            ) : inputText ? (
              <>📝 {inputText}</>
            ) : (
              <>⏳ 请对着麦克风说话，VAD 会自动检测并发送...</>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={isRealtimeMode ? '🎤 VAD 语音识别结果实时显示在这里...' : '💬 输入消息，或点击"实时语音"对着麦克风说话...'}
            rows={3}
            style={{ flex: 1, padding: 12, borderRadius: 8, border: '1px solid #ddd', fontSize: 14, resize: 'vertical' }}
          />
          <button
            onClick={() => handleSendMessage(inputText)}
            disabled={!inputText.trim() || isSending}
            style={{ padding: '12px 24px', borderRadius: 8, border: 'none', background: inputText.trim() && !isSending ? '#2196F3' : '#ccc', color: 'white', fontSize: 14, fontWeight: 600, cursor: inputText.trim() && !isSending ? 'pointer' : 'not-allowed' }}
          >
            发送
          </button>
        </div>
      </div>

      {/* AI 回复中 */}
      {conversation.state.isResponding && (
        <div style={{ padding: 15, background: '#e3f2fd', borderRadius: 8, marginBottom: 20 }}>
          <strong>🤖 AI 正在回复:</strong>
          <div style={{ marginTop: 8, fontSize: 14 }}>{conversation.state.currentText}</div>
        </div>
      )}

      {/* 聊天记录 */}
      <div style={{ maxHeight: '400px', overflowY: 'auto', padding: 15, background: '#fafafa', borderRadius: 8 }}>
        {messages.length === 0 && !conversation.state.isResponding && (
          <p style={{ textAlign: 'center', color: '#999' }}>还没有对话，点击"实时语音"对着麦克风说话，或输入文字开始聊天吧！</p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} style={{ textAlign: msg.role === 'user' ? 'right' : 'left', marginBottom: 15 }}>
            <div style={{ display: 'inline-block', padding: '10px 15px', borderRadius: 15, background: msg.role === 'user' ? '#4CAF50' : '#2196F3', color: 'white', maxWidth: '80%', wordBreak: 'break-word' }}>
              <strong>{msg.role === 'user' ? '👤' : '🤖'}</strong> {msg.content}
            </div>
            <div style={{ fontSize: '0.8em', color: '#999', marginTop: 5 }}>{msg.timestamp.toLocaleTimeString()}</div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
};