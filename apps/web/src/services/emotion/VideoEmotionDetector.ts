import type { VideoEmotionData, EmotionType } from "../multimodal/MultimodalEmotionFusion";

export class VideoEmotionDetector {
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private running = false;
  private rafId = 0;
  private onResult: ((data: VideoEmotionData | null) => void) | null = null;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 160;
    this.canvas.height = 120;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;
  }

  async start(videoEl: HTMLVideoElement, onResult: (data: VideoEmotionData | null) => void) {
    this.video = videoEl;
    this.onResult = onResult;
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.onResult?.(null);
  }

  private loop = () => {
    if (!this.running || !this.video || this.video.readyState < 2) {
      this.rafId = requestAnimationFrame(this.loop);
      return;
    }

    this.ctx.drawImage(this.video, 0, 0, 160, 120);
    const frame = this.ctx.getImageData(0, 0, 160, 120);
    const emotion = this.analyzeFrame(frame.data);

    this.onResult?.(emotion);
    this.rafId = requestAnimationFrame(this.loop);
  };

  private analyzeFrame(data: Uint8ClampedArray): VideoEmotionData {
    let brightnessSum = 0;
    let redSum = 0;

    for (let y = 30; y < 90; y++) {
      for (let x = 40; x < 120; x++) {
        const i = (y * 160 + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        brightnessSum += (r + g + b) / 3;
        redSum += r;
      }
    }

    const sampleCount = 60 * 80;
    const avgBrightness = brightnessSum / sampleCount;
    const redness = redSum / (brightnessSum * 3 + 1);

    let expression: EmotionType = "neutral";
    let intensity = 0.3;

    if (redness > 0.42 && avgBrightness > 100) {
      expression = "happy";
      intensity = Math.min(1.0, redness * 1.5);
    } else if (avgBrightness < 70) {
      expression = "sad";
      intensity = 0.5;
    } else if (redness > 0.45) {
      expression = "excited";
      intensity = 0.7;
    }

    return {
      expression,
      intensity,
    };
  }
}

export const videoEmotionDetector = new VideoEmotionDetector();