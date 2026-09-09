/**
 * VAD + WebSocket 语音输入 Hook
 * 
 * 特性：
 * 1. VAD 语音活动检测 - 检测静音自动停止
 * 2. WebSocket 实时显示你说的内容
 * 3. 静音后自动重新开始监听
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { logger } from '../utils/logger';

interface UseVoiceInputVADOptions {
  onInterim?: (text: string) => void;      // 实时显示你说的内容
  onFinal?: (text: string) => void;         // 最终识别结果
  onVADStateChange?: (isSpeaking: boolean) => void;  // 说话/静音状态
  onError?: (err: string) => void;
  // VAD 配置
  silenceThreshold?: number;       // 静音阈值 (0-1)，越小越敏感
  silenceDuration?: number;       // 静音持续多久才停止 (ms)
  minSpeechDuration?: number;     // 最小说话时长 (ms)
  maxSilenceCount?: number;      // 最大静音次数（超过后暂停）
  // WebSocket 配置
  wsUrl?: string;
  autoReconnect?: boolean;
}

interface UseVoiceInputVADReturn {
  isListening: boolean;
  isSpeaking: boolean;
  interimText: string;
  transcript: string;
  error: string | null;
  vadEnabled: boolean;
  startListening: () => void;
  stopListening: () => void;
  toggleVAD: (enable: boolean) => void;
  clearTranscript: () => void;
}

const DEFAULT_CONFIG = {
  silenceThreshold: 0.015,        // 能量阈值，可调整
  silenceDuration: 1500,         // 1.5秒静音后停止
  minSpeechDuration: 300,        // 至少说 0.3 秒
  maxSilenceCount: 3,            // 最大静音次数
};

export function useVoiceInputVAD(options: UseVoiceInputVADOptions = {}): UseVoiceInputVADReturn {
  const {
    onInterim,
    onFinal,
    onVADStateChange,
    onError,
    silenceThreshold = DEFAULT_CONFIG.silenceThreshold,
    silenceDuration = DEFAULT_CONFIG.silenceDuration,
    minSpeechDuration = DEFAULT_CONFIG.minSpeechDuration,
    maxSilenceCount = DEFAULT_CONFIG.maxSilenceCount,
    wsUrl = '/api/stt/ws',
    autoReconnect = true,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [vadEnabled, setVadEnabled] = useState(true);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const vadLoopRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualStopRef = useRef(false);
  const isConnectedRef = useRef(false);
  const lastSpeechTimeRef = useRef(0);
  const silenceCountRef = useRef(0);
  const speechStartTimeRef = useRef(0);

  // 函数 refs（用于回调中引用）
  const stopListeningRef = useRef<() => void>(() => {});
  const restartRecordingRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const vadLoopFnRef = useRef<() => void>(() => {});
  const connectWSRef = useRef<() => void>(() => {});

  // Callbacks refs
  const onInterimRef = useRef(onInterim);
  const onFinalRef = useRef(onFinal);
  const onVADStateChangeRef = useRef(onVADStateChange);
  const onErrorRef = useRef(onError);

  useEffect(() => { onInterimRef.current = onInterim; }, [onInterim]);
  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);
  useEffect(() => { onVADStateChangeRef.current = onVADStateChange; }, [onVADStateChange]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  /**
   * 计算音频能量
   */
  const getAudioLevel = useCallback((): number => {
    if (!analyserRef.current) return 0;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    return sum / dataArray.length / 255;
  }, []);

  /**
   * 停止监听（内部函数）
   */
  const stopListeningInternal = useCallback(() => {
    isManualStopRef.current = true;

    // 停止 VAD 循环
    if (vadLoopRef.current) {
      cancelAnimationFrame(vadLoopRef.current);
      vadLoopRef.current = null;
    }

    // 停止重连
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // 发送结束指令
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }

    // 停止 MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // 停止音轨
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // 关闭 AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    setIsListening(false);
    setIsSpeaking(false);
    setInterimText('');
    
    logger.log('[VAD-WS] 停止监听');
  }, []);

  /**
   * 重启录音
   */
  const restartRecordingInternal = useCallback(async () => {
    if (!isConnectedRef.current || isManualStopRef.current) return;

    try {
      // 停止之前的录音
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      
      // 重新获取麦克风并开始录音
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      
      streamRef.current = stream;

      // 设置 AudioContext 用于 VAD
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // 创建 MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          const buffer = await event.data.arrayBuffer();
          wsRef.current.send(new Uint8Array(buffer));
        }
      };

      // 发送开始指令
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'start' }));
      }
      
      mediaRecorder.start(500);
      logger.log('[VAD-WS] 重启录音');
      
    } catch (err) {
      logger.error('[VAD-WS] 重启录音失败:', err);
    }
  }, []);

  /**
   * VAD 检测循环
   */
  const vadLoop = useCallback(() => {
    if (!isListening || isManualStopRef.current) return;

    const level = getAudioLevel();
    const now = Date.now();

    if (level > silenceThreshold) {
      // 检测到说话
      if (!isSpeaking) {
        setIsSpeaking(true);
        onVADStateChangeRef.current?.(true);
        speechStartTimeRef.current = now;
      }
      lastSpeechTimeRef.current = now;
      silenceCountRef.current = 0;
    } else if (isSpeaking) {
      // 静音中
      const timeSinceLastSpeech = now - lastSpeechTimeRef.current;
      
      if (timeSinceLastSpeech > silenceDuration) {
        const speechDuration = now - speechStartTimeRef.current;
        
        if (speechDuration >= minSpeechDuration) {
          // 说话时间足够，重启录音
          silenceCountRef.current++;
          logger.log(`[VAD] 静音检测 (${silenceCountRef.current}/${maxSilenceCount})`);
          
          if (silenceCountRef.current >= maxSilenceCount) {
            // 达到最大静音次数，暂停
            logger.log('[VAD] 达到静音次数上限，暂停监听');
            stopListeningInternal();
            return;
          }
          
          // 重启录音
          restartRecordingInternal();
        } else {
          // 说话时间太短，忽略
          setIsSpeaking(false);
          onVADStateChangeRef.current?.(false);
        }
        
        lastSpeechTimeRef.current = now;
      }
    }

    vadLoopRef.current = requestAnimationFrame(vadLoopFnRef.current);
  }, [getAudioLevel, silenceThreshold, silenceDuration, minSpeechDuration, maxSilenceCount, isListening, isSpeaking, stopListeningInternal, restartRecordingInternal]);

  /**
   * 连接 WebSocket
   */
  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = wsUrl.startsWith('ws') ? wsUrl : `${protocol}//${window.location.host}${wsUrl}`;
    
    logger.log('[VAD-WS] 连接中:', url);
    
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      logger.log('[VAD-WS] 连接成功');
      isConnectedRef.current = true;
      setError(null);
    };

    ws.onclose = () => {
      logger.log('[VAD-WS] 连接关闭');
      isConnectedRef.current = false;
      wsRef.current = null;

      if (!isManualStopRef.current && autoReconnect && isListening) {
        reconnectTimeoutRef.current = setTimeout(() => {
          logger.log('[VAD-WS] 尝试重连...');
          connectWSRef.current();
        }, 2000);
      }
    };

    ws.onerror = () => {
      logger.error('[VAD-WS] 连接错误');
      setError('WebSocket 连接失败');
      onErrorRef.current?.('WebSocket 连接失败');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'ready':
            logger.log('[VAD-WS] 就绪');
            break;
            
          case 'interim': {
            const text = data.text || '';
            setInterimText(text);
            onInterimRef.current?.(text);
            break;
          }
            
          case 'final': {
            const finalText = data.text || '';
            if (finalText.trim()) {
              setTranscript(prev => prev + finalText + ' ');
              onFinalRef.current?.(finalText.trim());
            }
            setInterimText('');
            break;
          }
            
          case 'error':
            logger.error('[VAD-WS] 错误:', data.message);
            onErrorRef.current?.(data.message);
            break;
        }
      } catch (e) {
        logger.warn('[VAD-WS] 解析消息失败:', e);
      }
    };
  }, [wsUrl, autoReconnect, isListening]);

  // 更新函数 refs
  useEffect(() => {
    stopListeningRef.current = stopListeningInternal;
    restartRecordingRef.current = restartRecordingInternal;
    vadLoopFnRef.current = vadLoop;
    connectWSRef.current = connectWS;
  }, [stopListeningInternal, restartRecordingInternal, vadLoop, connectWS]);

  /**
   * 开始监听
   */
  const startListening = useCallback(async () => {
    if (isListening) return;

    isManualStopRef.current = false;
    silenceCountRef.current = 0;
    setError(null);
    setInterimText('');

    try {
      // 连接 WebSocket
      connectWSRef.current();

      // 等待连接建立
      await new Promise<void>((resolve) => {
        const check = () => {
          if (isConnectedRef.current || !isListening) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        setTimeout(check, 100);
        setTimeout(resolve, 3000); // 3秒超时
      });

      // 获取麦克风
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      
      streamRef.current = stream;

      // 设置 AudioContext 用于 VAD
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // 创建 MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          const buffer = await event.data.arrayBuffer();
          wsRef.current.send(new Uint8Array(buffer));
        }
      };

      // 发送开始指令
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'start' }));
      }
      
      mediaRecorder.start(500);
      setIsListening(true);
      setIsSpeaking(false);
      lastSpeechTimeRef.current = Date.now();
      speechStartTimeRef.current = Date.now();

      // 启动 VAD 检测
      if (vadEnabled) {
        vadLoopRef.current = requestAnimationFrame(vadLoopFnRef.current);
      }

      logger.log('[VAD-WS] 开始监听 (VAD:', vadEnabled ? '开启' : '关闭', ')');
    } catch (err) {
      logger.error('[VAD-WS] 启动失败:', err);
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('麦克风权限被拒绝');
      } else {
        setError('无法访问麦克风');
      }
      onErrorRef.current?.(error as string);
    }
  }, [isListening, vadEnabled]);

  /**
   * 停止监听（对外接口）
   */
  const stopListening = useCallback(() => {
    stopListeningInternal();
  }, [stopListeningInternal]);

  /**
   * 切换 VAD 模式
   */
  const toggleVAD = useCallback((enable: boolean) => {
    setVadEnabled(enable);
    logger.log('[VAD-WS] VAD 模式:', enable ? '开启' : '关闭');
    
    if (isListening && enable && !vadLoopRef.current) {
      vadLoopRef.current = requestAnimationFrame(vadLoopFnRef.current);
    }
  }, [isListening, stopListeningInternal, restartRecordingInternal, vadLoop]);

  /**
   * 清空转写文本
   */
  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimText('');
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      stopListeningInternal();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [stopListeningInternal]);

  return {
    isListening,
    isSpeaking,
    interimText,
    transcript,
    error,
    vadEnabled,
    startListening,
    stopListening,
    toggleVAD,
    clearTranscript,
  };
}
