/**
 * useServerEmotion - 服务端情绪推理 Hook
 * 使用 WebSocket + JPEG 帧流将视频发送到 Python 推理服务
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { logger } from '../utils/logger';

interface UseServerEmotionOptions {
  sessionId: string;
  enabled?: boolean;
  fps?: number;
  quality?: number;
  width?: number;
  height?: number;
  emotionServiceUrl?: string;
  onEmotionUpdate?: (data: EmotionData) => void;
}

interface EmotionData {
  type: 'emotion_update';
  emotion: string;
  confidence: number;
  has_face: boolean;
  all_scores?: Record<string, number>;
  blendshapes?: Record<string, number>;
  mock?: boolean;
}

interface UseServerEmotionReturn {
  isConnected: boolean;
  frameCount: number;
  lastEmotion: EmotionData | null;
  error: string | null;
}

export function useServerEmotion(options: UseServerEmotionOptions): UseServerEmotionReturn {
  const {
    sessionId,
    enabled = true,
    fps = 10,
    quality = 0.5,
    width = 640,
    height = 480,
    emotionServiceUrl,
    onEmotionUpdate,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [lastEmotion, setLastEmotion] = useState<EmotionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStoppingRef = useRef(false);

  const onEmotionUpdateRef = useRef(onEmotionUpdate);
  useEffect(() => { onEmotionUpdateRef.current = onEmotionUpdate; }, [onEmotionUpdate]);

  // 连接到推理服务
  const connect = useCallback(() => {
    if (isStoppingRef.current) return;

    const wsUrl = emotionServiceUrl || `ws://${window.location.hostname}:10096/ws/emotion/${sessionId}`;
    logger.log('[useServerEmotion] 连接到:', wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        logger.log('[useServerEmotion] WebSocket 连接成功');
        setIsConnected(true);
        setError(null);

        // 开始定时发送帧
        if (intervalRef.current) clearInterval(intervalRef.current);
        const frameInterval = 1000 / fps;
        
        intervalRef.current = setInterval(() => {
          if (!canvasRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            return;
          }

          const ctx = canvasRef.current.getContext('2d');
          if (!ctx || !videoRef.current || videoRef.current.readyState < 2) return;

          // 绘制当前帧
          ctx.drawImage(videoRef.current, 0, 0, width, height);

          // 转换为 JPEG
          canvasRef.current.toBlob((blob) => {
            if (!blob || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
            
            blob.arrayBuffer().then((buffer) => {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(buffer);
              }
            }).catch((err) => {
              logger.warn('[useServerEmotion] 发送帧失败:', err);
            });
          }, 'image/jpeg', quality);
        }, frameInterval);
      };

      ws.onmessage = (event) => {
        try {
          const data: EmotionData = typeof event.data === 'string' 
            ? JSON.parse(event.data) 
            : JSON.parse(new TextDecoder().decode(event.data));

          if (data.type === 'emotion_update') {
            setLastEmotion(data);
            setFrameCount((prev) => prev + 1);
            onEmotionUpdateRef.current?.(data);

            // 派发全局事件
            window.dispatchEvent(new CustomEvent('mediapipe-raw-emotion', {
              detail: {
                emotion: data.emotion,
                confidence: data.confidence,
                hasFace: data.has_face,
                blendshapes: data.blendshapes,
                sessionId,
              }
            }));
          }
        } catch (e) {
          logger.warn('[useServerEmotion] 解析消息失败:', e);
        }
      };

      ws.onerror = (event) => {
        logger.error('[useServerEmotion] WebSocket 错误:', event);
        setError('连接错误');
        setIsConnected(false);
      };

      ws.onclose = () => {
        logger.log('[useServerEmotion] WebSocket 关闭');
        setIsConnected(false);

        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        // 非主动关闭时尝试重连
        if (!isStoppingRef.current && enabled) {
          reconnectTimeoutRef.current = setTimeout(() => {
            logger.log('[useServerEmotion] 尝试重连...');
            connect();
          }, 3000);
        }
      };
    } catch (e) {
      logger.error('[useServerEmotion] 创建 WebSocket 失败:', e);
      setError('无法连接推理服务');
    }
  }, [sessionId, fps, quality, width, height, enabled, emotionServiceUrl]);

  // 启动摄像头
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: width },
          height: { ideal: height },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;

      // 创建隐藏的 video 元素
      const video = document.createElement('video');
      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;
      video.autoplay = true;
      
      await video.play();
      videoRef.current = video;

      // 创建隐藏的 canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.style.display = 'none';
      document.body.appendChild(canvas);
      canvasRef.current = canvas;

      logger.log('[useServerEmotion] 摄像头启动成功');

      // 连接推理服务
      connect();
    } catch (e) {
      logger.error('[useServerEmotion] 摄像头启动失败:', e);
      setError('无法访问摄像头');
    }
  }, [width, height, connect]);

  // 停止
  const stop = useCallback(() => {
    logger.log('[useServerEmotion] 停止服务');
    isStoppingRef.current = true;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (canvasRef.current) {
      canvasRef.current.remove();
      canvasRef.current = null;
    }

    videoRef.current = null;
    setIsConnected(false);
    setFrameCount(0);
  }, []);

  // 启动/停止
  useEffect(() => {
    if (enabled) {
      isStoppingRef.current = false;
      void startCamera();
    } else {
      stop();
    }

    return () => {
      stop();
    };
  }, [enabled, startCamera, stop]);

  return {
    isConnected,
    frameCount,
    lastEmotion,
    error,
  };
}