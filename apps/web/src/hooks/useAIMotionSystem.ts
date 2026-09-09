/**
 * AI 动作系统 Hook
 * 
 * 编排器：MediaPipe 采集 → 情绪分类 → 事件派发 → Live2D 驱动
 * 
 * 数据流: 摄像头 → FaceMesh → 特征提取 → 情绪分类 → 驱动 Live2D
 */

import { useMultiMediaPipe, type MultiMediaPipeData, type UserEmotion } from './useMultiMediaPipe';

interface UseAIMotionSystemOptions {
  enabled?: boolean;
  onData?: (data: MultiMediaPipeData) => void;
}

export function useAIMotionSystem(options: UseAIMotionSystemOptions = {}) {
  const { enabled = true, onData } = options;
  
  const {
    videoRef,
    canvasRef,
    isReady,
    error,
    cameraActive,
    cameraEnabled,
    emotion,
    confidence,
    toggleCamera,
  } = useMultiMediaPipe({
    enabled,
    onData,
  });
  
  return {
    videoRef,
    canvasRef,
    isReady,
    error,
    cameraActive,
    cameraEnabled,
    emotion,
    confidence,
    toggleCamera,
  };
}

export type { MultiMediaPipeData, UserEmotion };