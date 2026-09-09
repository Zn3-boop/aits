import { useState, useRef, useCallback, useEffect } from 'react';
import { apiFetch } from '../utils/auth';
import { logger } from '../utils/logger';

interface UseWhisperStreamOptions {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onAutoSend?: (text: string) => void;
  onVolume?: (volume: number) => void;
  chunkInterval?: number;
  silenceTimeout?: number;
  silenceThreshold?: number;
  useWebSocket?: boolean; // 新增：是否使用WebSocket
}

interface UseWhisperStreamReturn {
  isListening: boolean;
  isStreaming: boolean;
  interimText: string;
  finalText: string;
  volume: number;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
}

export function useWhisperStream(options: UseWhisperStreamOptions = {}): UseWhisperStreamReturn {
  const {
    onInterim,
    onFinal,
    onAutoSend,
    onVolume,
    chunkInterval = 1500,
    silenceTimeout = 5000,
    silenceThreshold = 0.012,
    useWebSocket = false, // 默认为false保持向后兼容
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // HTTP模式 refs
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const volumeRafRef = useRef<number>(0);
  
  // WebSocket模式 refs
  const wsRef = useRef<WebSocket | null>(null);
  const wsChunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // 共享 refs
  const isStoppingRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceStartRef = useRef<number>(0);
  const accumulatedTextRef = useRef('');
  const pendingChunksRef = useRef<Blob[]>([]);
  const isProcessingRef = useRef(false);
  const hasSpeechRef = useRef(false);

  const onInterimRef = useRef(onInterim);
  const onFinalRef = useRef(onFinal);
  const onAutoSendRef = useRef(onAutoSend);
  const onVolumeRef = useRef(onVolume);

  useEffect(() => { onInterimRef.current = onInterim; }, [onInterim]);
  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);
  useEffect(() => { onAutoSendRef.current = onAutoSend; }, [onAutoSend]);
  useEffect(() => { onVolumeRef.current = onVolume; }, [onVolume]);

  // ============================================================
  // WebSocket模式：连接到STT服务
  // ============================================================
  
  const connectWebSocket = useCallback(() => {
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/stt/ws`;
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        logger.log('[WhisperStream-WebSocket] 连接成功');
        setIsStreaming(true);
        setError(null);
        
        // 开始定期发送音频数据
        wsChunkTimerRef.current = setInterval(() => {
          if (pendingChunksRef.current.length > 0 && ws.readyState === WebSocket.OPEN) {
            const chunk = pendingChunksRef.current.shift();
            if (chunk) {
              chunk.arrayBuffer().then(buffer => {
                ws.send(buffer);
              });
            }
          }
        }, chunkInterval);
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'interim' || data.type === 'partial') {
            setInterimText(data.text || '');
            onInterimRef.current?.(data.text || '');
          } else if (data.type === 'final') {
            const text = data.text || '';
            if (text.trim()) {
              logger.log('[WhisperStream-WebSocket] 识别结果:', text);
              accumulatedTextRef.current = text;
              hasSpeechRef.current = true;
              setFinalText(text);
              onFinalRef.current?.(text);
              
              // 【修复1】自动发送 - 只在静音超时时自动发送，避免每帧都自动发送
              // 这里不立即发送，由静音定时器触发
              logger.log('[WhisperStream-WebSocket] 识别完成，等待静音超时后发送');
            }
          } else if (data.type === 'error') {
            logger.error('[WhisperStream-WebSocket] 错误:', data.error);
            setError(data.error || '识别服务错误');
          }
        } catch (e) {
          logger.warn('[WhisperStream-WebSocket] 解析消息失败:', e);
        }
      };
      
      ws.onerror = (event) => {
        logger.error('[WhisperStream-WebSocket] 连接错误:', event);
        setError('WebSocket连接失败');
        setIsStreaming(false);
      };
      
      ws.onclose = () => {
        logger.log('[WhisperStream-WebSocket] 连接关闭');
        setIsStreaming(false);
        
        if (wsChunkTimerRef.current) {
          clearInterval(wsChunkTimerRef.current);
          wsChunkTimerRef.current = null;
        }
        
        // 非主动关闭时尝试重连
        if (!isStoppingRef.current) {
          setTimeout(() => {
            if (!isStoppingRef.current && isListening) {
              logger.log('[WhisperStream-WebSocket] 尝试重连...');
              connectWebSocket();
            }
          }, 3000);
        }
      };
    } catch (e) {
      logger.error('[WhisperStream-WebSocket] 创建连接失败:', e);
      setError('无法建立WebSocket连接');
    }
  }, [chunkInterval]);

  // ============================================================
  // HTTP模式：发送到后端
  // ============================================================
  
  const sendChunkToBackend = useCallback(async (audioBlob: Blob) => {
    if (isStoppingRef.current) return;

    try {
      const formData = new FormData();
      const ext = audioBlob.type.includes('webm') ? 'webm'
        : audioBlob.type.includes('mp4') ? 'mp4' : 'wav';
      formData.append('audio', audioBlob, `chunk.${ext}`);

      setIsStreaming(true);

      const res = await apiFetch('/api/stt', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        logger.warn('[WhisperStream] 识别失败:', res.status);
        return;
      }

      const data = await res.json() as { text?: string; interim?: boolean };
      
      if (data.text) {
        const text = data.text.trim();
        if (!text) return;

        if (data.interim) {
          setInterimText(text);
          onInterimRef.current?.(text);
        } else {
          logger.log('[WhisperStream] 识别结果:', text);
          accumulatedTextRef.current = text;
          hasSpeechRef.current = true;
          setFinalText(text);
          onFinalRef.current?.(text);
        }
      }
    } catch (err) {
      logger.error('[WhisperStream] 发送音频失败:', err);
    } finally {
      setIsStreaming(false);
    }
  }, []);

  // ============================================================
  // 共享逻辑
  // ============================================================
  
  const triggerAutoSend = useCallback(() => {
    const text = accumulatedTextRef.current.trim();
    if (!text || !hasSpeechRef.current) return;

    logger.log('[WhisperStream] 自动发送:', text);
    setFinalText(text);
    onFinalRef.current?.(text);
    onAutoSendRef.current?.(text);

    accumulatedTextRef.current = '';
    hasSpeechRef.current = false;
    setInterimText('');
  }, []);

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      logger.log('[WhisperStream] 停顿超时，自动发送');
      triggerAutoSend();
    }, silenceTimeout);
  }, [silenceTimeout, triggerAutoSend]);

  // 清理资源
  const cleanup = useCallback(() => {
    isStoppingRef.current = true;
    
    // 清理HTTP模式资源
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    streamRef.current = null;
    
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    
    if (volumeRafRef.current) {
      cancelAnimationFrame(volumeRafRef.current);
      volumeRafRef.current = 0;
    }
    
    // 清理WebSocket资源
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (wsChunkTimerRef.current) {
      clearInterval(wsChunkTimerRef.current);
      wsChunkTimerRef.current = null;
    }
    
    // 清理定时器
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    
    pendingChunksRef.current = [];
    setIsStreaming(false);
  }, []);

  const startListening = useCallback(() => {
    if (isListening) return;
    
    isStoppingRef.current = false;
    accumulatedTextRef.current = '';
    hasSpeechRef.current = false;
    setInterimText('');
    setFinalText('');
    setError(null);
    setIsListening(true);

    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then((stream) => {
        streamRef.current = stream;
        
        // 设置音量检测
        audioContextRef.current = new AudioContext();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        source.connect(analyserRef.current);
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        
        const volumeLoop = () => {
          if (!analyserRef.current || !isListening) return;
          
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const vol = sum / dataArray.length / 255;
          setVolume(vol);
          onVolumeRef.current?.(vol);
          
          if (vol > silenceThreshold) {
            silenceStartRef.current = 0;
          } else if (silenceStartRef.current === 0) {
            silenceStartRef.current = Date.now();
          }
          
          volumeRafRef.current = requestAnimationFrame(volumeLoop);
        };
        volumeRafRef.current = requestAnimationFrame(volumeLoop);
        
        // 根据模式选择录音方式
        if (useWebSocket) {
          // WebSocket模式：直接录音发送
          const mediaRecorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/wav',
          });
          mediaRecorderRef.current = mediaRecorder;
          
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              pendingChunksRef.current.push(event.data);
            }
          };
          
          mediaRecorder.start(1000); // 每秒发送一次
          
          // 连接WebSocket
          connectWebSocket();
        } else {
          // HTTP模式：定时发送
          const mediaRecorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/wav',
          });
          mediaRecorderRef.current = mediaRecorder;
          
          mediaRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0 && !isStoppingRef.current) {
              pendingChunksRef.current.push(event.data);
              
              if (pendingChunksRef.current.length >= 1 && !isProcessingRef.current) {
                isProcessingRef.current = true;
                const chunk = pendingChunksRef.current.shift();
                if (chunk) {
                  await sendChunkToBackend(chunk);
                }
                isProcessingRef.current = false;
              }
            }
          };
          
          mediaRecorder.start(chunkInterval);
          resetSilenceTimer();
        }
      })
      .catch((err) => {
        logger.error('[WhisperStream] 获取麦克风失败:', err);
        setError('无法访问麦克风，请检查权限设置');
        setIsListening(false);
      });
  }, [isListening, useWebSocket, connectWebSocket, sendChunkToBackend, resetSilenceTimer, chunkInterval, silenceThreshold]);

  const stopListening = useCallback(() => {
    logger.log('[WhisperStream] 停止监听');
    setIsListening(false);
    triggerAutoSend();
    cleanup();
  }, [cleanup, triggerAutoSend]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isListening,
    isStreaming,
    interimText,
    finalText,
    volume,
    error,
    startListening,
    stopListening,
  };
}
