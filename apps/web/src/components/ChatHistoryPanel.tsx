import { useState } from 'react';
import { useChat } from '../contexts/ChatContext';
import type { Chat } from '../types/index';
import { logger } from '../utils/logger';
import './ChatHistoryPanel.css';

const groupChatsByDate = (chats: Chat[]) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  return {
    today: chats.filter(c => new Date(c.createdAt) >= today),
    yesterday: chats.filter(c => {
      const d = new Date(c.createdAt);
      return d >= yesterday && d < today;
    }),
    earlier: chats.filter(c => new Date(c.createdAt) < yesterday)
  };
};

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};


export const ChatHistoryPanel = () => {
  const { chats, currentChat, currentPersona, switchChat, createChat, deleteChat, isSwitching } = useChat();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const groupedChats = groupChatsByDate(chats);

  const handleChatClick = async (chatId: string) => {
    if (isSwitching) return;
    try {
      await switchChat(chatId);
    } catch (error) {
      logger.error('切换对话失败:', error);
    }
  };

  const handleNewChat = async () => {
    if (isSwitching || !currentPersona) return;
    try {
      await createChat(currentPersona.id);
    } catch (error) {
      logger.error('创建对话失败:', error);
    }
  };

  const handleDeleteClick = (chatId: string) => {
    setShowDeleteConfirm(chatId);
  };

  const handleDeleteConfirm = async () => {
    if (!showDeleteConfirm) return;
    try {
      await deleteChat(showDeleteConfirm);
      setShowDeleteConfirm(null);
    } catch (error) {
      logger.error('删除对话失败:', error);
    }
  };

  const renderChatItem = (chat: Chat) => (
    <div
      key={chat.id}
      className={`chat-item ${currentChat?.id === chat.id ? 'active' : ''}`}
      onClick={() => handleChatClick(chat.id)}
    >
      <div className="chat-content">
        <span className="chat-title">{chat.title}</span>
        <span className="chat-time">{formatTime(chat.createdAt)}</span>
      </div>
      {showDeleteConfirm === chat.id ? (
        <div className="delete-confirm">
          <span>确定删除？</span>
          <button
            className="confirm-delete"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteConfirm();
            }}
          >
            确定
          </button>
          <button
            className="cancel-delete"
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(null);
            }}
          >
            取消
          </button>
        </div>
      ) : (
        <button
          className="delete-chat"
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteClick(chat.id);
          }}
        >
          ×
        </button>
      )}
    </div>
  );

  return (
    <div className="chat-history-panel">
      <div className="chat-history-header">
        <button className="back-button">←</button>
        <h2>对话记录</h2>
      </div>

      <div className="current-persona">
        <span>当前角色：</span>
        <strong>{currentPersona?.name || '未选择'}</strong>
      </div>

      <div className="chat-list">
        {groupedChats.today.length > 0 && (
          <>
            <div className="date-group">── 今天 ──</div>
            {groupedChats.today.map(renderChatItem)}
          </>
        )}

        {groupedChats.yesterday.length > 0 && (
          <>
            <div className="date-group">── 昨天 ──</div>
            {groupedChats.yesterday.map(renderChatItem)}
          </>
        )}

        {groupedChats.earlier.length > 0 && (
          <>
            <div className="date-group">── 更早 ──</div>
            {groupedChats.earlier.map(renderChatItem)}
          </>
        )}

        {chats.length === 0 && (
          <div className="empty-state">
            暂无对话，点击新建开始和{currentPersona?.name || '角色'}聊天
          </div>
        )}
      </div>

      <button className="new-chat-button" onClick={handleNewChat} disabled={isSwitching}>
        + 新对话
      </button>
    </div>
  );
};