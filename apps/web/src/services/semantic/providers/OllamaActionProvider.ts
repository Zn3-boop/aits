/**
 * OllamaActionProvider - Ollama LLM 动作生成器
 *
 * IActionLlmProvider 的 Ollama 实现。
 * 切换别的模型（OpenAI/通义千问/自建API），只需新写一个类实现同样接口，
 * 上层 SemanticActionMapper 代码完全不动。
 */

import type { IActionLlmProvider } from '../../lib/SemanticActionMapper';

interface OllamaConfig {
  baseUrl: string;
  model: string;
  timeout: number;
}

const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  baseUrl: 'http://localhost:11434',
  model: 'qwen2.5:3b',
  timeout: 8000,
};

export class OllamaActionProvider implements IActionLlmProvider {
  private config: OllamaConfig;

  constructor(config?: Partial<OllamaConfig>) {
    this.config = { ...DEFAULT_OLLAMA_CONFIG, ...config };
  }

  async generateActionIds(
    context: string,
    faceEmotion: string,
    availableActionIds: string[]
  ): Promise<string[]> {
    const prompt = `你是Live2D动作选择器。
只允许从给定动作ID列表挑选，禁止创造不存在的动作。
可用动作列表：${JSON.stringify(availableActionIds)}

对话上下文：${context}
当前人脸检测情绪：${faceEmotion}

输出严格JSON数组，示例：["nod","smileLight"]
不要输出任何解释、markdown，只返回JSON。`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const resp = await fetch(`${this.config.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          prompt,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!resp.ok) return [];

      const data = await resp.json();
      const text: string = data.response || '';

      const jsonMatch = text.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];

      return parsed.filter((id): id is string => typeof id === 'string');
    } catch {
      return [];
    }
  }
}