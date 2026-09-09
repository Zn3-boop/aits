import type { LlmProvider, LlmMessage, LlmResponse } from './types.js';
import { logger } from '../../utils/logger.js';

export class OllamaProvider implements LlmProvider {
  private baseUrl: string;
  private modelName: string;

  constructor(baseUrl: string = 'http://localhost:11434', modelName: string = 'llama3.1:8b') {
    this.baseUrl = baseUrl;
    this.modelName = modelName;
  }

  async chat(messages: LlmMessage[], systemPrompt: string): Promise<LlmResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages
          ],
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json() as any;

      return {
        reply: data.message?.content || '',
        emotion: this.extractEmotion(data.message?.content || '')
      };
    } catch (error) {
      logger.error('Ollama chat error:', String(error));
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  private extractEmotion(text: string): string {
    // 简单的情绪提取逻辑，可以根据需要扩展
    const emotionKeywords: Record<string, string[]> = {
      'happy': ['开心', '高兴', '快乐', '哈哈', '嘻嘻'],
      'sad': ['难过', '伤心', '哭泣', '呜呜'],
      'shy': ['害羞', '脸红', '不好意思'],
      'tsundere': ['哼', '才不是', '笨蛋'],
      'warm': ['温柔', '温暖', '关心', '体贴']
    };

    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return emotion;
      }
    }

    return 'neutral';
  }
}