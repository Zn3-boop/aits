import type { TtsProvider, TtsResponse } from './types.js';

export class CoquiTtsProvider implements TtsProvider {
  async synthesize(_text: string, _voice: string): Promise<TtsResponse> {
    throw new Error('Coqui TTS 尚未实现，请使用 Edge TTS');
  }

  async getVoices(): Promise<string[]> {
    throw new Error('Coqui TTS 尚未实现，请使用 Edge TTS');
  }

  async healthCheck(): Promise<boolean> {
    throw new Error('Coqui TTS 尚未实现，请使用 Edge TTS');
  }
}