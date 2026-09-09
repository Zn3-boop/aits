import type { VoiceEmotionData } from "../multimodal/MultimodalEmotionFusion";

export class VoiceEmotionDetector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private running = false;
  private rafId = 0;
  private onResult: ((data: VoiceEmotionData | null) => void) | null = null;

  private pitchHistory: number[] = [];
  private energyHistory: number[] = [];
  private lastSpeechTime = 0;
  private speechStartTime = 0;
  private syllableCount = 0;

  async start(stream: MediaStream, onResult: (data: VoiceEmotionData | null) => void) {
    this.onResult = onResult;
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;
    this.source.connect(this.analyser);
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.audioContext?.close().catch(() => {});
    this.source?.disconnect();
    this.onResult?.(null);
    this.pitchHistory = [];
    this.energyHistory = [];
  }

  private loop = () => {
    if (!this.running || !this.analyser) return;
    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);
    const { pitch, energy } = this.extractFeatures(buffer);

    if (energy > 0.01) {
      if (this.pitchHistory.length === 0) this.speechStartTime = performance.now();
      this.pitchHistory.push(pitch);
      this.energyHistory.push(energy);
      this.lastSpeechTime = performance.now();
      const prev = this.energyHistory[this.energyHistory.length - 2];
      if (energy > 0.15 && prev && energy > prev * 1.3) this.syllableCount++;
    }

    const speechDuration = performance.now() - this.speechStartTime;
    if (this.pitchHistory.length > 20 && (performance.now() - this.lastSpeechTime > 300 || speechDuration > 500)) {
      this.onResult?.(this.computeEmotion(speechDuration));
      this.pitchHistory = this.pitchHistory.slice(-5);
      this.energyHistory = this.energyHistory.slice(-5);
      this.syllableCount = 0;
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  private extractFeatures(buffer: Float32Array): { pitch: number; energy: number } {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
    const energy = Math.sqrt(sum / buffer.length);
    let pitch = 0;
    if (energy > 0.01) {
      let maxCorr = 0, bestLag = 0;
      for (let lag = 20; lag < 400; lag++) {
        let corr = 0;
        for (let i = 0; i < buffer.length - lag; i++) corr += buffer[i] * buffer[i + lag];
        if (corr > maxCorr) { maxCorr = corr; bestLag = lag; }
      }
      pitch = bestLag > 0 ? this.audioContext!.sampleRate / bestLag : 0;
    }
    return { pitch: Math.min(pitch, 600), energy: Math.min(energy * 5, 1) };
  }

  private computeEmotion(speechDurationMs: number): VoiceEmotionData {
    const pitches = this.pitchHistory.filter(p => p > 50 && p < 500);
    const energies = this.energyHistory;
    const pitchMean = pitches.length ? pitches.reduce((a, b) => a + b, 0) / pitches.length : 150;
    const pitchVariance = pitches.length > 1
      ? Math.sqrt(pitches.reduce((sum, p) => sum + (p - pitchMean) ** 2, 0) / pitches.length) : 0;
    const energyMean = energies.length ? energies.reduce((a, b) => a + b, 0) / energies.length : 0;
    const speechRate = speechDurationMs > 0 ? (this.syllableCount / speechDurationMs) * 1000 : 0;
    return { pitchMean, pitchVariance, energyMean, speechRate };
  }
}

export const voiceEmotionDetector = new VoiceEmotionDetector();