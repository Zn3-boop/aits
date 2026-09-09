export type LlamaCppChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LlamaCppChatInput = {
  baseUrl: string;
  model: string;
  messages: LlamaCppChatMessage[];
};

export type LlamaCppChatOutput = {
  model: string;
  reply: string;
  raw: Record<string, unknown>;
};

const joinMessages = (messages: LlamaCppChatMessage[]) =>
  messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n\n');

export const requestLlamaCppChat = async (input: LlamaCppChatInput): Promise<LlamaCppChatOutput> => {
  const response = await fetch(`${input.baseUrl.replace(/\/$/, '')}/completion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: joinMessages(input.messages),
      n_predict: 512,
      temperature: 0.7,
      stop: ['USER:', 'SYSTEM:']
    })
  });

  if (!response.ok) {
    throw new Error(`LLAMACPP_HTTP_${response.status}`);
  }

  const data = (await response.json()) as { content?: string } & Record<string, unknown>;
  const reply = typeof data.content === 'string' ? data.content.trim() : '';
  if (!reply) {
    throw new Error('LLAMACPP_EMPTY_RESPONSE');
  }

  return {
    model: input.model,
    reply,
    raw: data
  };
};
