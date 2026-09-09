/**
 * TTS 服务 - HTTP 代理接口
 * 
 * 这个服务提供 HTTP 接口，实际 TTS 合成通过 /api/tts/synthesize 调用
 * 前端通过这个服务来获取 TTS 能力
 */
import axios from 'axios';

// 配置 - 使用外部 TTS 服务
const TTS_EXTERNAL_URL = process.env.TTS_EXTERNAL_URL || '';
const TTS_USE_EXTERNAL = !!TTS_EXTERNAL_URL;

// 合成语音并返回 MP3 Buffer
export async function synthesizeSpeech(
  text: string,
  voiceId?: string
): Promise<Buffer> {
  try {
    if (TTS_USE_EXTERNAL) {
      // 使用外部 TTS 服务
      const res = await axios.post(TTS_EXTERNAL_URL, {
        text,
        voiceId,
        format: 'mp3',
      }, {
        responseType: 'arraybuffer',
        timeout: 15000,
      });
      return Buffer.from(res.data);
    } else {
      // 使用本地 HTTP TTS（后端自身提供）
      const res = await axios.post('http://localhost:8787/api/tts/synthesize', {
        text,
        voice: voiceId || 'zh-CN-XiaoxiaoNeural',
      }, {
        responseType: 'arraybuffer',
        timeout: 15000,
      });
      return Buffer.from(res.data);
    }
  } catch (error) {
    console.error('[TTS] 合成失败:', error);
    throw error;
  }
}

// 流式合成（对于长文本更高效）
export async function* synthesizeSpeechStream(
  text: string,
  voiceId?: string
): AsyncGenerator<Buffer> {
  // 简化实现：先完整合成再分块
  const audio = await synthesizeSpeech(text, voiceId);
  
  // 分块返回（每块 8KB）
  const chunkSize = 8 * 1024;
  for (let i = 0; i < audio.length; i += chunkSize) {
    yield audio.slice(i, i + chunkSize);
  }
}

// 获取可用音色列表
export function getAvailableVoices() {
  return [
    { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', language: 'zh-CN' },
    { id: 'zh-CN-YunxiNeural', name: '云希', language: 'zh-CN' },
    { id: 'zh-CN-YunyangNeural', name: '云扬', language: 'zh-CN' },
    { id: 'zh-CN-XiaoyiNeural', name: '小艺', language: 'zh-CN' },
    { id: 'en-US-JennyNeural', name: 'Jenny', language: 'en-US' },
    { id: 'en-US-GuyNeural', name: 'Guy', language: 'en-US' },
  ];
}
