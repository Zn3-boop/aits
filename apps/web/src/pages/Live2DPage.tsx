import { useEffect, useId, useRef, useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createLive2DDriver, destroyLive2D } from '../features/live2d-driver/driver';
import { lipSyncController } from '../services/live2d/LipSyncController';
import { lipSyncEnhancer } from '../live2d-enhancements/LipSyncEnhancer';
import { speakingMicroExpr } from '../live2d-enhancements/SpeakingMicroExpressions';
import { emotionTimelineSync } from '../live2d-enhancements/EmotionTimelineSync';
import { emotionAutoMapper } from '../live2d-enhancements/EmotionAutoMapper';
import { modelPath as defaultModelPath } from '../utils/live2d/config';
import { apiFetch, parseApiError } from '../utils/auth';
import { logger } from '../utils/logger';
import { live2dScheduler } from '../services/multimodal/Live2DScheduler';

type Live2DPageProps = {
  modelPath?: string;
  characterName?: string;
  defaultMotion?: string;
  defaultExpression?: string;
  compact?: boolean;
};

type Live2DModelOption = {
  id?: string;
  code: string;
  name: string;
  path: string;
  isSystem?: boolean;
  isActive?: boolean;
};

/** 清洗模型路径 */
const cleanModelPath = (raw: string): string => {
  if (!raw) return defaultModelPath;
  let cleaned = raw
    .replace(/^https?:\/\/127\.0\.0\.1:\d+/, '')
    .replace(/^https?:\/\/localhost:\d+/, '');
  if (cleaned.includes('/runtime/')) return cleaned;
  const modelMatch = cleaned.match(/\/(shizuku|hibiki|hiyori)\/([^/]+\.model3\.json)$/);
  if (modelMatch) {
    cleaned = cleaned.replace(/\/(shizuku|hibiki|hiyori)\/([^/]+\.model3\.json)$/, '/$1/runtime/$2');
    logger.log('[Live2D] 路径自动修复:', raw, '->', cleaned);
  }
  return cleaned;
};

export const StagePreview = memo(({
  modelPath = defaultModelPath,
  characterName = '默认角色',
  defaultMotion = 'Idle',
  defaultExpression = 'neutral',
  compact = false
}: Live2DPageProps) => {
  console.log('=== [StagePreview] 组件已渲染, modelPath:', modelPath, 'compact:', compact);
  const [renderState, setRenderState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string>('');
  const [retryToken, setRetryToken] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const mountedRef = useRef(true);
  const [currentEmotion, setCurrentEmotion] = useState(defaultExpression);
  const driverRef = useRef<ReturnType<typeof createLive2DDriver> | null>(null);
  // 使用 useId 生成稳定的 canvas ID
  const generatedId = useId();
  const canvasId = `live2d-canvas-${compact ? 'compact' : 'full'}-${generatedId.replace(/:/g, '')}`;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (driverRef.current) {
        driverRef.current.destroy();
        driverRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    logger.log('[Live2D] StagePreview useEffect 触发, modelPath:', modelPath, 'canvasRef:', !!canvasRef.current);

    if (!modelPath || modelPath === '') {
      logger.log('[Live2D] modelPath 为空，跳过初始化，显示占位图');
      setRenderState('idle');
      setError('');
      return;
    }

    if (!canvasRef.current) {
      logger.warn('[Live2D] canvasRef 为空，跳过初始化');
      return;
    }

    // 【方案 D 修复】：使用 ref 跟踪取消状态，这样 cleanup 可以访问到
    const cancelledRef = { value: false };
    let driver: ReturnType<typeof createLive2DDriver> | null = null;
    let bootTimer: ReturnType<typeof setTimeout> | null = null;

    const boot = async () => {
      try {
        setRenderState('loading');
        setError('');

        // 检查是否已取消
        if (cancelledRef.value || !mountedRef.current) {
          logger.log('[Live2D] boot 已取消，跳过初始化');
          return;
        }

        destroyLive2D();
        if (driverRef.current) {
          driverRef.current.destroy();
          driverRef.current = null;
        }

        // 等待 canvas 挂载到 DOM（使用 rAF 轮询，更可靠）
        const waitForCanvas = (): Promise<HTMLCanvasElement | null> => {
          return new Promise((resolve) => {
            const MAX_FRAMES = 120;
            let frame = 0;
            const tick = () => {
              if (cancelledRef.value) { resolve(null); return; }
              const c = canvasRef.current;
              if (c && document.contains(c)) { resolve(c); return; }
              frame++;
              if (frame >= MAX_FRAMES) { resolve(null); return; }
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
        };

        const canvasEl = await waitForCanvas();

        if (cancelledRef.value) {
          logger.log('[Live2D] boot 已取消（等待后）');
          return;
        }

        if (!canvasEl) {
          logger.warn('[Live2D] Canvas 等待超时，仍未挂载到 DOM');
          if (mountedRef.current) {
            setRenderState('error');
            setError('Canvas 挂载超时，请点击重试');
          }
          return;
        }

        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => requestAnimationFrame(resolve));

        // 再检查一次取消状态
        if (cancelledRef.value) {
          logger.log('[Live2D] boot 已取消（rAF 后）');
          return;
        }

        const shell = shellRef.current;
        const canvas = canvasRef.current;
        if (!shell || !canvas) {
          logger.warn('[Live2D] shell 或 canvas ref 为空');
          return;
        }
        if (!document.contains(canvas)) {
          logger.warn('[Live2D] Canvas 未在 DOM 中，跳过初始化');
          return;
        }

        // 最后检查取消状态
        if (cancelledRef.value) {
          logger.log('[Live2D] boot 已取消（DOM 检查后）');
          return;
        }

        const rect = shell.getBoundingClientRect();
        const width = Math.max(200, Math.floor(rect.width));
        const height = Math.max(200, Math.floor(rect.height));

        logger.log('[Live2D] 容器尺寸:', width, 'x', height);

        driver = createLive2DDriver({
          canvas,
          modelUrl: cleanModelPath(modelPath),
          width,
          height,
        });
        driverRef.current = driver;

        await driver.init();

        // 检查是否已取消
        if (cancelledRef.value || !mountedRef.current) {
          driver.destroy();
          driverRef.current = null;
          return;
        }

        await driver.loadModel();

        if (cancelledRef.value || !mountedRef.current) {
          driver.destroy();
          driverRef.current = null;
          return;
        }

        driver.playMotion(defaultMotion, 0);
        driver.driveEmotion(defaultExpression);
        setCurrentEmotion(defaultExpression);

        // ===== 表情自动适配 =====
        try {
          const model = (driver as unknown as { model?: { internalModel?: { coreModel?: { getParameterCount?: () => number; getParameterId?: (i: number) => string } }; settings?: { motions?: Record<string, unknown[]>; expressions?: Array<{ name?: string; Name?: string }> } } }).model;
          const coreModel = model?.internalModel?.coreModel;
          const paramIds: string[] = [];
          if (coreModel?.getParameterCount && coreModel?.getParameterId) {
            const count = coreModel.getParameterCount();
            for (let i = 0; i < count; i++) {
              paramIds.push(coreModel.getParameterId(i));
            }
          }
          const settings = model?.internalModel?.settings || (model as unknown as { settings?: { motions?: Record<string, unknown[]>; expressions?: Array<{ name?: string; Name?: string }> } }).settings;
          const motionGroups = Object.keys(settings?.motions || {});
          const expressions = (settings?.expressions || []).map((e: { name?: string; Name?: string }) => e.name || e.Name || '');
          if (paramIds.length > 0) {
            const adaptResult = emotionAutoMapper.adaptModel(paramIds, motionGroups, expressions.filter(Boolean), modelPath);
            logger.log('[Live2D Enhance] 🎭 模型适配报告:', adaptResult.report());
          }
        } catch (adaptErr) {
          logger.warn('[Live2D Enhance] 表情自动适配跳过:', adaptErr);
        }

        setRenderState('ready');
      } catch (err) {
        logger.error('[Live2D] 失败:', err);
        if (!mountedRef.current) return;
        setRenderState('error');
        setError(err instanceof Error ? err.message : '加载失败');
      }
    };

    bootTimer = setTimeout(boot, 100);
    return () => {
      // 【方案 D 核心修复】：标记为取消
      cancelledRef.value = true;
      // 取消 setTimeout
      if (bootTimer) {
        clearTimeout(bootTimer);
        bootTimer = null;
      }
      // 清理 driver
      if (driverRef.current) {
        driverRef.current.destroy();
        driverRef.current = null;
      }
      // 强制销毁全局 Live2D 单例，防止旧实例占着 WebGL 上下文
      destroyLive2D();
    };
  }, [modelPath, retryToken, defaultMotion]);

  useEffect(() => {
    if (renderState !== 'ready') return;
    driverRef.current?.playMotion(defaultMotion, 0);
    driverRef.current?.driveEmotion(defaultExpression);

    lipSyncController.setOnMouthUpdate((value: number) => {
      if (driverRef.current) {
        driverRef.current.setMouthOpen(value);
      }
    });

    // ===== Live2D 增强模块初始化 =====
    const driver = driverRef.current;
    if (driver) {
      lipSyncEnhancer.init({
        onMouthUpdate: (openY, form, _shape) => {
          driver.setMouthOpen(openY);
          driver.setOverrideParam('ParamMouthForm', form);
        },
        smoothing: 0.45,
        openThreshold: 0.08,
      });

      speakingMicroExpr.init({
        setParam: (id, value) => driver.setOverrideParam(id, value),
        addParam: (id, value) => driver.addParam(id, value),
        activityLevel: 1,
      });

      emotionTimelineSync.init({
        transitionDuration: 300,
        emotionHoldTime: 8000,
        onSpeakingChange: (isSpeaking) => {
          if (isSpeaking) {
            speakingMicroExpr.startSpeaking();
          } else {
            speakingMicroExpr.stopSpeaking();
          }
        },
      });

      logger.log('[Live2D Enhance] ✅ 所有增强模块已加载');

      // ===== 注册多模态总调度器 =====
      live2dScheduler.registerCallbacks({
        onPreloadEmotion: (emotion, _intensity) => {
          driverRef.current?.driveEmotion(emotion);
        },
        onPlayAudio: (url) => {
          const audio = new Audio(url);
          audio.preload = 'auto';
          return audio;
        },
        onStopAudio: () => {},
        onLipSyncStart: (audio) => {
          lipSyncEnhancer.start(audio).catch(() => {
            lipSyncEnhancer.startSilentSimulation(audio.dataset.text || '', audio.duration ? audio.duration * 1000 : undefined);
          });
        },
        onLipSyncStop: () => {
          lipSyncEnhancer.stop();
        },
        onMicroExpression: (params) => {
          Object.entries(params).forEach(([k, v]) => driverRef.current?.setOverrideParam(k, v));
        },
        onResetNeutral: () => {
          driverRef.current?.driveEmotion('neutral');
        },
        onStateChange: (state) => {
          (window as unknown as Record<string, unknown>).__AI_IS_SPEAKING__ = state === 'speaking';
        },
      });
      logger.log('[Live2D] ✅ Live2DScheduler 已注册到 StagePreview');
    }

    // 调试：检查 canvas 是否在 DOM 中可见
    const checkCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        console.log('[Live2D Debug] canvas ref 为空');
        return;
      }
      
      const pixiCanvas = document.querySelector('canvas.live2d-canvas') as HTMLCanvasElement | null;
      if (pixiCanvas) {
        console.log('[Live2D Debug] PIXI canvas 找到:', {
          display: window.getComputedStyle(pixiCanvas).display,
          visibility: window.getComputedStyle(pixiCanvas).visibility,
          opacity: window.getComputedStyle(pixiCanvas).opacity,
          width: pixiCanvas.width,
          height: pixiCanvas.height,
          clientWidth: pixiCanvas.clientWidth,
          clientHeight: pixiCanvas.clientHeight,
          offsetWidth: pixiCanvas.offsetWidth,
          offsetHeight: pixiCanvas.offsetHeight,
          boundingRect: pixiCanvas.getBoundingClientRect(),
        });
        
        // 尝试读取 WebGL 渲染内容
        const gl = pixiCanvas.getContext('webgl2') || pixiCanvas.getContext('webgl');
        if (gl) {
          const pixels = new Uint8Array(4);
          gl.readPixels(pixiCanvas.width / 2, pixiCanvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          console.log('[Live2D Debug] 画布中心像素:', Array.from(pixels));
        }
      } else {
        console.log('[Live2D Debug] 未找到 PIXI canvas (live2d-canvas)');
      }
    };
    
    // 延迟检查，等 PIXI 渲染完成
    setTimeout(checkCanvas, 500);
  }, [defaultExpression, defaultMotion, renderState]);

  // ===== 微表情 + 口型联动说话状态 =====
  useEffect(() => {
    const handleSpeechStart = () => {
      speakingMicroExpr.startSpeaking();
    };
    const handleSpeechEnd = () => {
      speakingMicroExpr.stopSpeaking();
    };
    window.addEventListener('ai-speech-started', handleSpeechStart);
    window.addEventListener('ai-speech-ended', handleSpeechEnd);
    return () => {
      window.removeEventListener('ai-speech-started', handleSpeechStart);
      window.removeEventListener('ai-speech-ended', handleSpeechEnd);
    };
  }, []);

  useEffect(() => {
    if (!compact || !shellRef.current || renderState !== 'ready') return;

    const shell = shellRef.current;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width < 50 || height < 50) return;

      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (driverRef.current && mountedRef.current) {
          driverRef.current.resize(Math.floor(width), Math.floor(height));
        }
      }, 200);
    });

    ro.observe(shell);
    return () => {
      ro.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, [compact, renderState]);

  const mediapipeActiveRef = useRef(false);
  const mediapipeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUserEmotionRef = useRef<string>('neutral');
  const lastUserEmotionTimeRef = useRef(0);
  const lastAiEmotionRef = useRef<string>('neutral');
  const lastAiEmotionTimeRef = useRef(0);

  useEffect(() => {
    if (renderState !== 'ready') return;

    const handleAiEmotion = (event: Event) => {
      const detail = (event as CustomEvent<{ emotion?: string }>).detail;
      const emotion = detail?.emotion || 'neutral';
      const now = Date.now();

      if (emotion === lastAiEmotionRef.current && (now - lastAiEmotionTimeRef.current) < 5000) return;

      lastAiEmotionRef.current = emotion;
      lastAiEmotionTimeRef.current = now;
      setCurrentEmotion(emotion);
      driverRef.current?.driveEmotion(emotion);
    };
    
    const handleUserEmotion = (event: Event) => {
      const detail = (event as CustomEvent<{ emotion?: string; confidence?: number; expressions?: Record<string, number>; source?: string }>).detail;
      const emotion = detail?.emotion || 'neutral';
      const confidence = detail?.confidence || 0;
      const source = detail?.source || 'unknown';
      
      if (confidence < 0.1) return;

      const now = Date.now();
      const emotionChanged = emotion !== lastUserEmotionRef.current;

      if (emotionChanged && emotion !== 'neutral') {
        const minInterval = (source === 'video') ? 1500 : 800;
        if (now - lastUserEmotionTimeRef.current < minInterval) return;
        lastUserEmotionRef.current = emotion;
        lastUserEmotionTimeRef.current = now;
        logger.log('[Live2D] 🎭 用户情绪变化:', emotion, `置信度: ${(confidence * 100).toFixed(1)}%`, `来源: ${source}`);
        setCurrentEmotion(emotion);
        driverRef.current?.driveEmotion(emotion);
      } else if (emotion === 'neutral' && lastUserEmotionRef.current !== 'neutral') {
        if (now - lastUserEmotionTimeRef.current < 3000) return;
        lastUserEmotionRef.current = 'neutral';
        lastUserEmotionTimeRef.current = now;
        driverRef.current?.driveEmotion('neutral');
      }
    };
    
    const handleMediaPipeData = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || !driverRef.current) return;

      // AI 说话时：面部追踪只驱动微参数（眼球、眉毛），不覆盖嘴巴和头部
      // 这样 AI 说话时也能对用户表情做出细微反应
      const aiSpeaking = !!window.__AI_IS_SPEAKING__;
      
      if (!detail.faceDetected) return;
      
      mediapipeActiveRef.current = true;
      if (mediapipeTimerRef.current) clearTimeout(mediapipeTimerRef.current);
      mediapipeTimerRef.current = setTimeout(() => {
        mediapipeActiveRef.current = false;
        driverRef.current?.clearOverrideParams();
      }, 2000);
      
      const driver = driverRef.current;
      const bs = detail.blendshapes || {};
      
      const smileL = bs['mouthSmileLeft'] || 0;
      const smileR = bs['mouthSmileRight'] || 0;
      const avgSmile = (smileL + smileR) / 2;

      const isLipSyncing = lipSyncController.getIsActive();
      // AI 说话时不覆盖嘴巴（口型由 TTS 驱动），但其他参数正常
      if (!isLipSyncing && !aiSpeaking) {
        driver.setOverrideParam('ParamMouthOpenY', Math.min(1, (bs['jawOpen'] || 0) * 1.5));
        driver.setOverrideParam('ParamMouthForm', Math.max(-1, Math.min(1, avgSmile * 2 - 0.2)));
      }
      
      const blinkL = bs['eyeBlinkLeft'] || 0;
      const blinkR = bs['eyeBlinkRight'] || 0;
      const avgBlink = (blinkL + blinkR) / 2;
      const eyeVal = avgBlink > 0.5 ? 0 : Math.max(0, 1 - avgBlink);
      driver.setOverrideParam('ParamEyeLOpen', eyeVal);
      driver.setOverrideParam('ParamEyeROpen', eyeVal);
      
      if (avgSmile > 0.3) {
        driver.setOverrideParam('ParamEyeLSmile', Math.min(1, avgSmile));
        driver.setOverrideParam('ParamEyeRSmile', Math.min(1, avgSmile));
      } else {
        driver.setOverrideParam('ParamEyeLSmile', 0);
        driver.setOverrideParam('ParamEyeRSmile', 0);
      }
      
      const lookL = bs['eyeLookOutLeft'] || 0;
      const lookR = bs['eyeLookInRight'] || 0;
      const lookUpL = bs['eyeLookUpLeft'] || 0;
      const lookUpR = bs['eyeLookUpRight'] || 0;
      const lookDownL = bs['eyeLookDownLeft'] || 0;
      const lookDownR = bs['eyeLookDownRight'] || 0;
      driver.setOverrideParam('ParamEyeBallX', Math.max(-1, Math.min(1, (lookL - lookR) * 3)));
      driver.setOverrideParam('ParamEyeBallY', Math.max(-1, Math.min(1, ((lookUpL + lookUpR) / 2 - (lookDownL + lookDownR) / 2) * 3)));
      
      const browUp = bs['browInnerUp'] || 0;
      const browDownL = bs['browDownLeft'] || 0;
      const browDownR = bs['browDownRight'] || 0;
      const browOuterUpL = bs['browOuterUpLeft'] || 0;
      const browOuterUpR = bs['browOuterUpRight'] || 0;
      const avgBrowDown = (browDownL + browDownR) / 2;
      const avgBrowOuterUp = (browOuterUpL + browOuterUpR) / 2;
      driver.setOverrideParam('ParamBrowLY', Math.max(-1, Math.min(1, browUp + avgBrowOuterUp - avgBrowDown)));
      driver.setOverrideParam('ParamBrowRY', Math.max(-1, Math.min(1, browUp + avgBrowOuterUp - avgBrowDown)));
      driver.setOverrideParam('ParamBrowLAngle', Math.max(-1, Math.min(1, -avgBrowDown + browUp * 0.5 - avgBrowOuterUp * 0.3)));
      driver.setOverrideParam('ParamBrowRAngle', Math.max(-1, Math.min(1, -avgBrowDown + browUp * 0.5 - avgBrowOuterUp * 0.3)));
      
      if (detail.body) {
        const headScale = aiSpeaking ? 0.3 : 1.0;
        if (detail.body.headPitch !== undefined) {
          driver.setOverrideParam('ParamAngleY', Math.max(-1, Math.min(1, detail.body.headPitch * 3 * headScale)));
        }
        if (detail.body.headYaw !== undefined) {
          driver.setOverrideParam('ParamAngleX', Math.max(-1, Math.min(1, detail.body.headYaw * 3 * headScale)));
        }
        if (detail.body.headRoll !== undefined) {
          driver.setOverrideParam('ParamAngleZ', Math.max(-1, Math.min(1, detail.body.headRoll * 3 * headScale)));
        }
        driver.setOverrideParam('ParamBodyAngleX', Math.max(-1, Math.min(1, (detail.body.headYaw || 0) * 1.5 * headScale)));
        driver.setOverrideParam('ParamBodyAngleY', Math.max(-1, Math.min(1, (detail.body.headPitch || 0) * 0.5 * headScale)));
      }
      
      const cheekPuff = bs['cheekPuff'] || 0;
      
      if (detail.emotion === 'happy' || detail.emotion === 'warm') {
        driver.setOverrideParam('ParamCheek', Math.min(1, 0.4 + avgSmile * 0.6));
      } else if (detail.emotion === 'shy') {
        driver.setOverrideParam('ParamCheek', 1);
      } else if (detail.emotion === 'angry' || detail.emotion === 'sad' || detail.emotion === 'surprised') {
        driver.setOverrideParam('ParamCheek', 0);
      } else {
        driver.setOverrideParam('ParamCheek', Math.min(0.3, cheekPuff));
      }
    };
    
    window.addEventListener('ai-emotion-change', handleAiEmotion);
    window.addEventListener('user-emotion-detected', handleUserEmotion);
    window.addEventListener('multimediapipe-data', handleMediaPipeData);
    return () => {
      window.removeEventListener('ai-emotion-change', handleAiEmotion);
      window.removeEventListener('user-emotion-detected', handleUserEmotion);
      window.removeEventListener('multimediapipe-data', handleMediaPipeData);
      if (mediapipeTimerRef.current) clearTimeout(mediapipeTimerRef.current);
    };
  }, [renderState]);

  if (!modelPath || modelPath === '') {
    return (
      <section
        className={`live2d-stage-shell ${compact ? 'compact-live2d-page' : ''}`}
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 8,
        }}
        aria-label={`${characterName} - 未绑定模型`}
      >
        <div style={{ fontSize: 40 }}>🎭</div>
        <div style={{ fontSize: 14, color: 'var(--text-primary, #fff)' }}>
          {characterName || '角色'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim, #888)' }}>
          未绑定 Live2D 模型
        </div>
      </section>
    );
  }

  return (
    <section
      ref={shellRef as React.RefObject<HTMLElement>}
      key={modelPath}
      className={`live2d-stage-shell ${compact ? 'compact-live2d-page' : ''}`}
      style={{ height: '100%', width: '100%' }}
      aria-label={`${characterName} Live2D 舞台`}
    >
      <canvas ref={canvasRef} id={canvasId} className="live2d-canvas" />
      <div className="live2d-emotion-chip">{currentEmotion || 'neutral'}</div>
      {renderState === 'loading' && <p className="live2d-inline-status">加载中...</p>}
      {renderState === 'error' && (
        <div className="live2d-error-overlay">
          <div className="live2d-error-card">
            <div className="live2d-error-title">模型加载失败</div>
            <div className="live2d-error-msg">{error}</div>
            <button className="live2d-retry-btn" onClick={() => setRetryToken(v => v + 1)}>重试</button>
          </div>
        </div>
      )}
    </section>
  );
});

export const Live2DPage = (props: Live2DPageProps) => {
  const navigate = useNavigate();
  const [models, setModels] = useState<Live2DModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<Live2DModelOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [personaDraft, setPersonaDraft] = useState({ name: '', subtitle: '', description: '', speakingStyle: '', systemPrompt: '' });

  const loadModels = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/live2d/models');
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = (await res.json()) as { models?: Live2DModelOption[] };
      const nextModels = data.models || [];
      setModels(nextModels);
      setSelectedModel((current) => current ?? nextModels[0] ?? null);
    } catch (error) { setMessage(error instanceof Error ? error.message : '模型列表加载失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (!props.compact) void loadModels(); }, [props.compact]);

  if (props.compact) return <StagePreview {...props} />;

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true); setMessage('');
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        const res = await apiFetch('/api/live2d/upload', { method: 'POST', body: form });
        if (!res.ok) throw new Error(await parseApiError(res));
      }
      setMessage('模型上传成功，已刷新列表');
      await loadModels();
    } catch (error) { setMessage(error instanceof Error ? error.message : '上传失败'); }
    finally { setUploading(false); }
  };

  const deleteModel = async (code: string) => {
    if (!confirm(`确定删除模型 ${code} 吗？绑定该模型的角色将不再显示 Live2D。`)) return;
    setDeletingCode(code);
    try {
      const res = await apiFetch(`/api/live2d/models/${code}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await parseApiError(res));
      setMessage('模型已删除');
      await loadModels();
      if (selectedModel?.code === code) setSelectedModel(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : '删除失败'); }
    finally { setDeletingCode(null); }
  };

  const createPersonaFromModel = async () => {
    if (!selectedModel) { setMessage('请先选择一个 Live2D 模型'); return; }
    if (!personaDraft.name.trim() || !personaDraft.systemPrompt.trim()) { setMessage('角色名称和系统提示词必填'); return; }
    const body = { ...personaDraft, modelKey: selectedModel.code, modelPath: selectedModel.path, aiModel: 'default', avatar: personaDraft.name.slice(0, 1), accent: 'var(--accent)', intro: personaDraft.description || personaDraft.subtitle, isSystem: false, extensible: true };
    try {
      const res = await apiFetch('/api/personas', { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json() as { persona: { id: string } };
      setMessage('角色创建成功，可进入聊天页对话');
      navigate(`/personas/${data.persona.id}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : '角色创建失败'); }
  };

  return (
    <section className="live2d-manage-page" style={{ padding: 24, display: 'grid', gap: 20, height: '100%', overflowY: 'auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, color: 'var(--accent)', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>LIVE2D MODELS</p>
          <h1 style={{ margin: '6px 0', color: 'var(--text-primary)' }}>Live2D 模型与角色绑定</h1>
          <p style={{ margin: 0, color: 'var(--text-dim)' }}>上传一个或多个 .zip 模型包，点击模型后填写人设与背景，即可生成聊天角色。每个角色拥有独立对话和独立记忆。</p>
        </div>
        <button type="button" className="l2d-btn-outline" onClick={() => navigate('/personas')}>去聊天</button>
      </header>

      <section style={{ padding: 20, border: '1px solid var(--border)', borderRadius: 20, background: 'var(--bg-secondary)' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <strong style={{ color: 'var(--text-primary)' }}>{uploading ? '上传中...' : '上传 Live2D zip 模型'}</strong>
          <input type="file" accept=".zip" multiple disabled={uploading} style={{ display: 'none' }} onChange={(event) => void uploadFiles(event.target.files)} />
          <span className="l2d-btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>选择文件</span>
        </label>
        <p style={{ margin: '10px 0 0', color: 'var(--text-dim)' }}>zip 内需要包含 `.model3.json` 文件；上传成功后会自动出现在下方模型列表。</p>
        {message ? <p style={{ color: message.includes('成功') ? 'var(--success)' : 'var(--error)' }}>{message}</p> : null}
      </section>

      <section style={{ padding: 20, border: '1px solid var(--border)', borderRadius: 20, background: 'var(--bg-tertiary)' }}>
        <h2 style={{ marginTop: 0, color: 'var(--text-label)', fontSize: '1rem', fontWeight: 700 }}>使用流程</h2>
        <ol style={{ margin: 0, paddingLeft: 20, color: 'var(--text-dim)', lineHeight: 1.8 }}>
          <li>先上传一个或多个 Live2D 模型。</li>
          <li>点击下方模型卡片，补充角色设定、背景与系统提示词。</li>
          <li>创建后跳转到聊天页，当前角色只读取自己的对话和记忆。</li>
        </ol>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 360px) 1fr', gap: 20, alignItems: 'start' }}>
        <aside style={{ padding: 20, border: '1px solid var(--border)', borderRadius: 20, background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 240px)', overflow: 'hidden' }}>
          <h2 style={{ marginTop: 0, color: 'var(--text-label)', fontSize: '1rem', fontWeight: 700 }}>已安装模型</h2>
          {loading ? <p style={{ color: 'var(--text-dim)' }}>加载中...</p> : null}
          {!loading && models.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border)', borderRadius: 16, minHeight: 120 }}>
              <p style={{ color: 'var(--text-dim)', margin: 0 }}>暂无模型，请先上传 zip</p>
            </div>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', flex: 1 }}>
            {models.map((model) => (
              <div
                key={model.code}
                style={{
                  padding: 12, borderRadius: 12,
                  border: selectedModel?.code === model.code ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: selectedModel?.code === model.code ? 'var(--bg-input)' : 'var(--bg-input-inner)',
                  cursor: 'pointer', position: 'relative', transition: 'border-color 180ms ease, background 180ms ease'
                }}
              >
                <div onClick={() => setSelectedModel(model)}>
                  <strong style={{ color: 'var(--text-primary)' }}>{model.isSystem ? '【系统】' : '【自定义】'} {model.name}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', wordBreak: 'break-all' }}>{model.path}</div>
                </div>
                {!model.isSystem && (
                  <button
                    onClick={() => void deleteModel(model.code)}
                    disabled={deletingCode === model.code}
                    style={{
                      marginTop: 8, padding: '4px 10px', fontSize: 12, borderRadius: 6,
                      border: '1px solid var(--border)', background: 'var(--bg-input-inner)', color: 'var(--error)', cursor: 'pointer', transition: 'all 180ms ease'
                    }}
                  >
                    {deletingCode === model.code ? '删除中...' : '删除'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </aside>

        <main style={{ display: 'grid', gap: 16 }}>
          <section style={{ height: 480, padding: 20, border: '1px solid var(--border)', borderRadius: 20, background: 'var(--bg-input-inner)', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ marginTop: 0, color: 'var(--text-label)', fontSize: '1rem', fontWeight: 700 }}>模型预览</h2>
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
              {selectedModel ? <StagePreview modelPath={selectedModel.path} characterName={selectedModel.name} /> : <p style={{ color: 'var(--text-dim)' }}>请先上传模型，再选择一个模型预览。</p>}
            </div>
          </section>

          <section style={{ padding: 20, border: '1px solid var(--border)', borderRadius: 20, background: 'var(--bg-secondary)' }}>
            <h2 style={{ marginTop: 0, color: 'var(--text-label)', fontSize: '1rem', fontWeight: 700 }}>基于当前模型创建角色</h2>
            <div style={{ display: 'grid', gap: 10 }}>
              <input className="l2d-input" placeholder="角色名称 *" value={personaDraft.name} onChange={(e) => setPersonaDraft((prev) => ({ ...prev, name: e.target.value }))} />
              <input className="l2d-input" placeholder="一句话定位" value={personaDraft.subtitle} onChange={(e) => setPersonaDraft((prev) => ({ ...prev, subtitle: e.target.value }))} />
              <textarea className="l2d-input" placeholder="性格与背景" rows={3} value={personaDraft.description} onChange={(e) => setPersonaDraft((prev) => ({ ...prev, description: e.target.value }))} />
              <textarea className="l2d-input" placeholder="说话风格" rows={2} value={personaDraft.speakingStyle} onChange={(e) => setPersonaDraft((prev) => ({ ...prev, speakingStyle: e.target.value }))} />
              <textarea className="l2d-input" placeholder="系统提示词 *：描述这个角色是谁、如何回应、记忆边界等" rows={6} value={personaDraft.systemPrompt} onChange={(e) => setPersonaDraft((prev) => ({ ...prev, systemPrompt: e.target.value }))} />
              <button type="button" className="l2d-btn-primary" disabled={!selectedModel} onClick={() => void createPersonaFromModel()} style={{ marginTop: 4 }}>创建绑定角色</button>
            </div>
          </section>
        </main>
      </div>
    </section>
  );
};