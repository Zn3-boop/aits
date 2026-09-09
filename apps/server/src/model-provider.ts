/**
 * 模型提供者
 * 支持 Ollama 本地模型 + OpenAI 兼容接口（MiniMax / 硅基流动 / OpenRouter）
 * 包含流式输出 + 5分钟超时保护 + 诊断日志
 */

import { z } from 'zod';
import { logger } from './utils/logger.js';

// Ollama 流式响应 schema — content 可以为 null
const ollamaChunkSchema = z.object({
  message: z.object({
    role: z.string(),
    content: z.string().nullable().optional(),
  }).optional(),
  done: z.boolean().optional(),
  error: z.string().optional(),
});

// OpenAI 兼容流式响应 schema
const openaiChunkSchema = z.object({
  choices: z.array(z.object({
    delta: z.object({ content: z.string().nullable().optional() }).optional(),
    finish_reason: z.string().nullable().optional(),
  })).optional(),
  error: z.object({ message: z.string() }).optional(),
});

export interface ModelReplyResult {
  reply: string;
  provider: string;
  model: string;
  usedFallback: boolean;
  raw?: any;
}

export interface StreamingChunk {
  token: string;
  done: boolean;
  error?: string;
}

export interface ModelOptions {
  baseUrl: string;
  model: string;
  provider: string;
  apiKey?: string;
  messages: Array<{ role: string; content: string }>;
  fallbackReply: string;
}

/**
 * 非流式生成（兼容旧代码）
 */
export async function generateModelReply(options: {
  baseUrl: string;
  model: string;
  provider: string;
  apiKey?: string;
  messages: Array<{ role: string; content: string }>;
  fallbackReply: string;
}): Promise<ModelReplyResult> {
  const { baseUrl, model, provider, apiKey, messages, fallbackReply } = options;

  try {
    let url: string;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: any;

    if (provider === 'ollama') {
      url = `${baseUrl}/api/chat`;
      body = { model, messages, stream: false, options: { temperature: 0.7, num_predict: 128 } };
    } else {
      // 智能构建 URL：避免 /v1/v1/ 重复
      const normalizedBase = baseUrl.replace(/\/v1\/?$/, '');
      url = `${normalizedBase}/v1/chat/completions`;
      headers['Authorization'] = `Bearer ${apiKey || process.env.MODEL_API_KEY || ''}`;
      body = { model, messages, stream: false, temperature: 0.7 };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000);

    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify(body),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = await response.json();

    if (provider === 'ollama') {
      const reply = data.message?.content || fallbackReply;
      return { reply, provider, model, usedFallback: !data.message?.content, raw: data };
    } else {
      const reply = data.choices?.[0]?.message?.content || fallbackReply;
      return { reply, provider, model, usedFallback: !data.choices?.[0]?.message?.content, raw: data };
    }
  } catch (error) {
    logger.error('[ModelProvider] Non-stream error:', String(error));
    return { reply: fallbackReply, provider, model, usedFallback: true, raw: error };
  }
}

/**
 * 流式生成 — 自动识别 Ollama 或 OpenAI 兼容协议
 */
export async function* generateModelReplyStream(options: {
  baseUrl: string;
  model: string;
  provider: string;
  apiKey?: string;
  messages: Array<{ role: string; content: string }>;
  fallbackReply: string;
}): AsyncGenerator<StreamingChunk, void, unknown> {
  const { baseUrl, model, provider, apiKey, messages, fallbackReply } = options;

  try {
    if (provider === 'ollama') {
      yield* ollamaStream(baseUrl, model, messages);
    } else {
      yield* openaiCompatibleStream(baseUrl, model, messages, apiKey);
    }
  } catch (error) {
    logger.error('[ModelProvider] Fatal streaming error:', String(error));
    yield { token: fallbackReply, done: false };
    yield { token: '', done: true, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Ollama 流式生成
 */
async function* ollamaStream(baseUrl: string, model: string, messages: Array<{ role: string; content: string }>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000);

  logger.info('[ModelProvider] Ollama streaming to', `${baseUrl}/api/chat`, 'model=', model);

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      options: {
        temperature: 0.7,
        num_predict: 128,
        top_p: 0.9,
        stop: ['<|im_end|>', 'User:', 'Assistant:'],
      },
    }),
  });

  if (!response.ok) {
    clearTimeout(timeout);
    const text = await response.text().catch(() => '');
    throw new Error(`Ollama HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  logger.info('[ModelProvider] Ollama HTTP 200, reading stream...');

  const reader = response.body?.getReader();
  if (!reader) {
    clearTimeout(timeout);
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let fullContent = '';
  let tokenCount = 0;
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      logger.info('[ModelProvider] Stream reader done');
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed);
        const data = ollamaChunkSchema.parse(parsed);

        if (data.error) {
          clearTimeout(timeout);
          logger.error('[ModelProvider] Ollama error in stream:', data.error);
          yield { token: '', done: false, error: data.error };
          return;
        }

        // 关键修复：content 可能为 null，需要过滤
        const content = data.message?.content;
        if (content) {
          fullContent += content;
          tokenCount++;
          yield { token: content, done: false };
        }

        if (data.done) {
          clearTimeout(timeout);
          logger.info(`[ModelProvider] Stream complete, ${tokenCount} tokens, ${fullContent.length} chars`);
          yield { token: '', done: true };
          return;
        }
      } catch (parseErr) {
        logger.warn('[ModelProvider] Parse failed:', (parseErr as Error).message, 'Line:', trimmed.slice(0, 100));
      }
    }
  }

  clearTimeout(timeout);

  // 流自然结束（Ollama 有时不发 done 标志）
  if (fullContent) {
    logger.info(`[ModelProvider] Stream ended naturally, ${tokenCount} tokens`);
    yield { token: '', done: true };
  } else {
    logger.warn('[ModelProvider] No content received from Ollama');
    yield { token: '', done: true, error: 'No content received' };
  }
}

/**
 * OpenAI 兼容协议流式生成（MiniMax / 硅基流动 / OpenRouter）
 */
async function* openaiCompatibleStream(baseUrl: string, model: string, messages: Array<{ role: string; content: string }>, apiKey?: string) {
  const effectiveApiKey = apiKey || process.env.MODEL_API_KEY || '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  // 智能构建 URL：避免 /v1/v1/ 或 /v1/chat/completions 重复
  const normalizedBase = baseUrl.replace(/\/v1\/?$/, ''); // 去掉末尾的 /v1 或 /v1/
  const apiPath = '/v1/chat/completions';
  const fullUrl = `${normalizedBase}${apiPath}`;

  logger.info('[ModelProvider] OpenAI-compatible streaming to', fullUrl, 'model=', model);

  const response = await fetch(fullUrl, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${effectiveApiKey}`,
    },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.7 }),
  });

  if (!response.ok) {
    clearTimeout(timeout);
    const text = await response.text().catch(() => '');
    throw new Error(`LLM HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  logger.info('[ModelProvider] OpenAI-compatible HTTP 200, reading stream...');

  const reader = response.body?.getReader();
  if (!reader) {
    clearTimeout(timeout);
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let fullContent = '';
  let tokenCount = 0;
  let buffer = '';
  let hasToken = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (json === '[DONE]') {
        clearTimeout(timeout);
        yield { token: '', done: true };
        return;
      }

      try {
        const data = openaiChunkSchema.parse(JSON.parse(json));
        if (data.error) throw new Error(data.error.message);
        const content = data.choices?.[0]?.delta?.content;
        if (content) {
          hasToken = true;
          fullContent += content;
          tokenCount++;
          yield { token: content, done: false };
        }
        if (data.choices?.[0]?.finish_reason) {
          clearTimeout(timeout);
          logger.info(`[ModelProvider] OpenAI stream complete, ${tokenCount} tokens, ${fullContent.length} chars`);
          yield { token: '', done: true };
          return;
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  clearTimeout(timeout);
  if (!hasToken) {
    logger.warn('[ModelProvider] No content received from OpenAI-compatible API');
    yield { token: '', done: true, error: 'No content received' };
  } else {
    yield { token: '', done: true };
  }
}