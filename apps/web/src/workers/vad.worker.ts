/**
 * VAD Web Worker - 语音活动检测
 * 
 * 使用能量检测算法在后台线程检测语音活动
 */

interface VADConfig {
  sampleRate: number;
  threshold: number;
  frameLength: number;
  smoothingWindow: number;
  speechTimeout: number;
  minSpeechDuration: number;
}

interface VADMessage {
  type: 'start' | 'stop' | 'config' | 'audio';
  payload?: Float32Array | VADConfig | number;
}

interface VADResult {
  type: 'vad_start' | 'vad_stop' | 'vad_data';
  timestamp: number;
  energy?: number;
  duration?: number;
}

const DEFAULT_CONFIG: VADConfig = {
  sampleRate: 16000,
  threshold: 0.02,
  frameLength: 128,
  smoothingWindow: 5,
  speechTimeout: 1500,
  minSpeechDuration: 300,
};

class VADProcessor {
  private config: VADConfig = DEFAULT_CONFIG;
  private energyHistory: number[] = [];
  private isSpeaking = false;
  private speechStartTime = 0;
  private lastSpeechTime = 0;

  configure(config: Partial<VADConfig>): void {
    this.config = { ...this.config, ...config };
    this.energyHistory = [];
  }

  process(audioData: Float32Array): VADResult | null {
    const now = Date.now();
    const energy = this.calculateEnergy(audioData);
    
    this.energyHistory.push(energy);
    if (this.energyHistory.length > this.config.smoothingWindow) {
      this.energyHistory.shift();
    }

    const smoothedEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;

    if (!this.isSpeaking && smoothedEnergy > this.config.threshold) {
      this.isSpeaking = true;
      this.speechStartTime = now;
      this.lastSpeechTime = now;
      
      return { type: 'vad_start', timestamp: now, energy: smoothedEnergy };
    }

    if (this.isSpeaking) {
      this.lastSpeechTime = now;

      if (smoothedEnergy < this.config.threshold) {
        const speechDuration = now - this.speechStartTime;
        
        if (speechDuration >= this.config.minSpeechDuration) {
          this.isSpeaking = false;
          return { type: 'vad_stop', timestamp: now, duration: speechDuration };
        }
        this.isSpeaking = false;
      }
    }

    return null;
  }

  private calculateEnergy(audio: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < audio.length; i++) {
      sum += audio[i] * audio[i];
    }
    return Math.sqrt(sum / audio.length);
  }

  forceStop(): VADResult | null {
    if (this.isSpeaking) {
      const now = Date.now();
      const duration = now - this.speechStartTime;
      this.isSpeaking = false;
      return { type: 'vad_stop', timestamp: now, duration };
    }
    return null;
  }

  reset(): void {
    this.isSpeaking = false;
    this.energyHistory = [];
    this.speechStartTime = 0;
    this.lastSpeechTime = 0;
  }
}

const processor = new VADProcessor();

self.onmessage = (event: MessageEvent<VADMessage>) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'config': {
      if (payload && typeof payload === 'object') {
        processor.configure(payload as Partial<VADConfig>);
      }
      break;
    }
    case 'start': {
      processor.reset();
      break;
    }
    case 'stop': {
      const stopResult = processor.forceStop();
      if (stopResult) {
        self.postMessage(stopResult);
      }
      break;
    }
    case 'audio': {
      if (payload instanceof Float32Array) {
        const result = processor.process(payload);
        if (result) {
          self.postMessage(result);
        }
      }
      break;
    }
  }
};

self.postMessage({ type: 'ready' });
