export type OllamaChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OllamaChatInput = {
  baseUrl: string;
  model: string;
  messages: OllamaChatMessage[];
  options?: {
    num_ctx?: number;
    num_predict?: number;
  };
};

export type OllamaChatOutput = {
  model: string;
  reply: string;
  raw: Record<string, unknown>;
};

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/$/, '');

export const requestOllamaChat = async (input: OllamaChatInput): Promise<OllamaChatOutput> => {
  const response = await fetch(`${normalizeBaseUrl(input.baseUrl)}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      stream: false,
      options: {
        num_ctx: input.options?.num_ctx ?? 2048,
        num_predict: input.options?.num_predict ?? 256
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OLLAMA_HTTP_${response.status}`);
  }

  const data = (await response.json()) as {
    model?: string;
    message?: {
      content?: string;
    };
  } & Record<string, unknown>;

  const reply = typeof data.message?.content === 'string' ? data.message.content.trim() : '';
  if (!reply) {
    throw new Error('OLLAMA_EMPTY_RESPONSE');
  }

  return {
    model: typeof data.model === 'string' ? data.model : input.model,
    reply,
    raw: data
  };
};

export async function chat(persona: string, messages: Array<{ role: string; content: string }>) {
  const result = await requestOllamaChat({
    baseUrl: 'http://localhost:11434',
    model: 'qwen2.5:1.5b',
    messages: [{ role: 'system', content: persona }, ...messages].map((message) => ({
      role: (message.role === 'system' || message.role === 'assistant' ? message.role : 'user') as OllamaChatMessage['role'],
      content: message.content
    }))
  });

  return result.reply;
}