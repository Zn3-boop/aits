import { useState, useEffect, useCallback } from 'react';
import { calibrateEmotion } from '../hooks/useMultiMediaPipe';

interface DebugInfo {
  emotion: string;
  confidence: number;
  timestamp: number;
  live2dResponse: boolean;
}

interface EmotionDebugPanelProps {
  onTriggerEmotion?: (emotion: string) => void;
}

export function EmotionDebugPanel({ onTriggerEmotion }: EmotionDebugPanelProps) {
  const [history, setHistory] = useState<DebugInfo[]>([]);
  const [currentEmotion, setCurrentEmotion] = useState<string>('--');
  const [currentConfidence, setCurrentConfidence] = useState<number>(0);
  const [isVisible, setIsVisible] = useState(false);
  const [lastLive2DUpdate, setLastLive2DUpdate] = useState<string>('--');
  const [isCalibrated, setIsCalibrated] = useState<boolean>(false);
  const [rawBlendshapes, setRawBlendshapes] = useState<Record<string, number>>({});

  // 监听情绪变化事件
  useEffect(() => {
    const handleEmotion = (e: CustomEvent) => {
      const { emotion, confidence, emotionScores, features } = e.detail;
      setCurrentEmotion(emotion);
      setCurrentConfidence(confidence);
      
      // 触发 Live2D
      onTriggerEmotion?.(emotion);
      setLastLive2DUpdate(new Date().toLocaleTimeString());
      
      // 记录历史
      setHistory(prev => [{
        emotion,
        confidence,
        timestamp: Date.now(),
        live2dResponse: true,
      }, ...prev.slice(0, 9)]);
    };

    const handleData = (e: CustomEvent) => {
      setRawBlendshapes(e.detail.blendshapes || {});
    };

    window.addEventListener('user-emotion-detected', handleEmotion as EventListener);
    window.addEventListener('multimediapipe-data', handleData as EventListener);
    
    return () => {
      window.removeEventListener('user-emotion-detected', handleEmotion as EventListener);
      window.removeEventListener('multimediapipe-data', handleData as EventListener);
    };
  }, [onTriggerEmotion]);

  // 执行校准
  const performCalibration = useCallback(() => {
    if (Object.keys(rawBlendshapes).length > 0) {
      calibrateEmotion(rawBlendshapes);
      setIsCalibrated(true);
      setTimeout(() => setIsCalibrated(false), 2000);
      console.log('[EmotionDebugPanel] 校准已执行，使用当前 blendshapes');
    } else {
      console.log('[EmotionDebugPanel] 无法校准：没有可用的 blendshape 数据');
    }
  }, [rawBlendshapes]);

  // 手动触发情绪测试
  const triggerEmotion = useCallback((emotion: string) => {
    setCurrentEmotion(emotion);
    setCurrentConfidence(0.95);
    setLastLive2DUpdate(new Date().toLocaleTimeString());
    onTriggerEmotion?.(emotion);
    
    setHistory(prev => [{
      emotion,
      confidence: 0.95,
      timestamp: Date.now(),
      live2dResponse: true,
    }, ...prev.slice(0, 9)]);
  }, [onTriggerEmotion]);

  const emotions = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'fearful', 'disgusted'];

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          padding: '10px 15px',
          background: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          zIndex: 9999,
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        }}
      >
        🎭 情绪调试
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '320px',
        background: 'rgba(0,0,0,0.9)',
        borderRadius: '12px',
        padding: '16px',
        color: 'white',
        fontSize: '12px',
        zIndex: 9999,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '14px' }}>🎭 情绪检测调试面板</h3>
        <button
          onClick={() => setIsVisible(false)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontSize: '16px',
          }}
        >
          ✕
        </button>
      </div>

      {/* 当前状态 */}
      <div style={{ marginBottom: '12px', padding: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span>当前情绪:</span>
          <span style={{ fontWeight: 'bold', color: '#4CAF50' }}>{currentEmotion.toUpperCase()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span>置信度:</span>
          <span>{(currentConfidence * 100).toFixed(1)}%</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Live2D响应:</span>
          <span style={{ color: lastLive2DUpdate !== '--' ? '#4CAF50' : '#ff9800' }}>
            {lastLive2DUpdate !== '--' ? `✅ ${lastLive2DUpdate}` : '⏳ 等待中'}
          </span>
        </div>
      </div>

      {/* 所有情绪置信度 */}
      <div style={{ marginBottom: '12px', padding: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}>
        <div style={{ marginBottom: '8px', color: '#aaa', fontSize: '11px' }}>📊 所有情绪置信度:</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
          {emotions.map(e => (
            <div key={e} style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              fontSize: '10px',
              padding: '2px 4px',
              background: e === currentEmotion ? 'rgba(76, 175, 80, 0.3)' : 'transparent',
              borderRadius: '4px'
            }}>
              <span>{e}</span>
              <span style={{ color: e === currentEmotion ? '#4CAF50' : '#888' }}>
                {e === currentEmotion ? `${(currentConfidence * 100).toFixed(0)}%` : '--'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 手动触发测试 */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ marginBottom: '8px', color: '#aaa' }}>🧪 手动触发测试:</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
          {emotions.map(emotion => (
            <button
              key={emotion}
              onClick={() => triggerEmotion(emotion)}
              style={{
                padding: '8px 4px',
                background: emotion === currentEmotion ? '#4CAF50' : 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: '6px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              {emotion}
            </button>
          ))}
        </div>
      </div>

      {/* 校准功能 */}
      <div style={{ marginBottom: '12px', padding: '10px', background: 'rgba(255,152,0,0.15)', borderRadius: '8px' }}>
        <div style={{ marginBottom: '8px', color: '#ff9800', fontSize: '11px' }}>🎯 校准功能（重要！）</div>
        <div style={{ marginBottom: '8px', fontSize: '10px', color: '#ccc' }}>
          保持自然表情（放松的中性脸），然后点击"校准基准"按钮。这会记录你的基准面部数据，之后的表情检测会更准确。
        </div>
        <button
          onClick={performCalibration}
          style={{
            width: '100%',
            padding: '10px',
            background: isCalibrated ? '#4CAF50' : '#ff9800',
            border: 'none',
            borderRadius: '6px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'bold',
          }}
        >
          {isCalibrated ? '✅ 校准完成！' : '🎯 校准基准（保持自然表情）'}
        </button>
      </div>

      {/* 原始数据显示 */}
      <div style={{ marginBottom: '12px', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
        <div style={{ marginBottom: '8px', color: '#888', fontSize: '10px' }}>📊 原始 Blendshape 值:</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px', fontSize: '9px', fontFamily: 'monospace' }}>
          <div style={{ color: '#666' }}>smile: {(((rawBlendshapes['mouthSmileLeft'] || 0) + (rawBlendshapes['mouthSmileRight'] || 0)) / 2).toFixed(3)}</div>
          <div style={{ color: '#666' }}>frown: {(((rawBlendshapes['mouthFrownLeft'] || 0) + (rawBlendshapes['mouthFrownRight'] || 0)) / 2).toFixed(3)}</div>
          <div style={{ color: '#666' }}>browDown: {(((rawBlendshapes['browDownLeft'] || 0) + (rawBlendshapes['browDownRight'] || 0)) / 2).toFixed(3)}</div>
          <div style={{ color: '#666' }}>browUp: {(rawBlendshapes['browInnerUp'] || 0).toFixed(3)}</div>
          <div style={{ color: '#666' }}>eyeWide: {(((rawBlendshapes['eyeWideLeft'] || 0) + (rawBlendshapes['eyeWideRight'] || 0)) / 2).toFixed(3)}</div>
          <div style={{ color: '#666' }}>jawOpen: {(rawBlendshapes['jawOpen'] || 0).toFixed(3)}</div>
          <div style={{ color: '#666' }}>noseSneer: {(((rawBlendshapes['noseSneerLeft'] || 0) + (rawBlendshapes['noseSneerRight'] || 0)) / 2).toFixed(3)}</div>
          <div style={{ color: '#666' }}>cheekSquint: {(((rawBlendshapes['cheekSquintLeft'] || 0) + (rawBlendshapes['cheekSquintRight'] || 0)) / 2).toFixed(3)}</div>
        </div>
      </div>

      {/* 历史记录 */}
      <div>
        <div style={{ marginBottom: '8px', color: '#aaa' }}>📋 最近检测历史:</div>
        <div style={{ maxHeight: '80px', overflow: 'auto' }}>
          {history.length === 0 ? (
            <div style={{ color: '#666', textAlign: 'center', padding: '10px' }}>
              暂无记录
            </div>
          ) : (
            history.map((item, index) => (
              <div
                key={item.timestamp}
                style={{
                  padding: '4px 8px',
                  background: index === 0 ? 'rgba(76, 175, 80, 0.2)' : 'transparent',
                  borderRadius: '4px',
                  marginBottom: '2px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '10px',
                }}
              >
                <span style={{ color: '#4CAF50' }}>{item.emotion}</span>
                <span>{(item.confidence * 100).toFixed(0)}%</span>
                <span style={{ color: '#888' }}>{new Date(item.timestamp).toLocaleTimeString()}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 说明 */}
      <div style={{ marginTop: '12px', padding: '8px', background: 'rgba(255,152,0,0.2)', borderRadius: '6px', fontSize: '10px' }}>
        💡 提示: 先点击"校准基准"设置你的中性表情，然后再做表情测试
      </div>
    </div>
  );
}

export default EmotionDebugPanel;
