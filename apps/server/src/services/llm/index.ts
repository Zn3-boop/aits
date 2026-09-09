import { OllamaProvider } from './ollama-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import type { LlmProvider } from './types.js';
export type { LlmProvider } from './types.js';

export type LlmProviderType = 'ollama' | 'openai';

export interface LlmProviderConfig {
  type: LlmProviderType;
  ollamaUrl?: string;
  ollamaModel?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
}

/**
 * 创建LLM Provider工厂函数
 */
export function createLlmProvider(config: LlmProviderConfig): LlmProvider {
  switch (config.type) {
    case 'ollama':
      return new OllamaProvider(
        config.ollamaUrl || 'http://localhost:11434',
        config.ollamaModel || 'llama3.1:8b'
      );

    case 'openai':
      if (!config.openaiApiKey) {
        throw new Error('OpenAI Provider 需要提供 API Key');
      }
      return new OpenAIProvider(
        config.openaiApiKey,
        config.openaiBaseUrl || 'https://api.openai.com/v1',
        config.openaiModel || 'gpt-3.5-turbo'
      );

    default:
      throw new Error(`Unknown LLM provider type: ${config.type}`);
  }
}