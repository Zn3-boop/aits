import type { RefObject } from 'react';
import { ttsManager } from '../services/tts/TTSManager';


type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  emotion?: string;
  createdAt?: string;
};

type Persona = {
  id: string;
  name: string;
  subtitle: string;
};

type ChatMessageListProps = {
  messages: ChatMessage[];
  currentPersona: Persona | null;
  loading: boolean;
  bottomRef: RefObject<HTMLDivElement | null>;
  onSpeakNative: (text: string) => void;
};

function getEmotionEmoji(emotion?: string) {
  switch (emotion) {
    case 'happy': return '😊';
    case 'sad': return '😢';
    case 'angry': return '😠';
    case 'tsundere': return '😤';
    case 'shy': return '😳';
    case 'warm': return '🤗';
    case 'neutral': return '😐';
    default: return '✨';
  }
}

export function ChatMessageList({
  messages,
  currentPersona,
  loading,
  bottomRef,
}: ChatMessageListProps) {
  return (
    <div className="chat-messages">
      {messages.length === 0 && (
        <div className="empty-hint">
          {currentPersona
            ? `开始和 ${currentPersona.name} 对话吧`
            : '请选择一个角色开始对话'}
        </div>
      )}
      {messages.map((message) => (
        <div key={message.id} className={`msg-bubble ${message.role}`}>
          {message.role === 'assistant' && currentPersona && (
            <div className="sender-name">{currentPersona.name}</div>
          )}
          {message.role === 'user' && (
            <div className="sender-name">你</div>
          )}
          <div className="message-content">{message.content}</div>
          {message.role === 'assistant' && message.emotion && (
            <div className="emotion-badge" title={`AI 当前情绪：${message.emotion}`}>
              <span>{getEmotionEmoji(message.emotion)}</span>
              <span>{message.emotion}</span>
            </div>
          )}
          {message.role === 'assistant' && (
            <button
              className="tts-play-btn"
              onClick={() => {
                // ✅ 使用 TTSManager 播放
                ttsManager.playText(message.content);
              }}
              title="语音朗读"
              disabled={!ttsManager.isEnabled()}
              style={{
                marginTop: 6,
                padding: '4px 10px',
                fontSize: 12,
                borderRadius: 6,
                border: '1px solid #d7a78a',
                background: ttsManager.isEnabled() ? 'transparent' : '#f5f5f5',
                color: ttsManager.isEnabled() ? '#8b7262' : '#bbb',
                cursor: ttsManager.isEnabled() ? 'pointer' : 'not-allowed',
              }}
            >
              {ttsManager.isEnabled() ? '🔊 朗读' : '🔇 已关闭'}
            </button>
          )}
        </div>
      ))}
      {loading && <div className="typing-cursor" />}
      <div ref={bottomRef} />
    </div>
  );
}