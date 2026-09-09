import { useEffect, useState, useRef, useCallback, useContext } from 'react';
import { AuthContext } from '../main';
import { apiFetch, parseApiError } from '../utils/auth';
import { logger } from '../utils/logger';
import { useAIMotionSystem } from '../hooks/useAIMotionSystem';
import { useNativeTTS } from '../hooks/useNativeTTS';
import { useWhisperStream } from '../hooks/useWhisperStream';
import { useWhisperWebSocket } from '../hooks/useWhisperWebSocket';
import { useStreamingConversation } from '../hooks/useStreamingConversation';
import { useVADAssistant } from '../hooks/useVADAssistant';
import { useLive2DControl } from '../hooks/useLive2DControl';
import { getLive2DDriver } from '../features/live2d-driver';
import { lipSyncController as _lipSyncController } from '../services/live2d/LipSyncController';
import { lipSyncEnhancer } from '../live2d-enhancements/LipSyncEnhancer';
import { StagePreview } from './Live2DPage';
import { EmotionDebugPanel } from '../components/EmotionDebugPanel';
import { live2dScheduler } from '../services/multimodal/Live2DScheduler';
import { emotionFusion } from '../services/multimodal/MultimodalEmotionFusion';
import type { EmotionResult, EmotionType } from '../services/multimodal/MultimodalEmotionFusion';
import { semanticEmotionAnalyzer as _semanticEmotionAnalyzer } from '../services/multimodal/SemanticEmotionAnalyzer';
import { unifiedEmotionOrchestrator } from '../services/multimodal/UnifiedEmotionOrchestrator';
import { useVoiceEmotion } from '../hooks/useVoiceEmotion';
import './ChatPage.css';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  emotion?: string;
  createdAt?: string;
};

type Persona = {
  id: string;
  name: string;
  subtitle: string;
  avatar?: string;
  accent?: string;
  description?: string;
  systemPrompt?: string;
  modelPath?: string;
  modelKey?: string;
};

type SessionSummary = {
  id: string;
  sessionId?: string;
  personaId: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
  messageCount: number;
};

type PersonaMemory = {
  id: string;
  content: string;
  tags: unknown;
  priority: number;
  createdAt: string;
  updatedAt: string;
};

export const ChatPage = () => {
  const { logout } = useContext(AuthContext)!;
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [currentPersona, setCurrentPersona] = useState<Persona | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [showPersonaDrawer, setShowPersonaDrawer] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [personaMemories, setPersonaMemories] = useState<PersonaMemory[]>([]);
  const [showMemories, setShowMemories] = useState(false);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [timeMode, setTimeMode] = useState<'morning' | 'afternoon' | 'evening' | 'night'>('morning');
  const [selectedVoice, setSelectedVoice] = useState<string>('zh-CN-XiaoxiaoNeural');
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true); // 全局音频开关
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // 语音情绪检测（复用麦克风，不干扰现有 VAD/Whisper）
  // 注意：vadAssistant 在后面声明，这里用 isVoiceListening 作为触发条件
  // vadAssistant.isListening 会在组件重渲染时通过 useEffect 同步
  const [voiceActive, setVoiceActive] = useState(false);
  const voiceEmotion = useVoiceEmotion(voiceActive);
  const voiceEmotionRef = useRef(voiceEmotion);
  useEffect(() => { voiceEmotionRef.current = voiceEmotion; }, [voiceEmotion]);

  // 多模态情绪融合结果
  const [fusedEmotion, setFusedEmotion] = useState<EmotionResult>({
    type: 'neutral', intensity: 0.1, confidence: 0.5, source: 'none',
  });
  const fusedEmotionRef = useRef(fusedEmotion);
  useEffect(() => { fusedEmotionRef.current = fusedEmotion; }, [fusedEmotion]);

  // 实时融合：视频(MediaPipe) + 语音(音频特征)
  useEffect(() => {
    const videoEmo = cameraEnabled && emotion
      ? { expression: emotion as EmotionType, intensity: confidence }
      : null;
    const result = emotionFusion.fuse(voiceEmotion, videoEmo);
    setFusedEmotion(result);
  }, [emotion, confidence, cameraEnabled, voiceEmotion]);

  // 融合情绪 → 实时驱动 Live2D 表情（不管开了视频还是语音，只要有情绪就驱动）
  useEffect(() => {
    if (fusedEmotion.source === 'none' || fusedEmotion.type === 'neutral') return;
    window.dispatchEvent(new CustomEvent('user-emotion-detected', {
      detail: { emotion: fusedEmotion.type, confidence: fusedEmotion.confidence, source: fusedEmotion.source }
    }));
  }, [fusedEmotion]);

  // 记录 AI 当前情绪，用于 TTS 同步
  const currentAiEmotionRef = useRef<string>('neutral');

  // MediaPipe 情绪识别 + AI 动作决策 + Live2D 驱动
  const { videoRef, emotion, confidence, error: camError, toggleCamera, cameraEnabled } = useAIMotionSystem({
    enabled: true,
  });
  const emotionRef = useRef(emotion);
  const confidenceRef = useRef(confidence);
  const cameraEnabledRef = useRef(cameraEnabled);
  useEffect(() => { emotionRef.current = emotion; }, [emotion]);
  useEffect(() => { confidenceRef.current = confidence; }, [confidence]);
  useEffect(() => { cameraEnabledRef.current = cameraEnabled; }, [cameraEnabled]);

  // WebSocket 语音识别（实时）
  const _whisperWS = useWhisperWebSocket({
    onInterim: (text) => {
      setInput(prev => prev + text);
    },
    onFinal: (text) => {
      setInput(text);
    },
    onError: (error) => {
      logger.error('[ChatPage] WebSocket STT 错误:', error);
    },
  });

  // 流式对话（备选）
  const _streamingConversation = useStreamingConversation();

  // Live2D 控制权管理
  useLive2DControl();

  // ═════════════════════════════════════════════
  // 【关键修复 A】注册 Live2DScheduler 回调
  // 没有这一步，live2dScheduler.schedule() 会空转！
  // ═════════════════════════════════════════════
  useEffect(() => {
    live2dScheduler.registerCallbacks({
      onPreloadEmotion: (emotion, _intensity) => {
        const driver = getLive2DDriver();
        if (driver) driver.driveEmotion(emotion);
      },
      onPlayAudio: (url) => {
        const audio = new Audio(url);
        audio.play().catch(() => {});
        const driver = getLive2DDriver();
        audio.addEventListener('loadedmetadata', () => {
          if (driver && audio.duration && isFinite(audio.duration)) {
            driver.startSpeechGesture(audio.duration * 1000, 0.6);
          }
        });
        audio.addEventListener('ended', () => {
          driver?.endSpeechGesture();
        });
        return audio;
      },
      onStopAudio: () => {
        // audio 由 scheduler 内部引用管理，自然结束即可
      },
      onLipSyncStart: (audio) => {
        window.dispatchEvent(new CustomEvent('lipsync-start', {
          detail: { audioElement: audio }
        }));
      },
      onLipSyncStop: () => {
        window.dispatchEvent(new CustomEvent('lipsync-stop'));
      },
      onMicroExpression: (params) => {
        const driver = getLive2DDriver();
        if (!driver) return;
        Object.entries(params).forEach(([id, value]) => {
          driver.setOverrideParam(id, value);
        });
      },
      onResetNeutral: () => {
        const driver = getLive2DDriver();
        if (driver) driver.driveEmotion('neutral');
      },
      onStateChange: (state) => {
        logger.log('[Scheduler] 状态:', state);
      },
    });
  }, []);

  // ═════════════════════════════════════════════
  // 【关键修复 B】绑定口型分析器 → Live2D
  // 没有这一步，LipSyncEnhancer 分析了音频却不驱动模型！
  // ═════════════════════════════════════════════
  useEffect(() => {
    lipSyncEnhancer.init({
      onMouthUpdate: (openY, form, _shape) => {
        const driver = getLive2DDriver();
        if (!driver) return;
        driver.setMouthOpen(openY);
        driver.setLipForm(form);
      },
    });
  }, []);

  // 浏览器原生 TTS（零延迟兜底）
  const { speak: speakNative, stop: stopNative } = useNativeTTS();

  // TTS 队列
  const ttsQueueRef = useRef<Array<{ text: string; emotion: string }>>([]);
  const isSynthesizingRef = useRef(false);
  const sentenceBufRef = useRef('');
  // 用于自引用的 ref，在 useEffect 中初始化
  const processTTSRef = useRef<(() => void) | null>(null);

  // 手动触发 Live2D 情绪响应
  const handleTriggerEmotion = useCallback((emotion: string) => {
    window.dispatchEvent(new CustomEvent('ai-emotion-change', { detail: { emotion } }));
  }, []);

  // 实时语音输入
  const sendMessageRef = useRef<() => Promise<void> | undefined>(undefined);
  const sendMessageWithTextRef = useRef<(text: string) => Promise<void> | undefined>(undefined);

  const handleVoiceAutoSend = useCallback(async (text: string) => {
    if (sendMessageWithTextRef.current) {
      await sendMessageWithTextRef.current(text);
    } else {
      setInput(text);
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      await sendMessageRef.current?.();
    }
  }, []);

  const {
    isListening: isVoiceListening,
    isStreaming: _isVoiceStreaming,
    volume: _voiceVolume,
    error: _voiceError,
    startListening: _startVoiceListening,
    stopListening: _stopVoiceListening,
  } = useWhisperStream({
    chunkInterval: 1500,
    silenceTimeout: 5000,
    onInterim: (text) => {
      setInput(prev => {
        const base = prev.replace(/🎤.*$/, '');
        return base + (text ? `🎤 ${text}` : '');
      });
      // 实时语义分析：语音识别中间结果 → 统一语义理解 → 驱动 Live2D
      if (text.length > 2) {
        unifiedEmotionOrchestrator.analyze({
          text,
          voiceEmotion: voiceEmotionRef.current,
          videoEmotion: cameraEnabledRef.current && emotionRef.current ? { expression: emotionRef.current as EmotionType, intensity: confidenceRef.current } : null,
        }).then(result => {
          if (result.emotion !== 'neutral' && result.confidence > 0.3) {
            window.dispatchEvent(new CustomEvent('user-emotion-detected', {
              detail: { emotion: result.emotion, confidence: result.confidence, source: result.source }
            }));
          }
        });
      }
    },
    onFinal: (text) => {
      setInput(text);
    },
    onAutoSend: handleVoiceAutoSend,
  });

  // VAD语音助手 - 全管线：VAD→STT→LLM→TTS→Live2D
  const vadAssistant = useVADAssistant(
    {
      onTranscript: (text) => {
        setInput(text);
        // 实时语义分析：VAD 识别结果 → 统一语义理解 → 驱动 Live2D
        if (text.length > 2) {
          unifiedEmotionOrchestrator.analyze({
            text,
            voiceEmotion: voiceEmotionRef.current,
            videoEmotion: cameraEnabledRef.current && emotionRef.current ? { expression: emotionRef.current as EmotionType, intensity: confidenceRef.current } : null,
          }).then(result => {
            if (result.emotion !== 'neutral' && result.confidence > 0.3) {
              window.dispatchEvent(new CustomEvent('user-emotion-detected', {
                detail: { emotion: result.emotion, confidence: result.confidence, source: result.source }
              }));
            }
          });
        }
      },
      onResponseStart: () => {
        setInput('');
      },
      onResponseText: (text) => {
        setInput(text);
      },
      onResponseEnd: () => {
        setInput('');
      },
      onError: (err) => {
        logger.error('[ChatPage-VAD] 错误:', err);
      },
      onAutoSend: handleVoiceAutoSend,
    },
    {
      personaId: currentPersona?.id,
    }
  );

  // 同步语音激活状态（vadAssistant 在 useVoiceEmotion 之后声明，用 state 桥接）
  useEffect(() => {
    setVoiceActive(vadAssistant.isListening || isVoiceListening);
  }, [vadAssistant.isListening, isVoiceListening]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const updateTimeMode = () => {
      const hour = new Date().getHours();
      if (hour < 12) setTimeMode('morning');
      else if (hour < 18) setTimeMode('afternoon');
      else if (hour < 22) setTimeMode('evening');
      else setTimeMode('night');
    };
    updateTimeMode();
    const timer = window.setInterval(updateTimeMode, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Load persona list
  useEffect(() => {
    const loadPersonas = async () => {
      try {
        const res = await apiFetch('/api/personas');
        if (res.ok) {
          const data = await res.json() as { personas: Persona[] };
          const list = data.personas || [];
          logger.log('[ChatPage] 加载角色列表:', list.length, '个角色');
          setPersonas(list);
          if (list.length > 0 && !currentPersona) {
            logger.log('[ChatPage] 自动选择第一个角色:', list[0].name, 'modelPath:', list[0].modelPath);
            setCurrentPersona(list[0]);
          }
        }
      } catch (err) {
        logger.error('加载角色列表失败:', err);
        // 如果是认证错误，则登出用户并重定向到登录页
        if (err instanceof Error && err.message.includes('登录已过期')) {
          logout();
          window.location.href = '/login';
        }
      }
    };
    loadPersonas();
  }, [logout]);

  // Load sessions when persona changes
  useEffect(() => {
    if (!currentPersona) return;
    const loadSessions = async () => {
      try {
        const res = await apiFetch(`/api/chats?personaId=${currentPersona.id}`);
        if (res.ok) {
          const data = await res.json() as { chats?: SessionSummary[] };
          const chatList: SessionSummary[] = data.chats || [];
          setSessions(chatList);
          if (chatList.length > 0) {
            setCurrentSessionId(chatList[0].sessionId || chatList[0].id);
          } else {
            setCurrentSessionId(null);
            setMessages([]);
          }
        }
      } catch (err) {
        logger.error('加载会话失败:', err);
        // 如果是认证错误，则登出用户并重定向到登录页
        if (err instanceof Error && err.message.includes('登录已过期')) {
          logout();
          window.location.href = '/login';
        }
      }
    };
    loadSessions();
  }, [currentPersona, logout]);

  // Load messages when session changes
  useEffect(() => {
    if (!currentSessionId) return;
    const loadMessages = async () => {
      try {
        const res = await apiFetch(`/api/chats/${currentSessionId}/messages`);
        if (res.ok) {
          const data = await res.json() as { messages?: ChatMessage[] };
          setMessages(data.messages || []);
        }
      } catch (err) {
        logger.error('加载消息失败:', err);
        // 如果是认证错误，则登出用户并重定向到登录页
        if (err instanceof Error && err.message.includes('登录已过期')) {
          logout();
          window.location.href = '/login';
        }
      }
    };
    loadMessages();
  }, [currentSessionId, logout]);

  const loadMemories = useCallback(async () => {
    if (!currentPersona?.id) return;
    setLoadingMemories(true);
    try {
      const res = await apiFetch(`/api/personas/${currentPersona.id}/memories`);
      if (res.ok) {
        const data = await res.json() as { memories?: PersonaMemory[] };
        setPersonaMemories(data.memories || []);
      }
    } catch (err) {
      logger.error('加载记忆失败:', err);
      // 如果是认证错误，则登出用户并重定向到登录页
      if (err instanceof Error && err.message.includes('登录已过期')) {
        logout();
        window.location.href = '/login';
      }
    } finally {
      setLoadingMemories(false);
    }
  }, [currentPersona, logout]);

  const selectPersona = (persona: Persona) => {
    setCurrentPersona(persona);
    setCurrentSessionId(null);
    setMessages([]);
    setShowPersonaDrawer(false);
  };

  // 处理 TTS 队列（句子级并行请求 Coqui）- 使用 ref 实现自引用
  const processTTSQueue = useCallback(async () => {
    if (isSynthesizingRef.current || ttsQueueRef.current.length === 0) return;
    isSynthesizingRef.current = true;

    while (ttsQueueRef.current.length > 0) {
      const item = ttsQueueRef.current.shift()!;
      try {
        const res = await apiFetch('/api/tts', {
          method: 'POST',
          body: JSON.stringify({ text: item.text, personaId: currentPersona?.id, voiceId: selectedVoice }),
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          await live2dScheduler.schedule(item.emotion as EmotionType, 0.8, url, item.text);
        } else {
          throw new Error('TTS request failed');
        }
      } catch (e) {
        logger.warn('Backend TTS failed, fallback to native:', e);
        const text = item.text;
        const emo = item.emotion as EmotionType;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const zhVoice = voices.find(v => v.lang.includes('zh'));
        if (zhVoice) utterance.voice = zhVoice;

        // 预热表情
        window.dispatchEvent(new CustomEvent('ai-emotion-change', { detail: { emotion: emo } }));
        (window as unknown as Record<string, unknown>).__AI_IS_SPEAKING__ = true;

        // 启动口型静音模拟
        const estimatedDuration = Math.max(800, text.length / 4.5 * 1000);
        window.dispatchEvent(new CustomEvent('lipsync-start', { detail: { text, durationMs: estimatedDuration } }));
        lipSyncEnhancer.startSilentSimulation(text, estimatedDuration);

        const driver = getLive2DDriver();
        if (driver) driver.startSpeechGesture(estimatedDuration, 0.6);

        utterance.onend = () => {
          lipSyncEnhancer.stop();
          driver?.endSpeechGesture();
          (window as unknown as Record<string, unknown>).__AI_IS_SPEAKING__ = false;
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('ai-emotion-change', { detail: { emotion: 'neutral' } }));
          }, 600);
        };
        utterance.onerror = () => {
          lipSyncEnhancer.stop();
          driver?.endSpeechGesture();
          (window as unknown as Record<string, unknown>).__AI_IS_SPEAKING__ = false;
        };
        window.speechSynthesis.speak(utterance);
      }
    }
    isSynthesizingRef.current = false;
    if (ttsQueueRef.current.length > 0) {
      processTTSRef.current?.();
    }
  }, [currentPersona, selectedVoice, speakNative]);

  // 将 processTTSQueue 存储到 ref 中以便自引用
  useEffect(() => {
    processTTSRef.current = processTTSQueue;
  }, [processTTSQueue]);

  // 按标点切句并加入 TTS 队列
  const queueTextForTTS = useCallback((text: string, emotion?: string) => {
    if (!isVoiceEnabled) return;
    const emo = emotion || currentAiEmotionRef.current;
    sentenceBufRef.current += text;
    const sentences = sentenceBufRef.current.split(/([。！？，、；:.!?;,]\s*)/);
    sentenceBufRef.current = sentences.pop() || '';
    for (let i = 0; i < sentences.length; i += 2) {
      const s = (sentences[i] + (sentences[i + 1] || '')).trim();
      if (s.length > 0) {
        ttsQueueRef.current.push({ text: s, emotion: emo });
      }
    }
    processTTSRef.current?.();
  }, [isVoiceEnabled]);

  const sendMessage = async (overrideText?: string) => {
    const content = (overrideText ?? input).trim();
    if (!content || loading || !currentPersona) return;

    live2dScheduler.interrupt();
    stopNative();

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setError(undefined);

    try {
      // 统一语义理解：文字 + 语音特征 + 视频表情 → 本地分析 + AI仲裁（冲突时）
      const unifiedResult = await unifiedEmotionOrchestrator.analyze({
        text: content,
        voiceEmotion: voiceEmotion,
        videoEmotion: cameraEnabled && emotion
          ? { expression: emotion as EmotionType, intensity: confidence }
          : null,
      });

      const body: Record<string, unknown> = {
        message: content,
        personaId: currentPersona.id,
        userEmotion: unifiedResult.emotion,
        userEmotionConfidence: unifiedResult.confidence,
        userEmotionSource: unifiedResult.source,
        userEmotionConsistency: unifiedResult.consistency,
        userEmotionAiResolved: unifiedResult.aiResolved,
        userEmotionTextSentiment: unifiedResult.textSentiment ? {
          valence: unifiedResult.textSentiment.valence,
          arousal: unifiedResult.textSentiment.arousal,
          keywords: unifiedResult.textSentiment.keywords,
        } : undefined,
      };
      if (currentSessionId) {
        body.sessionId = currentSessionId;
      }
      // 带上用户情绪
      if (emotion) {
        body.emotion = emotion;
      }

      const res = await apiFetch(`/api/personas/${currentPersona.id}/chat`, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errMsg = await parseApiError(res);
        throw new Error(errMsg);
      }

      // SSE stream response
      const reader = res.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      let fullReply = '';
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) continue;
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as {
                token?: string;
                content?: string;
                text?: string;
                reply?: string;
                emotion?: string;
                sessionId?: string;
                type?: string;
                timeMode?: 'morning' | 'afternoon' | 'evening' | 'night';
              };
              if (data.type === 'connected') {
                if (data.emotion && currentPersona) {
                  window.dispatchEvent(new CustomEvent('ai-emotion-change', {
                    detail: { emotion: data.emotion, personaId: currentPersona.id }
                  }));
                  currentAiEmotionRef.current = data.emotion;
                }
                continue;
              }
              if (data.timeMode) {
                setTimeMode(data.timeMode);
              }
              if (data.emotion && currentPersona) {
                window.dispatchEvent(new CustomEvent('ai-emotion-change', {
                  detail: { emotion: data.emotion, personaId: currentPersona.id }
                }));
                currentAiEmotionRef.current = data.emotion;
              }
              const normalizeSseText = (value?: string) => {
                if (!value) return '';
                const trimmed = value.trim();
                if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                  try {
                    const parsed = JSON.parse(trimmed) as { text?: string; content?: string; reply?: string; emotion?: string };
                    return parsed.text || parsed.content || parsed.reply || '';
                  } catch {
                    return value;
                  }
                }
                return value;
              };
              const deltaText = normalizeSseText(data.token ?? data.content ?? data.text);
              if (deltaText) {
                fullReply += deltaText;
                // ✅ 流式 TTS：边收边切句
                queueTextForTTS(deltaText);
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant' && last.id.startsWith('assistant-')) {
                    updated[updated.length - 1] = { ...last, content: fullReply, emotion: data.emotion || last.emotion };
                  } else {
                    updated.push({
                      id: `assistant-${Date.now()}`,
                      role: 'assistant',
                      content: fullReply,
                      emotion: data.emotion
                    });
                  }
                  return updated;
                });
              }
              const finalReply = normalizeSseText(data.reply);
              if (finalReply) {
                fullReply = finalReply;
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant' && last.id.startsWith('assistant-')) {
                    updated[updated.length - 1] = { ...last, content: fullReply, emotion: data.emotion || last.emotion };
                  } else {
                    updated.push({
                      id: `assistant-${Date.now()}`,
                      role: 'assistant',
                      content: fullReply,
                      emotion: data.emotion
                    });
                  }
                  return updated;
                });
              }
              if (data.sessionId) {
                setCurrentSessionId(data.sessionId);
                if (currentPersona) {
                  void apiFetch(`/api/chats?personaId=${currentPersona.id}`).then(async (r) => {
                    if (r.ok) {
                      const d = await r.json() as { chats?: SessionSummary[] };
                      setSessions(d.chats || []);
                    }
                  });
                }
              }
            } catch {
              // Skip non-JSON data lines
            }
          }
        }
      }
      // 流结束，把缓冲的剩余文本也读掉
      if (sentenceBufRef.current.trim().length > 0) {
        const remaining = sentenceBufRef.current.trim();
        ttsQueueRef.current.push({ text: remaining, emotion: currentAiEmotionRef.current });
        sentenceBufRef.current = '';
        processTTSRef.current?.();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '连接服务器失败';
      // 如果是认证错误，则登出用户并重定向到登录页
      if (err instanceof Error && err.message.includes('登录已过期')) {
        logout();
        window.location.href = '/login';
        return;
      }
      setError(message);
      setMessages(prev => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: `出错了：${message}`
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // 赋值给ref，让语音自动发送能调用
  sendMessageRef.current = sendMessage;
  sendMessageWithTextRef.current = async (text: string) => {
    setInput(text);
    await sendMessage(text);
  };

  const getInitial = (name: string) => name.charAt(0) || '?';

  const getEmotionEmoji = (emotion?: string) => {
    switch (emotion) {
      case 'happy': return '😊';
      case 'sad': return '😢';
      case 'angry': return '😠';
      case 'tsundere': return '😤';
      case 'shy': return '😳';
      case 'warm': return '🤗';
      case 'neutral': return '😐';
      default: return '✨';
    }
  };

  const getUserEmotionEmoji = (em?: string) => {
    switch (em) {
      case 'happy': return '😊';
      case 'sad': return '😢';
      case 'angry': return '😠';
      case 'surprised': return '😲';
      case 'fearful': return '😨';
      case 'disgusted': return '🤢';
      default: return '😐';
    }
  };

  return (
    <main className="chat-page">
      {/* Top bar with persona selector */}
      <div className="chat-topbar">
        <button className="back-btn" onClick={() => setShowPersonaDrawer(true)} title="切换角色">
          ☰
        </button>
        <div className="persona-info" onClick={() => setShowPersonaDrawer(true)} style={{ cursor: 'pointer' }}>
          <div className="persona-name">
            <span
              className="avatar-circle"
              style={{ background: currentPersona?.accent || 'var(--accent)' }}
            >
              {currentPersona ? getInitial(currentPersona.name) : '?'}
            </span>
            {currentPersona?.name || '选择角色'}
          </div>
          <div className="persona-subtitle">
            {currentPersona?.subtitle || (currentPersona ? currentPersona.description : '') || '选择一个角色开始对话'} · {timeMode === 'morning' ? '早晨' : timeMode === 'afternoon' ? '下午' : timeMode === 'evening' ? '傍晚' : '夜晚'}
          </div>
        </div>
        <div className="topbar-actions">
          {/* 全局音频开关 */}
          <button
            onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
            title={isVoiceEnabled ? '🔊 关闭语音' : '🔇 开启语音'}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: '1px solid var(--accent)',
              background: isVoiceEnabled ? 'transparent' : 'var(--accent)',
              color: isVoiceEnabled ? 'var(--text-dim)' : 'var(--bg-primary)',
              cursor: 'pointer',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isVoiceEnabled ? '🔊' : '🔇'}
          </button>
          
          {/* 语音选择下拉 */}
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            title="选择语音"
            style={{
              height: 36,
              borderRadius: 8,
              border: '1px solid var(--accent)',
              background: 'transparent',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              fontSize: 13,
              padding: '0 8px'
            }}
          >
            <option value="zh-CN-XiaoxiaoNeural">🌸 晓晓</option>
            <option value="zh-CN-YunxiNeural">🌸 云希</option>
            <option value="zh-CN-YunyangNeural">🎤 云扬</option>
            <option value="zh-CN-XiaoyiNeural">🎤 小艺</option>
            <option value="en-US-JennyNeural">🇺🇸 Jenny</option>
            <option value="en-US-GuyNeural">🇺🇸 Guy</option>
          </select>
          
          <button
            onClick={() => {
              setShowMemories(!showMemories);
              if (!showMemories) loadMemories();
            }}
            title="角色记忆"
          >
            🧠
          </button>
          <button onClick={() => setShowHistory(!showHistory)} title="对话历史">
            📋
          </button>
        </div>
      </div>

      {/* Persona selection drawer */}
      <div className={`persona-drawer${showPersonaDrawer ? '' : ' hidden'}`}>
        <div className="drawer-overlay" onClick={() => setShowPersonaDrawer(false)} />
        <div className="drawer-panel">
          <div className="drawer-title">
            <span>切换角色</span>
            <button className="close-btn" onClick={() => setShowPersonaDrawer(false)}>×</button>
          </div>
          {personas.map(persona => (
            <div
              key={persona.id}
              className={`persona-card-item${currentPersona?.id === persona.id ? ' active' : ''}`}
              onClick={() => selectPersona(persona)}
            >
              <span
                className="card-avatar"
                style={{ background: persona.accent || 'var(--accent)' }}
              >
                {getInitial(persona.name)}
              </span>
              <div className="card-info">
                <div className="card-name">{persona.name}</div>
                <div className="card-sub">{persona.subtitle || persona.description || ''}</div>
              </div>
            </div>
          ))}
          {personas.length === 0 && (
            <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 20 }}>
              暂无角色，请先创建角色
            </div>
          )}
        </div>
      </div>

      {/* Memories panel */}
      {showMemories && currentPersona && (
        <div className="persona-drawer" style={{ zIndex: 90 }}>
          <div className="drawer-overlay" onClick={() => setShowMemories(false)} />
          <div className="drawer-panel" style={{ right: 0, left: 'auto' }}>
            <div className="drawer-title">
              <span>🧠 {currentPersona.name} 的记忆</span>
              <button className="close-btn" onClick={() => setShowMemories(false)}>×</button>
            </div>
            {loadingMemories ? (
              <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                加载中...
              </div>
            ) : personaMemories.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                暂无记忆。AI 会在聊天过程中自动记住关于你的事情。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {personaMemories.map(m => (
                  <div
                    key={m.id}
                    style={{
                      background: 'var(--bg-input-inner)',
                      padding: '10px 12px',
                      borderRadius: 10,
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      lineHeight: 1.5
                    }}
                  >
                    <div>{m.content}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                      ⭐ {m.priority}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main content area with Live2D and messages */}
      <div className="chat-main-content">
        {/* Live2D fixed panel */}
        <div className="chat-live2d-panel">
          {currentPersona?.modelPath ? (
            <StagePreview
              modelPath={currentPersona.modelPath}
              characterName={currentPersona.name}
              compact={true}
            />
          ) : (
            <div className="live2d-placeholder">
              <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                {currentPersona ? '该角色未绑定Live2D模型' : '请选择角色'}
              </div>
            </div>
          )}
        </div>

        {/* 右侧：消息列表 + 输入框 */}
        <div className="chat-right-area">
          {/* Message area - 唯一可滚动的区域 */}
          <div className="chat-messages">
          {messages.length === 0 && (
            <div className="empty-hint">
              {currentPersona
                ? `开始和 ${currentPersona.name} 对话吧`
                : '请选择一个角色开始对话'}
            </div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`msg-bubble ${message.role}`}>
              {message.role === 'assistant' && currentPersona && (
                <div className="sender-name">{currentPersona.name}</div>
              )}
              {message.role === 'user' && (
                <div className="sender-name">你</div>
              )}
              <div className="message-content">{message.content}</div>
              {message.role === 'assistant' && message.emotion && (
                <div className="emotion-badge" title={`AI 当前情绪：${message.emotion}`}>
                  <span>{getEmotionEmoji(message.emotion)}</span>
                  <span>{message.emotion}</span>
                </div>
              )}
              
              {/* 语音朗读按钮 */}
              {message.role === 'assistant' && (
                <button
                  className="tts-play-btn"
                  onClick={() => {
                    stopNative();
                    speakNative(message.content);
                  }}
                  title="语音朗读"
                  style={{
                    marginTop: 6,
                    padding: '4px 10px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid var(--accent)',
                    background: 'transparent',
                    color: 'var(--text-dim)',
                    cursor: 'pointer'
                  }}
                >
                  🔊 朗读
                </button>
              )}
            </div>
          ))}
          {loading && <div className="typing-cursor" />}
          <div ref={bottomRef} />
          </div>

          {/* 摄像头预览 - 左上角悬浮 */}
          {cameraEnabled && (
            <div style={{
              position: 'fixed',
              top: 68,
              left: 12,
              zIndex: 1000,
              borderRadius: 10,
              overflow: 'hidden',
              border: '2px solid var(--accent)',
              boxShadow: 'var(--card-shadow)',
              width: 160,
              height: 120,
              background: 'var(--bg-primary)',
            }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
              />
              {emotion && (
                <span style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  fontSize: 12,
                  textAlign: 'center',
                  background: 'var(--overlay-bg)',
                  color: 'var(--text-primary)',
                  padding: '2px 0',
                }}>
                  {getUserEmotionEmoji(emotion)} {(confidence * 100).toFixed(0)}%
                </span>
              )}
            </div>
          )}

          {/* 底部输入框 - 固定在底部 */}
          <div className="chat-composer">
            <div className="composer-row">
              {/* 摄像头开关 */}
              <button
                type="button"
                onClick={() => {
                  toggleCamera();
                }}
                className={`camera-btn ${cameraEnabled ? 'active' : ''}`}
                title={cameraEnabled ? '关闭情绪识别' : '开启摄像头情绪识别'}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  border: '1px solid var(--accent)',
                  background: cameraEnabled ? 'var(--accent)' : 'transparent',
                  color: cameraEnabled ? 'var(--bg-primary)' : 'var(--text-dim)',
                  cursor: 'pointer',
                  fontSize: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                📷
              </button>

              {/* VAD语音全管线按钮 */}
              {typeof navigator.mediaDevices !== 'undefined' && (
                <button
                  type="button"
                  onClick={() => {
                    console.log('[VAD按钮] 点击! isListening:', vadAssistant.isListening, 'isProcessing:', vadAssistant.isProcessing);
                    vadAssistant.toggle();
                  }}
                  title={
                    vadAssistant.isListening
                      ? 'VAD监听中，点击停止'
                      : vadAssistant.isProcessing
                        ? 'AI处理中...'
                        : 'VAD语音（按1次一直听）'
                  }
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: vadAssistant.isListening ? 22 : 8,
                    border: vadAssistant.isListening
                      ? '3px solid #4CAF50'
                      : vadAssistant.isProcessing
                        ? '3px solid #FF9800'
                        : '2px solid #4CAF50',
                    background: vadAssistant.isListening
                      ? 'rgba(76, 175, 80, 0.3)'
                      : vadAssistant.isProcessing
                        ? 'rgba(255, 152, 0, 0.3)'
                        : 'rgba(76, 175, 80, 0.08)',
                    color: vadAssistant.isListening
                      ? '#4CAF50'
                      : vadAssistant.isProcessing
                        ? '#FF9800'
                        : '#4CAF50',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    position: 'relative',
                    animation: vadAssistant.isListening ? 'pulse 1.5s ease-in-out infinite' : 'none',
                    flexShrink: 0,
                  }}
                >
                  {vadAssistant.isListening ? '⏹' : vadAssistant.isProcessing ? '⚡' : 'VAD'}
                </button>
              )}
              {vadAssistant.isListening && (
                <span style={{ fontSize: 11, color: '#4CAF50', whiteSpace: 'nowrap', fontWeight: 600 }}>
                  监听中
                </span>
              )}
              {vadAssistant.isProcessing && (
                <span style={{ fontSize: 11, color: '#FF9800', whiteSpace: 'nowrap', fontWeight: 600 }}>
                  AI思考
                </span>
              )}

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder={currentPersona ? `给 ${currentPersona.name} 发消息...` : '请先选择角色'}
                rows={2}
                maxLength={500}
                disabled={!currentPersona}
              />
              <button
                className="composer-btn send-btn"
                onClick={() => void sendMessage()}
                disabled={loading || !input.trim() || input.trim().length > 500 || !currentPersona}
              >
                {loading ? '⋯' : '➤'}
              </button>
            </div>
            {camError && <div style={{ color: 'var(--error)', fontSize: 12, padding: '4px 8px' }}>{camError}</div>}
          </div>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="history-sheet">
          <div className="history-header">
            <span>📋 对话历史</span>
            <button className="close-btn" onClick={() => setShowHistory(false)}>×</button>
          </div>
          {sessions.length === 0 ? (
            <div className="empty-hint" style={{ marginTop: 20 }}>
              暂无对话记录
            </div>
          ) : (
            sessions.map(session => {
              const sid = session.sessionId || session.id;
              const isActive = currentSessionId === sid;
              return (
                <div
                  key={sid}
                  className={`history-item${isActive ? ' active' : ''}`}
                  onClick={() => {
                    setCurrentSessionId(sid);
                    setShowHistory(false);
                  }}
                >
                  <div className="history-title">{session.title}</div>
                  <div className="history-preview">{session.lastMessage}</div>
                  <div className="history-meta">
                    {new Date(session.updatedAt).toLocaleString('zh-CN')} · {session.messageCount} 条消息
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {error && <div className="composer-error">{error}</div>}

      {/* 情绪调试面板 */}
      <EmotionDebugPanel onTriggerEmotion={handleTriggerEmotion} />

      {/* 多模态融合情绪指示器 */}
      <div style={{
        position: 'fixed', bottom: 80, left: 12, zIndex: 1000,
        background: 'var(--overlay-bg)', color: 'var(--text-primary)',
        padding: '4px 10px', borderRadius: 8, fontSize: 12,
        border: '1px solid var(--border)', pointerEvents: 'none',
      }}>
        {fusedEmotion.source !== 'none' && (
          <span>
            {fusedEmotion.source === 'fused' ? '🔀' : fusedEmotion.source === 'video' ? '📷' : '🎤'}
            {' '}{fusedEmotion.type} ({(fusedEmotion.confidence * 100).toFixed(0)}%)
          </span>
        )}
      </div>
    </main>
  );
};