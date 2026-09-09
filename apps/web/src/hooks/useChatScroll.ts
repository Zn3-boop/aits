import { useEffect, useRef } from 'react';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  emotion?: string;
  createdAt?: string;
};

type UseChatScrollOptions = {
  messages: ChatMessage[];
};

export function useChatScroll(options: UseChatScrollOptions) {
  const { messages } = options;
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return { bottomRef };
}