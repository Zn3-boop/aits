/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { AuthContext } from '../main';
import type { Persona, Chat, Message } from '../types/index';
import { apiFetch, clearAuth } from '../utils/auth';
import { logger } from '../utils/logger';

// ============================================================
// Context 类型定义
// ============================================================

interface ChatState {
  currentPersona: Persona | null;
  currentChat: Chat | null;
  messages: Message[];
  chats: Chat[];
  isSwitching: boolean;
}

interface ChatActions {
  setCurrentPersona: (persona: Persona | null) => void;
  setCurrentChat: (chat: Chat | null) => void;
  setMessages: (messages: Message[]) => void;
  setChats: (chats: Chat[]) => void;
  setIsSwitching: (isSwitching: boolean) => void;
  switchPersona: (personaId: string) => Promise<void>;
  loadRecentChat: (personaId: string) => Promise<void>;
  switchChat: (chatId: string) => Promise<void>;
  createChat: (personaId: string, title?: string) => Promise<Chat>;
  deleteChat: (chatId: string) => Promise<void>;
  restoreChat: (chatId: string) => Promise<void>;
}

// 保持向后兼容的完整类型
interface ChatContextType extends ChatState, ChatActions {}

const ChatStateContext = createContext<ChatState | undefined>(undefined);
const ChatActionsContext = createContext<ChatActions | undefined>(undefined);

// 向后兼容：保留原始Context用于useChat hook
const ChatContext = createContext<ChatContextType | undefined>(undefined);

// ============================================================
// useChat Hook - 保持原有接口
// ============================================================

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

// ============================================================
// 辅助函数
// ============================================================

const handleAuthError = (error: Error, logout: () => void) => {
  if (error.message.includes('登录已过期')) {
    logout();
    window.location.href = '/login';
    return true;
  }
  return false;
};

// ============================================================
// ChatProvider - 使用拆分后的Context
// ============================================================

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const authContext = useContext(AuthContext);
  const logout = authContext?.logout || (() => { clearAuth(); window.location.href = '/login'; });

  // 状态 - 使用独立state便于优化
  const [currentPersona, setCurrentPersona] = useState<Persona | null>(null);
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [isSwitching, setIsSwitching] = useState(false);

  // ============================================================
  // 动作函数 - 使用 useCallback 包裹
  // ============================================================

  const loadRecentChat = useCallback(async (personaId: string) => {
    setIsSwitching(true);
    try {
      const [personaRes, chatsRes] = await Promise.all([
        apiFetch(`/api/personas/${personaId}`),
        apiFetch(`/api/chats?personaId=${personaId}`)
      ]);

      if (!personaRes.ok || !chatsRes.ok) {
        throw new Error('加载数据失败');
      }

      const persona = await personaRes.json();
      const { chats: chatsData } = await chatsRes.json();

      setCurrentPersona(persona);
      setChats(chatsData || []);

      if (chatsData && chatsData.length > 0) {
        const recentChat = chatsData[0];
        const messagesRes = await apiFetch(`/api/chats/${recentChat.id}/messages`);

        if (messagesRes.ok) {
          const messagesData = await messagesRes.json();
          setCurrentChat(recentChat);
          setMessages(messagesData || []);
        }
      } else {
        setCurrentChat(null);
        setMessages([]);
      }
    } catch (error) {
      logger.error('加载对话失败:', error);
      if (error instanceof Error && handleAuthError(error, logout)) return;
      throw error;
    } finally {
      setIsSwitching(false);
    }
  }, [logout]);

  const switchPersona = useCallback(async (personaId: string) => {
    setIsSwitching(true);
    try {
      const [personaRes, chatsRes] = await Promise.all([
        apiFetch(`/api/personas/${personaId}`),
        apiFetch(`/api/chats?personaId=${personaId}`)
      ]);

      if (!personaRes.ok || !chatsRes.ok) {
        throw new Error('切换角色失败');
      }

      const persona = await personaRes.json();
      const { chats: chatsData } = await chatsRes.json();

      setCurrentPersona(persona);
      setChats(chatsData || []);

      if (chatsData && chatsData.length > 0) {
        const recentChat = chatsData[0];
        const messagesRes = await apiFetch(`/api/chats/${recentChat.id}/messages`);

        if (messagesRes.ok) {
          const messagesData = await messagesRes.json();
          setCurrentChat(recentChat);
          setMessages(messagesData || []);
        }
      } else {
        setCurrentChat(null);
        setMessages([]);
      }
    } catch (error) {
      logger.error('切换角色失败:', error);
      if (error instanceof Error && handleAuthError(error, logout)) return;
      throw error;
    } finally {
      setIsSwitching(false);
    }
  }, [logout]);

  const switchChat = useCallback(async (chatId: string) => {
    setIsSwitching(true);
    try {
      const chat = chats.find(c => c.id === chatId) || null;

      const messagesRes = await apiFetch(`/api/chats/${chatId}/messages`);
      if (!messagesRes.ok) throw new Error('加载聊天记录失败');

      const { messages: messagesData } = await messagesRes.json();
      setCurrentChat(chat);
      setMessages(messagesData || []);
    } catch (error) {
      logger.error('切换聊天失败:', error);
      if (error instanceof Error && handleAuthError(error, logout)) return;
      throw error;
    } finally {
      setIsSwitching(false);
    }
  }, [logout, chats]);

  const createChat = useCallback(async (personaId: string, title?: string): Promise<Chat> => {
    const res = await apiFetch('/api/chats', {
      method: 'POST',
      body: JSON.stringify({ personaId, title })
    });

    if (!res.ok) {
      throw new Error('创建聊天失败');
    }

    const { chat } = await res.json();
    setChats(prev => [chat, ...prev]);
    setCurrentChat(chat);
    setMessages([]);
    return chat;
  }, []);

  const deleteChat = useCallback(async (chatId: string) => {
    const res = await apiFetch(`/api/chats/${chatId}`, { method: 'DELETE' });

    if (!res.ok) {
      throw new Error('删除聊天失败');
    }

    setChats(prev => prev.filter(c => c.id !== chatId));
    if (currentChat?.id === chatId) {
      setCurrentChat(null);
      setMessages([]);
    }
  }, [currentChat?.id]);

  const restoreChat = useCallback(async (chatId: string) => {
    const res = await apiFetch(`/api/chats/${chatId}/restore`, { method: 'POST' });

    if (!res.ok) {
      throw new Error('恢复聊天失败');
    }

    // 重新加载聊天列表
    if (currentPersona) {
      const chatsRes = await apiFetch(`/api/chats?personaId=${currentPersona.id}`);
      if (chatsRes.ok) {
        const { chats: chatsData } = await chatsRes.json();
        setChats(chatsData || []);
      }
    }
  }, [currentPersona]);

  // ============================================================
  // 创建拆分后的 Context 值
  // ============================================================

  const stateValue = useMemo<ChatState>(() => ({
    currentPersona,
    currentChat,
    messages,
    chats,
    isSwitching,
  }), [currentPersona, currentChat, messages, chats, isSwitching]);

  const actionsValue = useMemo<ChatActions>(() => ({
    setCurrentPersona,
    setCurrentChat,
    setMessages,
    setChats,
    setIsSwitching,
    switchPersona,
    loadRecentChat,
    switchChat,
    createChat,
    deleteChat,
    restoreChat,
  }), [
    switchPersona,
    loadRecentChat,
    switchChat,
    createChat,
    deleteChat,
    restoreChat,
  ]);

  // 向后兼容的完整Context值
  const fullContextValue = useMemo<ChatContextType>(() => ({
    ...stateValue,
    ...actionsValue,
  }), [stateValue, actionsValue]);

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <ChatStateContext.Provider value={stateValue}>
      <ChatActionsContext.Provider value={actionsValue}>
        <ChatContext.Provider value={fullContextValue}>
          {children}
        </ChatContext.Provider>
      </ChatActionsContext.Provider>
    </ChatStateContext.Provider>
  );
};

// ============================================================
// 导出拆分后的 Hooks（可选使用）
// ============================================================

export const useChatState = () => {
  const context = useContext(ChatStateContext);
  if (context === undefined) {
    throw new Error('useChatState must be used within a ChatProvider');
  }
  return context;
};

export const useChatActions = () => {
  const context = useContext(ChatActionsContext);
  if (context === undefined) {
    throw new Error('useChatActions must be used within a ChatProvider');
  }
  return context;
};