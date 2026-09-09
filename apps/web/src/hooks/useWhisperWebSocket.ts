/**
 * WebSocket STT Hook - 真正的实时语音识别
 * 
 * 与现有的 useWhisperStream.ts 不同，这个版本使用 WebSocket 连接后端，
 * 实现真正的实时流式识别，而不是整段上传
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../utils/logger';

interface WhisperWSOptions {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (error: string) => void;
  autoReconnect?: boolean;
}

interface UseWhisperWSReturn {
  isConnected: boolean;
  isRecording: boolean;
  transcript: string;
  interimText: string;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  clearTranscript: () => void;
}

export function useWhisperWebSocket(options: WhisperWSOptions = {}): UseWhisperWSReturn {
  const {
    onInterim,
    onFinal,
    onError,
    autoReconnect = true,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualStopRef = useRef(false);
  const connectRef = useRef<() => void>(() => {});

  // 连接 WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/stt/ws`;
    
    logger.log('[WhisperWS] 连接中:', wsUrl);
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      logger.log('[WhisperWS] 连接成功');
      setIsConnected(true);
      setError(null);
    };

    ws.onclose = () => {
      logger.log('[WhisperWS] 连接关闭');
      setIsConnected(false);
      wsRef.current = null;

      // 非手动关闭时尝试重连
      if (!isManualStopRef.current && autoReconnect) {
        reconnectTimeoutRef.current = setTimeout(() => {
          logger.log('[WhisperWS] 尝试重连...');
          connectRef.current();
        }, 3000);
      }
    };

    ws.onerror = () => {
      logger.error('[WhisperWS] 连接错误');
      setError('WebSocket 连接失败');
      onError?.('WebSocket 连接失败');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'ready':
            logger.log('[WhisperWS] 就绪:', data.sessionId);
            break;
            
          case 'interim': {
            const text = data.text || '';
            setInterimText(text);
            onInterim?.(text);
            break;
          }
            
          case 'final': {
            const finalText = data.text || '';
            if (finalText.trim()) {
              setTranscript(prev => prev + finalText + ' ');
              onFinal?.(finalText.trim());
            }
            setInterimText('');
            break;
          }
            
          case 'error':
            logger.error('[WhisperWS] 错误:', data.message);
            setError(data.message);
            onError?.(data.message);
            break;
        }
      } catch (e) {
        logger.warn('[WhisperWS] 解析消息失败:', e);
      }
    };
  }, [autoReconnect, onError, onFinal, onInterim]);

  // 保存 connect 引用
  connectRef.current = connect;

  // 开始录音
  const startRecording = useCallback(async () => {
    if (isRecording) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('WebSocket 未连接');
      return;
    }

    try {
      isManualStopRef.current = false;
      
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

      // 创建 MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/wav';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      // 音频数据可用时发送
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          const buffer = await event.data.arrayBuffer();
          wsRef.current.send(new Uint8Array(buffer));
        }
      };

      // 发送开始指令
      wsRef.current.send(JSON.stringify({ type: 'start' }));
      
      // 开始录制，每秒一个 chunk
      mediaRecorder.start(1000);
      setIsRecording(true);
      setError(null);
      
      logger.log('[WhisperWS] 开始录音');
    } catch (err) {
      logger.error('[WhisperWS] 麦克风访问失败:', err);
      setError('无法访问麦克风');
      onError?.('无法访问麦克风');
    }
  }, [isRecording, onError]);

  // 停止录音
  const stopRecording = useCallback(() => {
    if (!isRecording) return;
    
    isManualStopRef.current = true;

    // 停止 MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // 停止所有音轨
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // 发送结束指令
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }

    setIsRecording(false);
    setInterimText('');
    
    logger.log('[WhisperWS] 停止录音');
  }, [isRecording]);

  // 清空转写文本
  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimText('');
  }, []);

  // 初始化连接
  useEffect(() => {
    connect();
    
    return () => {
      isManualStopRef.current = true;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [connect]);

  return {
    isConnected,
    isRecording,
    transcript,
    interimText,
    error,
    startRecording,
    stopRecording,
    clearTranscript,
  };
}
