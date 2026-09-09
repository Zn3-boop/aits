import { useCallback, useEffect, useRef, useState, useContext } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../main';
import { Live2DPage } from './Live2DPage';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useVADAssistant } from '../hooks/useVADAssistant';
import { useAIMotionSystem } from '../hooks/useAIMotionSystem';
import { useChat } from '../contexts/ChatContext';
import { getLive2DDriver } from '../features/live2d-driver/driver';
import type { Persona } from '../types/index';
import { apiFetch, parseApiError } from '../utils/auth';
import { logger } from '../utils/logger';
import './PersonaDetailPage.css';

type DetailPersona = Persona & {
  modelPath?: string;
  live2dModelUrl?: string;
  voiceId?: string;
  live2dModelId?: string;
  skills?: string[];
};

type DetailMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  emotion?: string;
};

type PersonaMemoryItem = {
  id: string;
  content: string;
  priority?: number;
  updatedAt: string;
};

type PersonaFormData = {
  name: string;
  subtitle: string;
  description: string;
  speakingStyle: string;
  systemPrompt: string;
  modelKey: string;
};

const DEFAULT_MODEL_PATH = '/live2d/models/kei_basic_free/runtime/kei_basic_free.model3.json';

const getErrorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

const inferEmotion = (text: string): string => {
  const t = text.toLowerCase();
  if (/开心|高兴|哈哈|😄|😊|😆|great|happy|wonderful/.test(t)) return 'happy';
  if (/难过|伤心|哭|😢|😭|sad|sorry/.test(t)) return 'sad';
  if (/生气|愤怒|😠|😡|angry|mad/.test(t)) return 'angry';
  if (/惊讶|震惊|😲|😮|wow|surprised/.test(t)) return 'surprised';
  if (/害羞|脸红|😳|shy|embarrassed/.test(t)) return 'shy';
  return 'neutral';
};

const VOICE_OPTIONS = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓 (女声)', lang: 'zh-CN' },
  { id: 'zh-CN-YunxiNeural', name: '云希 (男声)', lang: 'zh-CN' },
  { id: 'zh-CN-YunyangNeural', name: '云扬 (新闻)', lang: 'zh-CN' },
  { id: 'zh-CN-XiaoyiNeural', name: '小艺 (女声)', lang: 'zh-CN' },
  { id: 'zh-CN-YunjianNeural', name: '云健 (男声)', lang: 'zh-CN' },
  { id: 'en-US-JennyNeural', name: 'Jenny (英文女声)', lang: 'en-US' },
  { id: 'en-US-GuyNeural', name: 'Guy (英文男声)', lang: 'en-US' },
  { id: 'ja-JP-NanamiNeural', name: '七海 (日语女声)', lang: 'ja-JP' },
  { id: 'ko-KR-SunHiNeural', name: '善熙 (韩语女声)', lang: 'ko-KR' },
];

const normalizeSseText = (value?: string) => {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as { text?: string; content?: string; reply?: string; emotion?: string };
      return parsed.text || parsed.content || parsed.reply || '';
    } catch { return value; }
  }
  return value;
};

const toContextPersona = (persona: DetailPersona): Persona => ({
  id: persona.id,
  name: persona.name || '',
  subtitle: persona.subtitle || '',
  description: persona.description || '',
  speakingStyle: persona.speakingStyle || '',
  systemPrompt: persona.systemPrompt || '',
  modelKey: persona.modelKey || '',
  avatar: persona.avatar,
  accent: persona.accent,
  intro: persona.intro,
  isSystem: persona.isSystem,
  extensible: persona.extensible,
});

const getEmotionEmoji = (emotion?: string) => {
  switch (emotion) {
    case 'happy': return '😊';
    case 'sad': return '😢';
    case 'angry': return '😠';
    case 'tsundere': return '😤';
    case 'shy': return '😳';
    case 'warm': return '🤗';
    case 'surprised': return '😮';
    case 'neutral': return '😐';
    default: return '✨';
  }
};

const PersonaDetailSkeleton = () => (
  <div className="persona-live-page">
    <div className="persona-stage"><div className="detail-loading-card">角色加载中...</div></div>
    <aside className="persona-chat-panel"><div className="detail-loading-card">聊天面板准备中...</div></aside>
  </div>
);

// ✅ 全局类型声明，避免 TS 报错
declare global {
  interface Window {
    __AI_IS_SPEAKING__?: boolean;
  }
}

export const PersonaDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { currentPersona, setCurrentPersona, setCurrentChat, setMessages: setGlobalMessages } = useChat();
  const { logout } = useContext(AuthContext)!;

  const [persona, setPersona] = useState<DetailPersona | null>(null);
  const [formData, setFormData] = useState<PersonaFormData>({
    name: '', subtitle: '', description: '', speakingStyle: '', systemPrompt: '', modelKey: '',
  });
  const [messages, setMessages] = useState<DetailMessage[]>([]);
  const [input, setInput] = useState('');
  const [currentEmotion, setCurrentEmotion] = useState('neutral');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showSettings, setShowSettings] = useState(searchParams.get('tab') === 'settings');
  const [memories, setMemories] = useState<PersonaMemoryItem[]>([]);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const [autoVoiceEnabled, setAutoVoiceEnabled] = useState(() => localStorage.getItem('autoVoiceEnabled') === 'true');
  const [showVoiceSelect, setShowVoiceSelect] = useState(false);

  // 流式TTS音频队列
  const audioQueueRef = useRef<HTMLAudioElement[]>([]);
  const isPlayingQueueRef = useRef(false);
  const currentVoiceIdRef = useRef<string>('zh-CN-XiaoxiaoNeural');

  useEffect(() => { localStorage.setItem('autoVoiceEnabled', String(autoVoiceEnabled)); }, [autoVoiceEnabled]);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const voiceSelectRef = useRef<HTMLDivElement>(null);

  const onVoiceFinal = useCallback((text: string) => {
    setInput((prev) => `${prev}${prev ? ' ' : ''}${text}`.trim());
  }, []);

  const { isListening, interimTranscript, isSupported, error: voiceError, startListening, stopListening } = useVoiceInput(onVoiceFinal);

  // sendMessage 的 ref，延迟绑定
  const sendMessageRef = useRef<(text: string) => Promise<void>>((_: string) => Promise.resolve());

  // VAD语音助手 - 全管线：VAD→STT→LLM→TTS→Live2D
  const vadAssistant = useVADAssistant(
    {
      onTranscript: (text) => {
        setInput(text);
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
        logger.error('[PersonaDetail-VAD] 错误:', err);
      },
      onAutoSend: (text) => {
        if (text.trim()) {
          void sendMessageRef.current(text);
        }
      },
    },
    {
      personaId: id,
    }
  );

  const { videoRef, emotion: userEmotion, isReady: cameraReady, error: cameraError, cameraEnabled, toggleCamera } = useAIMotionSystem({
    enabled: true,
  });

  const modelPath = persona?.modelPath || persona?.live2dModelUrl || DEFAULT_MODEL_PATH;
  const isReadOnly = persona?.extensible === false || persona?.isSystem === true;

  // 点击外部关闭音色选择
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (voiceSelectRef.current && !voiceSelectRef.current.contains(event.target as Node)) {
        setShowVoiceSelect(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { return () => { abortRef.current?.abort(); }; }, []);

  useEffect(() => {
    const loadPersona = async () => {
      if (!id) return;
      setIsLoading(true); setError(null);
      try {
        const res = await apiFetch(`/api/personas/${id}`);
        if (res.status === 404) { setError('角色不存在或已被删除'); return; }
        if (!res.ok) throw new Error(await parseApiError(res));
        const payload = await res.json() as { persona?: DetailPersona } | DetailPersona;
        const data = 'persona' in payload && payload.persona ? payload.persona : (payload as DetailPersona);
        setPersona(data);
        setCurrentPersona(toContextPersona(data));
        setFormData({
          name: data.name || '', subtitle: data.subtitle || '', description: data.description || '',
          speakingStyle: data.speakingStyle || '', systemPrompt: data.systemPrompt || '', modelKey: data.modelKey || '',
        });
      } catch (err) {
        if (err instanceof Error && err.message.includes('登录已过期')) {
          logout();
          navigate('/login');
          return;
        }
        setError(getErrorMessage(err, '加载失败，请重试'));
      }
      finally { setIsLoading(false); }
    };
    void loadPersona();
  }, [id, setCurrentPersona, logout, navigate]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!id) return;
      try {
        const res = await apiFetch(`/api/personas/${id}/conversations?limit=30`);
        if (!res.ok) return;
        const data = await res.json() as { conversations?: Array<{ id: string; role: 'user' | 'assistant'; content: string; emotion?: string }> };
        setMessages((data.conversations || []).map((item) => ({ id: item.id, role: item.role, content: item.content, emotion: item.emotion })));
      } catch { /* ignore */ }
    };
    void loadHistory();
  }, [id]);

  useEffect(() => {
    const loadMemories = async () => {
      if (!id) return;
      try {
        const res = await apiFetch(`/api/personas/${id}/memories`);
        if (!res.ok) return;
        const result = await res.json();
        setMemories(Array.isArray(result) ? result : (result.data || []));
      } catch { /* ignore */ }
    };
    void loadMemories();
  }, [id]);

  const driveEmotion = useCallback((emotion?: string) => {
    if (!emotion || !id) return;
    setCurrentEmotion(emotion);
    window.dispatchEvent(new CustomEvent('ai-emotion-change', { detail: { emotion, personaId: id } }));
  }, [id]);

  // 流式TTS音频队列播放
  const playNextAudio = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingQueueRef.current = false;
      window.__AI_IS_SPEAKING__ = false;
      return;
    }

    const audio = audioQueueRef.current.shift();
    if (!audio) {
      playNextAudio();
      return;
    }

    audio.onended = () => {
      URL.revokeObjectURL(audio.src);
      playNextAudio();
    };

    audio.onerror = () => {
      logger.warn('[TTS Queue] 音频播放错误');
      URL.revokeObjectURL(audio.src);
      playNextAudio();
    };

    audio.play().catch(() => {
      logger.warn('[TTS Queue] 播放失败');
      playNextAudio();
    });
  }, []);

  // 添加音频到队列
  const enqueueAudio = useCallback((base64Audio: string) => {
    // ✅ 全局语音开关关闭时，直接丢弃音频
    if (!autoVoiceEnabled) {
      logger.log('[TTS Queue] Voice disabled, dropping audio');
      return;
    }

    const audioBlob = new Blob([Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0))], { type: 'audio/mpeg' });
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    // 口型同步
    const driver = getLive2DDriver();
    if (driver) {
      try {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(audio);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(audioContext.destination);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let lipSyncRAF: number;

        const lipSyncLoop = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          const bands = Math.min(32, dataArray.length);
          for (let i = 0; i < bands; i++) sum += dataArray[i];
          const volume = sum / (bands * 255);
          driver.setMouthOpen(Math.min(1, volume * 3));
          lipSyncRAF = requestAnimationFrame(lipSyncLoop);
        };
        lipSyncRAF = requestAnimationFrame(lipSyncLoop);

        audio.onended = () => {
          cancelAnimationFrame(lipSyncRAF);
          audioContext.close().catch(() => {});
          driver.setMouthOpen(0);
        };
        audio.onerror = () => {
          cancelAnimationFrame(lipSyncRAF);
          audioContext.close().catch(() => {});
          driver.setMouthOpen(0);
        };
      } catch (e) {
        logger.warn('[TTS Queue] 口型同步失败:', e);
      }
    }

    if (!isPlayingQueueRef.current) {
      isPlayingQueueRef.current = true;
      window.__AI_IS_SPEAKING__ = true;
      setIsPlaying('streaming');

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        playNextAudio();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        playNextAudio();
      };

      audio.play().catch(err => {
        logger.warn('[TTS Queue] 初始播放失败:', err);
        playNextAudio();
      });
    } else {
      audioQueueRef.current.push(audio);
    }
  // ✅ 修复：补全依赖数组，加入 autoVoiceEnabled
  }, [playNextAudio, autoVoiceEnabled]);

  // ✅ 修复：speak 改为 useCallback，避免 sendMessage 捕获陈旧闭包
  const speak = useCallback(async (text: string, messageId: string) => {
    if (!autoVoiceEnabled) {
      logger.log('[TTS] 语音已关闭，播放按钮无效');
      return;
    }
    if (!text || !id) return;
    setIsPlaying(messageId);

    window.__AI_IS_SPEAKING__ = true;

    try {
      const response = await apiFetch('/api/tts/synthesize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId: persona?.voiceId || 'zh-CN-XiaoxiaoNeural' })
      });
      if (!response.ok) throw new Error(`TTS synthesis failed: ${response.status}`);
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      const driver = getLive2DDriver();
      let audioContext: AudioContext | null = null;
      let analyser: AnalyserNode | null = null;
      let lipSyncRAF: number | null = null;

      if (driver) {
        try {
          audioContext = new AudioContext();
          const source = audioContext.createMediaElementSource(audio);
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          analyser.connect(audioContext.destination);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const lipSyncLoop = () => {
            analyser!.getByteFrequencyData(dataArray);
            let sum = 0;
            const bands = Math.min(32, dataArray.length);
            for (let i = 0; i < bands; i++) sum += dataArray[i];
            const volume = sum / (bands * 255);
            driver!.setMouthOpen(Math.min(1, volume * 3));
            lipSyncRAF = requestAnimationFrame(lipSyncLoop);
          };
          lipSyncRAF = requestAnimationFrame(lipSyncLoop);
        } catch (e) {
          logger.warn('[LipSync] Web Audio 分析失败，使用 viseme 降级:', e);
          const steps = Math.max(4, Math.min(12, text.length));
          const visemes = Array.from({ length: steps }, (_, i) => ({
            time: i * (text.length * 0.08 / steps),
            value: (Math.sin(i * 1.5) + 1) / 2,
          }));
          driver.speak({ visemes, audio });
        }
      }

      audio.onplaying = () => {
        window.__AI_IS_SPEAKING__ = true;
        logger.log('[PersonaDetail] AI 开始说话，面部追踪已锁定');
      };

      audio.onended = () => {
        setIsPlaying(null);
        URL.revokeObjectURL(audioUrl);
        if (lipSyncRAF) cancelAnimationFrame(lipSyncRAF);
        if (audioContext) audioContext.close().catch(() => {});
        driver?.setMouthOpen(0);
        window.__AI_IS_SPEAKING__ = false;
        logger.log('[PersonaDetail] AI 说话结束，面部追踪已解锁');
      };

      audio.onerror = () => {
        setIsPlaying(null);
        URL.revokeObjectURL(audioUrl);
        if (lipSyncRAF) cancelAnimationFrame(lipSyncRAF);
        if (audioContext) audioContext.close().catch(() => {});
        driver?.setMouthOpen(0);
        window.__AI_IS_SPEAKING__ = false;
        logger.warn('[PersonaDetail] TTS 播放错误，面部追踪已解锁');
      };
      await audio.play();
    } catch (error) {
      logger.error('TTS playback error:', error);
      setIsPlaying(null);
      setToast({ message: '语音合成失败', type: 'error' });
      window.__AI_IS_SPEAKING__ = false;
    }
  // ✅ 修复：补全依赖数组
  }, [id, persona?.voiceId, autoVoiceEnabled]);

  // ✅ 修复：sendMessage 依赖数组补全 enqueueAudio 和 speak
  const sendMessage = useCallback(async (overrideText?: string) => {
    const content = (overrideText ?? input).trim();
    if (!content || !id || isSending) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMessage: DetailMessage = { id: `user-${Date.now()}`, role: 'user', content };
    setMessages((prev) => [...prev, userMessage]);
    setInput(''); setIsSending(true);

    try {
      const res = await apiFetch(`/api/personas/${id}/chat`, {
        method: 'POST', body: JSON.stringify({ message: content, personaId: id }), signal: controller.signal,
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const reader = res.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let buffer = '', fullReply = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6)) as {
              token?: string; content?: string; text?: string; reply?: string; emotion?: string; type?: string; audio?: string;
            };
            if (data.type === 'connected') { if (data.emotion) driveEmotion(data.emotion); continue; }

            if (data.type === 'audio_chunk' && data.audio) {
              enqueueAudio(data.audio);
              continue;
            }

            if (data.type === 'done' && autoVoiceEnabled && fullReply.trim()) {
              if (audioQueueRef.current.length === 0 && !isPlayingQueueRef.current) {
                void speak(fullReply.trim(), `auto-${Date.now()}`);
              }
              continue;
            }

            if (data.emotion) driveEmotion(data.emotion);

            const deltaText = normalizeSseText(data.token ?? data.content ?? data.text);
            const finalText = normalizeSseText(data.reply);
            const nextText = finalText || deltaText;
            if (!nextText) continue;

            fullReply = finalText || `${fullReply}${nextText}`;
            const inferredEmotion = inferEmotion(fullReply);
            if (inferredEmotion !== 'neutral' && inferredEmotion !== currentEmotion) driveEmotion(inferredEmotion);

            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === 'assistant' && last.id.startsWith('assistant-')) {
                updated[updated.length - 1] = { ...last, content: fullReply, emotion: data.emotion || last.emotion };
              } else {
                updated.push({ id: `assistant-${Date.now()}`, role: 'assistant', content: fullReply, emotion: data.emotion || currentEmotion });
              }
              return updated;
            });
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') {
        setMessages((prev) => [...prev, { id: `assistant-error-${Date.now()}`, role: 'assistant', content: `出错了：${getErrorMessage(err, '连接服务器失败')}`, emotion: 'sad' }]);
        driveEmotion('sad');
      }
    } finally { setIsSending(false); }
  // ✅ 修复：补全依赖数组
  }, [currentEmotion, driveEmotion, id, input, isSending, autoVoiceEnabled, enqueueAudio, speak]);

  // 绑定 sendMessage 到 ref，让 VAD onAutoSend 能调用
  sendMessageRef.current = async (text: string) => { await sendMessage(text); };

  const handleSave = useCallback(async () => {
    if (!id || isSaving || isReadOnly) return;
    setIsSaving(true);
    try {
      const res = await apiFetch(`/api/personas/${id}`, { method: 'PUT', body: JSON.stringify(formData) });
      if (!res.ok) throw new Error(await parseApiError(res));
      const payload = await res.json().catch(() => ({ ...persona, ...formData }));
      const updated = payload?.persona ?? payload;
      setPersona(updated);
      setCurrentPersona(toContextPersona(updated));
      setToast({ message: '保存成功', type: 'success' });
      setShowSettings(false);
    } catch (err) { setToast({ message: getErrorMessage(err, '保存失败'), type: 'error' }); }
    finally { setIsSaving(false); }
  }, [id, isSaving, isReadOnly, formData, persona, setCurrentPersona]);

  const handleDelete = useCallback(async () => {
    if (!id || !confirm('确定要删除这个角色吗？所有对话记忆将永久清空，无法恢复。')) return;
    setIsDeleting(true);
    try {
      const res = await apiFetch(`/api/personas/${id}`, { method: 'DELETE' });
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        setToast({ message: (data as { message?: string }).message || '该人设已被角色绑定，无法删除。请先解绑。', type: 'error' });
        return;
      }
      if (!res.ok) throw new Error(await parseApiError(res));
      if (currentPersona?.id === id) { setCurrentPersona(null); setCurrentChat(null); setGlobalMessages([]); }
      navigate('/personas');
    } catch (err) { setToast({ message: getErrorMessage(err, '删除失败'), type: 'error' }); }
    finally { setIsDeleting(false); }
  }, [id, currentPersona, setCurrentPersona, setCurrentChat, setGlobalMessages, navigate]);

  const handleVoiceToggle = useCallback(() => {
    if (!isSupported) { setToast({ message: '当前浏览器或页面环境不支持语音识别，请使用 HTTPS/localhost 和 Chrome/Edge。', type: 'error' }); return; }
    if (isListening) stopListening(); else startListening();
  }, [isSupported, isListening, stopListening, startListening]);

  if (isLoading) return <PersonaDetailSkeleton />;
  if (error) return (
    <div className="persona-live-page error-state">
      <div className="detail-loading-card"><p>{error}</p><button onClick={() => navigate('/personas')}>返回角色列表</button></div>
    </div>
  );
  if (!persona) return (
    <div className="persona-live-page error-state">
      <div className="detail-loading-card"><p>角色不存在</p><button onClick={() => navigate('/personas')}>返回角色列表</button></div>
    </div>
  );

  return (
    <div className="persona-live-page" style={{ display: 'flex', overflow: 'hidden' }}>
      {/* 左侧：Live2D 模型 */}
      <main className="persona-stage" style={{ flex: 1, position: 'relative', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* 顶部工具栏：固定高度，不遮挡模型 */}
        <div className="stage-toolbar">
          <button className="stage-back-button" onClick={() => navigate(location.state?.from || '/')}>←</button>
          <div className="stage-avatar" style={{ background: `linear-gradient(135deg, ${persona?.accent || 'var(--accent)'}, var(--accent-secondary))` }}>
            {persona?.avatar || persona?.name?.charAt(0) || '?'}
          </div>
          <div>
            <div className="stage-name">{persona?.name || '未命名角色'}</div>
            <div className="stage-subtitle">{persona?.subtitle || persona?.description || '专属陪伴角色'}</div>
          </div>
          <div className="stage-emotion-badge">
            <span>{getEmotionEmoji(currentEmotion)}</span>
            <span>{currentEmotion}</span>
          </div>
          <button
            onClick={toggleCamera}
            title={cameraEnabled ? '关闭摄像头' : '开启摄像头'}
            style={{ background: cameraEnabled ? 'var(--error)' : 'var(--bg-input-inner)', color: 'var(--text-primary)', border: 'none', borderRadius: 20, padding: '4px 12px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {cameraEnabled ? '📷 关闭' : '📷 开启'}
          </button>
        </div>

        {/* Live2D 模型区域：占满剩余空间 */}
        <div className="stage-model-area">
          <Live2DPage compact modelPath={modelPath} characterName={persona?.name || '角色'} defaultExpression={currentEmotion} />
        </div>

        {/* 摄像头预览 */}
        {cameraEnabled && (
          <div style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{ position: 'relative' }}>
              <video ref={videoRef} style={{ width: 120, height: 90, borderRadius: 8, objectFit: 'cover', opacity: 0.85, display: cameraReady ? 'block' : 'none', border: '2px solid var(--border)' }} muted playsInline />
              {cameraReady && <div style={{ position: 'absolute', bottom: 2, right: 4, background: 'var(--bg-input-inner)', color: 'var(--text-primary)', padding: '1px 6px', borderRadius: 4, fontSize: 11, whiteSpace: 'nowrap' }}>{userEmotion}</div>}
              {!cameraReady && !cameraError && <div style={{ width: 120, height: 90, borderRadius: 8, background: 'var(--bg-input-inner)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 11 }}>启动中...</div>}
              {cameraError && <div style={{ width: 120, minHeight: 40, borderRadius: 8, background: 'var(--bg-input-inner)', color: 'var(--error)', padding: '6px 8px', fontSize: 10 }}>📷 {cameraError}</div>}
            </div>
          </div>
        )}
      </main>

      {/* 右侧：聊天面板 */}
      <aside className="persona-chat-panel">
        <header className="detail-chat-header">
          <div>
            <p>LIVE CHAT</p>
            <h1>{persona?.name || '角色'} 的房间</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* 语音控制区域 */}
            <div ref={voiceSelectRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* 自动朗读开关 */}
              <button
                className="voice-toggle-btn"
                onClick={() => setAutoVoiceEnabled(prev => !prev)}
                title={autoVoiceEnabled ? '关闭自动朗读' : '开启自动朗读'}
                style={{ background: autoVoiceEnabled ? 'var(--accent)' : 'var(--bg-input-inner)', color: 'var(--text-primary)', border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {autoVoiceEnabled ? '🔊' : '🔇'}
                <span style={{ fontSize: 12 }}>{autoVoiceEnabled ? '朗读开' : '朗读关'}</span>
              </button>

              {/* 音色选择按钮 */}
              <button
                onClick={() => setShowVoiceSelect(prev => !prev)}
                style={{ background: 'var(--bg-input-inner)', color: 'var(--text-primary)', border: 'none', borderRadius: 20, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}
                title="选择音色"
              >
                🎵 {VOICE_OPTIONS.find(v => v.id === (persona?.voiceId || 'zh-CN-XiaoxiaoNeural'))?.name || '晓晓'}
              </button>

              {/* 音色下拉菜单 */}
              {showVoiceSelect && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 100,
                  background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: 12,
                  padding: 8, minWidth: 200, maxHeight: 300, overflowY: 'auto',
                  boxShadow: 'var(--card-shadow)',
                }}>
                  <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: '4px 8px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>选择语音音色</div>
                  {VOICE_OPTIONS.map(v => (
                    <div
                      key={v.id}
                      onClick={async () => {
                        setPersona(prev => prev ? { ...prev, voiceId: v.id } : prev);
                        if (!isReadOnly && id) {
                          await apiFetch(`/api/personas/${id}`, {
                            method: 'PUT', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ voiceId: v.id }),
                          }).catch((err) => { logger.warn('更新语音设置失败:', err); });
                        }
                        setShowVoiceSelect(false);
                      }}
                      style={{
                        padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                        background: (persona?.voiceId || 'zh-CN-XiaoxiaoNeural') === v.id ? 'var(--bg-tertiary)' : 'transparent',
                        color: 'var(--text-primary)', fontSize: 13,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}
                    >
                      <span>{v.name}</span>
                      {(persona?.voiceId || 'zh-CN-XiaoxiaoNeural') === v.id && <span style={{ color: 'var(--accent)' }}>✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => setShowSettings((value) => !value)}>{showSettings ? '聊天' : '设定'}</button>
          </div>
        </header>

        {showSettings ? (
          <section className="detail-settings-panel">
            <label>角色名称<input value={formData.name} disabled={isReadOnly} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} /></label>
            <label>一句话定位<input value={formData.subtitle} disabled={isReadOnly} onChange={(e) => setFormData((prev) => ({ ...prev, subtitle: e.target.value }))} /></label>
            <label>性格描述<textarea rows={4} value={formData.description} disabled={isReadOnly} onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))} /></label>
            <label>说话风格<textarea rows={3} value={formData.speakingStyle} disabled={isReadOnly} onChange={(e) => setFormData((prev) => ({ ...prev, speakingStyle: e.target.value }))} /></label>
            <label>系统提示词<textarea rows={6} value={formData.systemPrompt} disabled={isReadOnly} onChange={(e) => setFormData((prev) => ({ ...prev, systemPrompt: e.target.value }))} /></label>
            <div className="model-path-display">
              <strong>Live2D 模型路径</strong>
              <code>{persona?.modelPath || '未绑定'}</code>
            </div>
            <div className="model-path-display">
              <strong>当前音色</strong>
              <code>{VOICE_OPTIONS.find(v => v.id === (persona?.voiceId || 'zh-CN-XiaoxiaoNeural'))?.name || '晓晓 (女声)'}</code>
            </div>
            <div className="memory-mini-list">
              <strong>记忆</strong>
              {memories.length ? memories.slice(0, 4).map((memory) => <span key={memory.id}>{memory.content}</span>) : <span>暂无专属记忆</span>}
            </div>
            {!isReadOnly ? (
              <div className="detail-actions">
                <button onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? '保存中...' : '保存'}</button>
                <button className="danger" onClick={() => void handleDelete()} disabled={isDeleting}>{isDeleting ? '删除中...' : '删除'}</button>
              </div>
            ) : <div className="readonly-note">系统预设角色不可编辑。</div>}
          </section>
        ) : (
          <>
            <section className="detail-message-list">
              {messages.length === 0 ? (
                <div className="detail-empty-chat">和 {persona?.name || '角色'} 打个招呼吧～</div>
              ) : messages.map((message) => (
                <div key={message.id} className={`detail-message ${message.role}`}>
                  <div className="detail-bubble">
                    {message.role === 'assistant' ? (
                      <div className="detail-bubble-meta">
                        <span>{persona?.name || 'AI'}</span>
                        {message.emotion ? <span>{getEmotionEmoji(message.emotion)} {message.emotion}</span> : null}
                        <button onClick={() => speak(message.content, message.id)} disabled={isPlaying === message.id} className="tts-play-button" title="播放语音">
                          {isPlaying === message.id ? '🔊' : '▶️'}
                        </button>
                      </div>
                    ) : null}
                    <div className="detail-bubble-content">{message.content}</div>
                  </div>
                </div>
              ))}
              {isSending ? <div className="detail-thinking">{persona?.name || 'AI'} 正在思考...</div> : null}
              <div ref={bottomRef} />
            </section>

            <footer className="detail-composer">
              {voiceError ? <div className="voice-error">{voiceError}</div> : null}
              {interimTranscript ? <div className="voice-interim">{interimTranscript}</div> : null}
              <div className="detail-composer-row">
                <button
                  className={`voice-button ${vadAssistant.isListening ? 'recording' : ''}`}
                  onClick={() => {
                    console.log('[VAD] 点击! isListening:', vadAssistant.isListening, 'isProcessing:', vadAssistant.isProcessing);
                    vadAssistant.toggle();
                  }}
                  title={vadAssistant.isListening ? 'VAD监听中，点击停止' : vadAssistant.isProcessing ? 'AI处理中...' : 'VAD语音（按1次一直听，再按停止）'}
                  style={{
                    borderColor: vadAssistant.isListening ? '#4CAF50' : vadAssistant.isProcessing ? '#FF9800' : undefined,
                    background: vadAssistant.isListening ? 'rgba(76,175,80,0.2)' : vadAssistant.isProcessing ? 'rgba(255,152,0,0.2)' : undefined,
                    color: vadAssistant.isListening ? '#4CAF50' : vadAssistant.isProcessing ? '#FF9800' : undefined,
                  }}
                >
                  {vadAssistant.isListening ? '⏹' : vadAssistant.isProcessing ? '⚡' : 'VAD'}
                </button>
                {vadAssistant.isListening && (
                  <span style={{ fontSize: 11, color: '#4CAF50', whiteSpace: 'nowrap', fontWeight: 600 }}>监听中</span>
                )}
                {vadAssistant.isProcessing && !vadAssistant.isListening && (
                  <span style={{ fontSize: 11, color: '#FF9800', whiteSpace: 'nowrap', fontWeight: 600 }}>连接中...</span>
                )}
                {vadAssistant.isProcessing && vadAssistant.isListening && (
                  <span style={{ fontSize: 11, color: '#FF9800', whiteSpace: 'nowrap', fontWeight: 600 }}>AI思考</span>
                )}
                {vadAssistant.error && (
                  <span style={{ fontSize: 11, color: '#F44336', whiteSpace: 'nowrap', fontWeight: 600 }}>{vadAssistant.error}</span>
                )}
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
                  maxLength={500}
                  rows={2}
                  placeholder={`给 ${persona?.name || '角色'} 发消息...`}
                />
                <button className="send-button" onClick={() => void sendMessage()} disabled={!input.trim() || isSending}>➤</button>
              </div>
              <div className="composer-hint">Enter 发送，Shift + Enter 换行</div>
            </footer>
          </>
        )}
      </aside>

      {toast ? <div className={`toast ${toast.type}`}>{toast.message}</div> : null}
    </div>
  );
};