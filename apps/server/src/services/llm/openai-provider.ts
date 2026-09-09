import type { LlmProvider, LlmMessage, LlmResponse } from './types.js';

export class OpenAIProvider implements LlmProvider {
  private apiKey: string;
  private baseUrl: string;
  private modelName: string;

  constructor(apiKey: string, baseUrl: string = 'https://api.openai.com/v1', modelName: string = 'gpt-3.5-turbo') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.modelName = modelName;
  }

  async chat(messages: LlmMessage[], systemPrompt: string): Promise<LlmResponse> {
    throw new Error('OpenAI Provider 尚未实现，请使用 Ollama Provider');
  }

  async healthCheck(): Promise<boolean> {
    throw new Error('OpenAI Provider 尚未实现，请使用 Ollama Provider');
  }
}
