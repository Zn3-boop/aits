import { prisma } from '../db.js';

export interface ChatMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  emotion?: string;
  createdAt: Date;
}

export interface Chat {
  id: string;
  userId: string;
  personaId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages?: ChatMessage[];
}

const mapConversationToChat = (
  conversation: {
    id: string;
    userId: string;
    sessionId: string;
    content: string;
    role: string;
    emotion: string | null;
    createdAt: Date;
  }
): Chat => ({
  id: conversation.sessionId,
  userId: conversation.userId,
  personaId: 'default',
  title: conversation.content.slice(0, 20) + (conversation.content.length > 20 ? '...' : ''),
  createdAt: conversation.createdAt,
  updatedAt: conversation.createdAt,
  messages: []
});

const mapConversationMessage = (conversation: {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  emotion: string | null;
  createdAt: Date;
}): ChatMessage => ({
  id: conversation.id,
  chatId: conversation.sessionId,
  role: conversation.role === 'assistant' ? 'assistant' : 'user',
  content: conversation.content,
  emotion: conversation.emotion ?? undefined,
  createdAt: conversation.createdAt
});

/**
 * 获取用户的所有对话
 */
export async function getUserChats(userId: string, personaId?: string): Promise<Chat[]> {
  const conversations = await prisma.personaConversation.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });

  const grouped = new Map<string, typeof conversations>();
  for (const item of conversations) {
    const list = grouped.get(item.sessionId) ?? [];
    list.push(item);
    grouped.set(item.sessionId, list);
  }

  const chats = Array.from(grouped.entries()).map(([sessionId, items]) => {
    const sorted = [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const chat: Chat = {
      id: sessionId,
      userId: first.userId,
      personaId: personaId ?? 'default',
      title: first.content.slice(0, 20) + (first.content.length > 20 ? '...' : ''),
      createdAt: first.createdAt,
      updatedAt: last.createdAt,
      messages: sorted.map(mapConversationMessage)
    };
    return chat;
  });

  return chats.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * 获取单个对话及其消息
 */
export async function getChatWithMessages(chatId: string): Promise<Chat | null> {
  const conversations = await prisma.personaConversation.findMany({
    where: { sessionId: chatId },
    orderBy: { createdAt: 'asc' }
  });

  if (conversations.length === 0) {
    return null;
  }

  const first = conversations[0]!;
  const last = conversations[conversations.length - 1]!;

  return {
    id: chatId,
    userId: first.userId,
    personaId: 'default',
    title: first.content.slice(0, 20) + (first.content.length > 20 ? '...' : ''),
    createdAt: first.createdAt,
    updatedAt: last.createdAt,
    messages: conversations.map(mapConversationMessage)
  };
}

/**
 * 创建新对话
 */
export async function createChat(userId: string, personaId: string, firstMessage: string): Promise<Chat> {
  const sessionId = `${personaId}-${Date.now()}`;
  const created = await prisma.personaConversation.create({
    data: {
      userId,
      personaId,
      sessionId,
      role: 'user',
      content: firstMessage
    }
  });

  return {
    id: sessionId,
    userId,
    personaId,
    title: firstMessage.slice(0, 20) + (firstMessage.length > 20 ? '...' : ''),
    createdAt: created.createdAt,
    updatedAt: created.createdAt,
    messages: [mapConversationMessage(created)]
  };
}

/**
 * 添加消息到对话
 */
export async function addMessage(
  chatId: string,
  role: 'user' | 'assistant',
  content: string,
  emotion?: string
): Promise<ChatMessage> {
  const created = await prisma.personaConversation.create({
    data: {
      userId: 'system',
      personaId: 'default',
      sessionId: chatId,
      role,
      content,
      emotion
    }
  });

  return mapConversationMessage(created);
}

/**
 * 获取对话的消息（用于Ollama上下文）
 * 限制返回最近N条消息
 */
export async function getRecentMessages(chatId: string, limit: number = 50): Promise<ChatMessage[]> {
  const conversations = await prisma.personaConversation.findMany({
    where: { sessionId: chatId },
    orderBy: { createdAt: 'desc' },
    take: limit
  });

  return conversations.reverse().map(mapConversationMessage);
}

/**
 * 删除对话
 */
export async function deleteChat(chatId: string): Promise<void> {
  await prisma.personaConversation.deleteMany({
    where: { sessionId: chatId }
  });
}

/**
 * 更新对话标题
 */
export async function updateChatTitle(chatId: string, title: string): Promise<Chat> {
  const chat = await getChatWithMessages(chatId);
  if (!chat) {
    throw new Error('Chat not found');
  }

  return {
    ...chat,
    title
  };
}
