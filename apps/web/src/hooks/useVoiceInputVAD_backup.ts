import { useState, useRef, useCallback, useEffect } from 'react';
import { apiFetch } from '../utils/auth';
import { logger } from '../utils/logger';

interface UseVoiceInputOptions {
  onResult?: (text: string) => void;
  onError?: (err: string) => void;
  lang?: string;
  maxDuration?: number;
}

interface UseVoiceInputReturn {
  isListening: boolean;
  interimTranscript: string;
  isSupported: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  duration: number;
}

const MAX_RECORDING_DURATION = 60_000;

/**
 * 语音输入 Hook —— 基于 faster-whisper
 * 
 * 优先策略：麦克风录音 → 后端 Whisper 识别（不依赖 Google 服务器）
 * 无降级：麦克风不可用时直接报错
 */
export function useVoiceInput(optionsOrCallback: UseVoiceInputOptions | ((text: string) => void) = {}): UseVoiceInputReturn {
  const options: UseVoiceInputOptions = typeof optionsOrCallback === 'function'
    ? { onResult: optionsOrCallback }
    : optionsOrCallback;

  const { onResult, onError, maxDuration = MAX_RECORDING_DURATION } = options;

  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSupported] = useState(() => 
    typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
  );
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isStoppingRef = useRef(false);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // ========== 后端 Whisper 识别 ==========
  const transcribeWithBackend = useCallback(async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      const ext = audioBlob.type.includes('webm') ? 'webm' : audioBlob.type.includes('mp4') ? 'mp4' : 'wav';
      formData.append('audio', audioBlob, `recording.${ext}`);

      const response = await apiFetch('/api/stt/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (response.status === 503) {
        throw new Error('语音识别服务未启动，请在后端配置 Whisper 或 FunASR');
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error((errData as { message?: string }).message || `STT 请求失败: ${response.status}`);
      }

      const data = await response.json();
      if (data.text && data.text.trim()) {
        onResultRef.current?.(data.text.trim());
      } else {
        const msg = '未能识别到语音内容，请重试';
        setError(msg);
        onErrorRef.current?.(msg);
      }
    } catch (err) {
      logger.error('[Voice] Whisper 识别失败:', err);
      const msg = err instanceof Error ? err.message : '语音识别失败，请检查 Whisper 服务是否运行';
      setError(msg);
      onErrorRef.current?.(msg);
    }
  }, []);

  // ========== 开始录音（faster-whisper 模式）==========
  const startListening = useCallback(async () => {
    if (isListening) return;
    
    isStoppingRef.current = false;
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : 'audio/mp4',
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // 停止所有音轨
        stream.getTracks().forEach(track => track.stop());

        if (isStoppingRef.current) {
          // 用户主动停止，发送录音到后端识别
          if (chunksRef.current.length > 0) {
            const audioBlob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
            transcribeWithBackend(audioBlob);
          }
        }

        setIsListening(false);
        setInterimTranscript('');
      };

      mediaRecorder.start(1000); // 每秒收集一次数据
      setIsListening(true);
      setInterimTranscript('正在录音...');
      setDuration(0);
      startTimeRef.current = Date.now();

      durationTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);
        setInterimTranscript(`正在录音... ${elapsed}s`);
      }, 1000);

      maxDurationTimerRef.current = setTimeout(() => {
        logger.warn('[Voice] 录音达到最大时长，自动停止');
        stopListening();
      }, maxDuration);

      logger.log('[Voice] 录音开始（faster-whisper 模式）');
    } catch (err) {
      logger.error('[Voice] 麦克风录音失败:', err);
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        const msg = '麦克风权限被拒绝，请在浏览器设置中允许麦克风访问';
        setError(msg);
        onErrorRef.current?.(msg);
      } else {
        const msg = '麦克风不可用，请检查设备是否连接';
        setError(msg);
        onErrorRef.current?.(msg);
      }
    }
  }, [isListening, transcribeWithBackend]);

  // ========== 停止监听 ==========
  const stopListening = useCallback(() => {
    isStoppingRef.current = true;

    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setInterimTranscript('识别中...');
    } else {
      setIsListening(false);
      setInterimTranscript('');
    }
  }, []);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      isStoppingRef.current = true;
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      }
    };
  }, []);

  return { isListening, interimTranscript, isSupported, error, startListening, stopListening, duration };
}export function useVoiceInputVAD