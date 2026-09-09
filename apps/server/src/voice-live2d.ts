import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from './utils/logger.js';
import { tmpdir } from 'node:os';
import type {
  Live2DSessionState,
  VoiceCloneJob,
  VoiceEngineProvider,
  VoiceJobStatus,
  VoiceSynthesisResult,
  VisemeFrame
} from '@lpm/shared';

const execAsync = promisify(execFile);

const userDataRoot = path.resolve(process.cwd(), '../../data/users');
const voiceBaseUrl = 'edge-tts'; // 使用 Edge TTS
const pythonPath = process.env.PYTHON_PATH || 'python';
const live2dModelRoot = process.env.LIVE2D_MODEL_ROOT ?? '/models/cubism/haru';

const buildUserDir = (userId: string) => path.join(userDataRoot, userId, 'voice');
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const buildVisemes = (text: string): VisemeFrame[] => {
  const steps = Math.max(4, Math.min(12, text.length || 4));
  return Array.from({ length: steps }, (_, index) => ({
    time: Number((index * 0.12).toFixed(2)),
    value: Number(((Math.sin(index) + 1) / 2).toFixed(2))
  }));
};

export const createLive2DSession = async (userId: string): Promise<Live2DSessionState> => {
  const sessionId = randomUUID();
  const modelId = `${userId}-assistant-default`;
  const modelPath = `${live2dModelRoot}/${modelId}.model3.json`;
  const ttsStreamUrl = `/api/live2d/session/${sessionId}/tts-stream`;
  const visemes = buildVisemes('你好，欢迎来到 LPM AI Companion');

  return {
    sessionId,
    userId,
    runtime: 'cubism-web-sdk',
    modelId,
    modelPath,
    motionGroup: 'Idle',
    expression: 'warm-smile',
    lipSyncMode: 'viseme-stream',
    ttsStreamUrl,
    faceTracking: {
      provider: 'mediapipe-face-mesh',
      enabled: true
    },
    pose: {
      yaw: 0,
      pitch: 0,
      roll: 0
    },
    visemes,
    avatarModel: {
      id: modelId,
      path: modelPath,
      runtime: 'cubism-web-sdk',
      idleMotionGroup: 'Idle',
      defaultExpression: 'warm-smile',
      previewImage: `${live2dModelRoot}/${modelId}.png`
    },
    lipSyncSource: {
      mode: 'tts-viseme',
      ttsStreamUrl,
      visemeFrames: visemes,
      audioSampleRate: 32000
    },
    multiUserScope: {
      userId,
      personaKey: `${userId}:persona:default`,
      voiceProfileKey: `${userId}:voice:default`,
      storageRoot: path.join(userDataRoot, userId)
    },
    runtimeNotes: {
      renderer: 'frontend-driven',
      note: 'Server returns Cubism session metadata, user-isolated resource scope and viseme frames for frontend orchestration.',
      nextStep: 'Replace placeholder model metadata with real Cubism assets and MediaPipe-driven motion mapping.'
    }
  };
};

export const createVoiceCloneJob = async (
  userId: string,
  sampleCount: number,
  sampleFiles: Array<{
    filename: string;
    contentBase64: string;
    mimeType: 'audio/wav' | 'audio/mpeg' | 'audio/mp4' | 'audio/x-m4a';
    size: number;
    durationSec: number;
  }>
): Promise<VoiceCloneJob> => {
  const now = new Date().toISOString();
  const jobId = randomUUID();
  const userVoiceDir = buildUserDir(userId);
  await mkdir(userVoiceDir, { recursive: true });

  const limitedSamples = sampleFiles.slice(0, sampleCount);
  const sourceFiles: string[] = [];

  for (const file of limitedSamples) {
    const safeName = `${jobId}-${sha256(file.filename).slice(0, 12)}.wav`;
    const absolutePath = path.join(userVoiceDir, safeName);
    await writeFile(absolutePath, Buffer.from(file.contentBase64, 'base64'));
    sourceFiles.push(absolutePath);
  }

  const status: VoiceJobStatus = sourceFiles.length >= 3 ? 'completed' : 'failed';
  const provider: VoiceEngineProvider = 'edge-tts';

  return {
    jobId,
    userId,
    provider,
    status,
    sourceFiles,
    createdAt: now,
    updatedAt: now,
    outputVoiceId: status === 'completed' ? `${userId}-${jobId}` : undefined,
    error: status === 'failed' ? 'At least 3 samples are required for local voice cloning bootstrap.' : undefined,
    upload: {
      acceptedFormats: ['audio/wav', 'audio/mp3', 'audio/m4a'],
      minSamples: 3,
      recommendedDurationSec: 20,
      targetSampleRate: 32000
    },
    storage: {
      userVoiceDir,
      isolationKey: `${userId}:voice:${jobId}`
    },
    nextAction: status === 'completed' ? 'ready-for-synthesis' : 'upload-more-samples'
  };
};

/**
 * 使用 Edge TTS 合成语音
 */
export const synthesizeSpeech = async (
  userId: string,
  text: string,
  voiceId?: string
): Promise<VoiceSynthesisResult> => {
  const requestId = randomUUID();
  const selectedVoice = voiceId || 'zh-CN-XiaoxiaoNeural';
  
  // 使用系统临时目录
  const tempDir = path.join(tmpdir(), 'aits-tts');
  await mkdir(tempDir, { recursive: true });
  const tempFile = path.join(tempDir, `${requestId}.mp3`);

  try {
    // 调用 Python edge-tts
    await execAsync(pythonPath, [
      '-m', 'edge_tts',
      '--text', text.substring(0, 500),
      '--voice', selectedVoice,
      '--write-media', tempFile,
    ], {
      timeout: 30000,
    });

    // 返回内部合成端点，前端调用此端点获取音频
    const audioUrl = `/api/tts/synthesize?voiceId=${encodeURIComponent(selectedVoice)}`;

    return {
      requestId,
      userId,
      provider: 'edge-tts',
      text,
      audioUrl,
      mimeType: 'audio/mpeg',
      sampleRate: 24000,
      visemes: buildVisemes(text)
    };
  } catch (error) {
    logger.error('[EdgeTTS] Synthesis failed:', String(error));
    throw new Error(`语音合成失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
};