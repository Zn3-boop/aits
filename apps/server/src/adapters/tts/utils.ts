/**
 * TTS 工具函数
 * 用于标准化不同 TTS 提供者的数据格式
 */

export interface WordBoundary {
  offset_ms: number;      // 词开始时间（毫秒）
  duration_ms: number;    // 词持续时间
  text: string;           // 词内容
}

/**
 * 标准化 Edge TTS 的词边界格式
 * @param raw Edge TTS 原始词边界数据
 * @returns 标准化的词边界数组
 */
export function normalizeEdgeTtsBoundaries(raw: any[]): WordBoundary[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(b => b != null) // 过滤掉 null/undefined
    .map(b => ({
      offset_ms: b.offset || b.audio_offset || 0,
      duration_ms: b.duration || 100,
      text: b.text || b.word || ''
    }))
    .filter(b => b.text.trim().length > 0); // 过滤掉空文本
}

/**
 * 标准化 Python TTS 的词边界格式
 * @param raw Python TTS 原始词边界数据
 * @returns 标准化的词边界数组
 */
export function normalizePythonTtsBoundaries(raw: any[]): WordBoundary[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(b => b != null)
    .map(b => ({
      offset_ms: b.offset || b.time || 0,
      duration_ms: b.duration || 100,
      text: b.text || b.word || ''
    }))
    .filter(b => b.text.trim().length > 0);
}
