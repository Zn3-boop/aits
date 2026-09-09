// VAD语音助手 - 静音自动发送版（全管线修复 + WebSocket时序修复 + 连续监听修复）
// 修复: 1) apiFetch认证 2) WebSocket URL走代理 3) 时序:等ready再启动录音 4) personaId 5) SSE解析 6) 连续监听+重连 7) restartListening资源清理 8) 空识别结果处理 9) 旧WS回调清理
import { useState, useRef, useCallback, useEffect } from 'react';
import { logger } from '../utils/logger';
import { apiFetch } from '../utils/auth';
import { ttsManager } from '../services/tts/TTSManager';
import { expressionBus } from '../features/expression-bus';

export interface VADConfig {
  personaId?: string;
  sessionId?: string;
  silenceMs?: number;
  minSpeechMs?: number;
  threshold?: number;
}

export interface VADCallbacks {
  onTranscript?: (text: string) => void;
  onResponseStart?: () => void;
  onResponseText?: (text: string) => void;
  onResponseEnd?: () => void;
  onError?: (error: string) => void;
  onAutoSend?: (text: string) => Promise<void> | void;  // ← 支持异步回调
}

export function useVADAssistant(cb: VADCallbacks, config: VADConfig = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ws = useRef<WebSocket | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const anal = useRef<AnalyserNode | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const vadRaf = useRef<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const sent = useRef(false);
  const lastSpeech = useRef(0);
  const speechStart = useRef(0);
  const continuousMode = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);

  const isListeningRef = useRef(isListening);
  const isVadRunningRef = useRef(false);
  const stoppingRef = useRef(false);
  const startingRef = useRef(false);
  const speechFrameCount = useRef(0);
  const silenceFrameCount = useRef(0);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

  const THRESHOLD = config.threshold ?? 0.04;
  const SILENCE_MS = config.silenceMs ?? 1500;
  const MIN_SPEECH_MS = config.minSpeechMs ?? 300;
  const SPEECH_FRAMES_REQUIRED = 3;
  const SILENCE_FRAMES_REQUIRED = 15;
  const adaptiveThreshold = useRef(THRESHOLD);
  const noiseFloor = useRef(0);
  const noiseSampleCount = useRef(0);

  const onTranscript = useRef(cb.onTranscript);
  const onResponseStart = useRef(cb.onResponseStart);
  const onResponseText = useRef(cb.onResponseText);
  const onResponseEnd = useRef(cb.onResponseEnd);
  const onError = useRef(cb.onError);
  const onAutoSend = useRef(cb.onAutoSend);
  const personaIdRef = useRef(config.personaId);
  const sessionIdRef = useRef(config.sessionId);

  useEffect(() => { onTranscript.current = cb.onTranscript; }, [cb.onTranscript]);
  useEffect(() => { onResponseStart.current = cb.onResponseStart; }, [cb.onResponseStart]);
  useEffect(() => { onResponseText.current = cb.onResponseText; }, [cb.onResponseText]);
  useEffect(() => { onResponseEnd.current = cb.onResponseEnd; }, [cb.onResponseEnd]);
  useEffect(() => { onError.current = cb.onError; }, [cb.onError]);
  useEffect(() => { onAutoSend.current = cb.onAutoSend; }, [cb.onAutoSend]);
  useEffect(() => { personaIdRef.current = config.personaId; }, [config.personaId]);
  useEffect(() => { sessionIdRef.current = config.sessionId; }, [config.sessionId]);

  const restartListeningRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // ─────────────────────────────────────────────
  // 停止录音与清理音频资源
  // ─────────────────────────────────────────────
  const stopRec = useCallback(() => {
    isVadRunningRef.current = false;
    if (vadRaf.current) { cancelAnimationFrame(vadRaf.current); vadRaf.current = null; }
    if (rec.current?.state === 'recording') rec.current.stop();
    if (stream.current) { stream.current.getTracks().forEach(t => t.stop()); stream.current = null; }
    if (ctx.current) { ctx.current.close(); ctx.current = null; }
    setIsListening(false);
  }, []);

  // ─────────────────────────────────────────────
  // 发送文本到 LLM 并处理 SSE 流
  // ─────────────────────────────────────────────
  const sendToLLM = useCallback(async (text: string) => {
    if (!text.trim()) return;
    logger.log('[VAD] 发送到LLM:', text);
    setIsProcessing(true);
    onResponseStart.current?.();
    ttsManager.interrupt();
    abort.current = new AbortController();

    // 优先使用外部 onAutoSend 回调（如 ChatInput 的 doSend）
    if (onAutoSend.current) {
      logger.log('[VAD] 使用 onAutoSend 回调');
      try {
        await onAutoSend.current(text);
      } catch (e) {
        logger.error('[VAD] onAutoSend失败:', e);
        onError.current?.((e as Error).message);
      } finally {
        setIsProcessing(false);
        if (continuousMode.current) {
          logger.log('[VAD] 连续模式：重新开始监听');
          setTimeout(() => restartListeningRef.current(), 300);
        }
      }
      return;
    }

    try {
      const body: Record<string, unknown> = { message: text.trim() };
      if (personaIdRef.current) body.personaId = personaIdRef.current;
      if (sessionIdRef.current) body.sessionId = sessionIdRef.current;

      const res = await apiFetch('/api/chat/stream', {
        method: 'POST',
        body: JSON.stringify(body),
        signal: abort.current.signal,
      });
      if (!res.ok) throw new Error(`请求失败: ${res.status}`);

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let full = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith('event:')) continue;
          if (!trimmed.startsWith('data: ')) continue;
          const str = trimmed.slice(6);
          if (str === '[DONE]') continue;
          try {
            const d = JSON.parse(str);
            switch (d.type) {
              case 'connected':
                if (d.sessionId) sessionIdRef.current = d.sessionId;
                if (d.emotion) expressionBus.fromLLM(d.emotion);
                break;
              case 'token': case 'text': case 'delta':
                full += d.content || d.token || '';
                onResponseText.current?.(full);
                break;
              case 'emotion':
                expressionBus.fromLLM(d.emotion);
                break;
              case 'audio_chunk':
                if (d.audio) {
                  ttsManager.play(d.audio);
                  setIsSpeaking(true);
                  expressionBus.speaking();
                }
                break;
              case 'done':
                setIsProcessing(false);
                setIsSpeaking(false);
                expressionBus.fromLLM('neutral');
                onResponseEnd.current?.();
                if (continuousMode.current) {
                  logger.log('[VAD] 连续模式：LLM回复结束，重新开始监听');
                  setTimeout(() => restartListeningRef.current(), 300);
                }
                break;
              case 'error':
                logger.error('[VAD] LLM错误:', d.error || d.message);
                setIsProcessing(false);
                setIsSpeaking(false);
                onError.current?.(d.error || d.message || '未知错误');
                if (continuousMode.current) {
                  setTimeout(() => restartListeningRef.current(), 1000);
                }
                break;
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        logger.error('[VAD] LLM失败:', e);
        setIsProcessing(false);
        setIsSpeaking(false);
        onError.current?.((e as Error).message);
        if (continuousMode.current) {
          setTimeout(() => restartListeningRef.current(), 1000);
        }
      }
    }
  }, []);

  // ─────────────────────────────────────────────
  // VAD 静音检测循环
  // ─────────────────────────────────────────────
  const vadLoop = useCallback(() => {
    if (!anal.current || !isVadRunningRef.current) {
      logger.warn('[VAD] vadLoop退出: anal=', !!anal.current, 'vadRunning=', isVadRunningRef.current);
      return;
    }
    const buf = new Uint8Array(anal.current.fftSize);
    anal.current.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) {
      const deviation = Math.abs(v - 128);
      sum += deviation;
    }
    const vol = sum / buf.length / 128;
    const now = Date.now();

    // 自适应阈值：前30帧采样环境噪音基线
    if (noiseSampleCount.current < 30) {
      noiseFloor.current += vol;
      noiseSampleCount.current++;
      if (noiseSampleCount.current === 30) {
        noiseFloor.current = noiseFloor.current / 30;
        adaptiveThreshold.current = Math.max(THRESHOLD, noiseFloor.current * 2.5);
        logger.log('[VAD] 自适应阈值: noiseFloor=', noiseFloor.current.toFixed(4), 'threshold=', adaptiveThreshold.current.toFixed(4));
      }
      vadRaf.current = requestAnimationFrame(vadLoop);
      return;
    }

    if (vol < adaptiveThreshold.current * 0.5) {
      noiseFloor.current = noiseFloor.current * 0.995 + vol * 0.005;
      adaptiveThreshold.current = Math.max(THRESHOLD, noiseFloor.current * 2.5);
    }

    if (now % 2000 < 50) {
      logger.log('[VAD] 当前音量:', vol.toFixed(4), 'threshold:', adaptiveThreshold.current.toFixed(4));
    }
    if (vol > adaptiveThreshold.current) {
      silenceFrameCount.current = 0;
      speechFrameCount.current++;
      if (speechFrameCount.current >= SPEECH_FRAMES_REQUIRED) {
        lastSpeech.current = now;
        if (!speechStart.current) {
          speechStart.current = now;
          logger.log('[VAD] 检测到语音开始 vol=', vol.toFixed(4));
          expressionBus.listening();
        }
      }
    } else {
      speechFrameCount.current = 0;
      if (speechStart.current) {
        silenceFrameCount.current++;
        const sil = now - lastSpeech.current;
        const dur = now - speechStart.current;
        if (silenceFrameCount.current >= SILENCE_FRAMES_REQUIRED &&
            sil > SILENCE_MS &&
            dur > MIN_SPEECH_MS &&
            !sent.current) {
          logger.log('[VAD] 静音超时，停止录音并发送 (sil=', sil, 'dur=', dur, ')');
          sent.current = true;
          if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'stop' }));
          }
          stopRec();
          return;
        }
      }
    }
    vadRaf.current = requestAnimationFrame(vadLoop);
  }, [stopRec]);

  // ─────────────────────────────────────────────
  // 启动 VAD 录音（修复：等服务器 ready 再启动录音）
  // ─────────────────────────────────────────────
  const start = useCallback(async () => {
    if (isListeningRef.current || startingRef.current) {
      logger.log('[VAD] start 被跳过: 已在监听或正在启动');
      return;
    }
    if (isProcessing) return;
    startingRef.current = true;
    setError(null);
    sent.current = false;
    lastSpeech.current = Date.now();
    speechStart.current = 0;
    speechFrameCount.current = 0;
    silenceFrameCount.current = 0;
    continuousMode.current = true;
    stoppingRef.current = false;
    reconnectCountRef.current = 0;
    noiseFloor.current = 0;
    noiseSampleCount.current = 0;
    adaptiveThreshold.current = THRESHOLD;
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }

    try {
      // 1. 获取麦克风
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 48000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });

      // 2. 创建音频分析器（用于 VAD）
      ctx.current = new AudioContext();
      const src = ctx.current.createMediaStreamSource(stream.current);
      anal.current = ctx.current.createAnalyser();
      anal.current.fftSize = 256;
      src.connect(anal.current);

      // 3. 创建 MediaRecorder（先不 start，等服务器 ready）
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      rec.current = new MediaRecorder(stream.current, { mimeType: mime });
      rec.current.ondataavailable = async (e) => {
        if (e.data.size > 0 && ws.current?.readyState === WebSocket.OPEN) {
          const data = new Uint8Array(await e.data.arrayBuffer());
          ws.current.send(data);
          logger.log('[VAD] 发送音频chunk:', data.byteLength, 'bytes');
        } else if (e.data.size > 0) {
          logger.warn('[VAD] 音频chunk未发送: ws状态=', ws.current?.readyState, 'dataSize=', e.data.size);
        }
      };

      // 4. 连接 WebSocket（统一走代理，不再直连 8787）
      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/stt/ws`;
      logger.log('[VAD] 连接WebSocket:', wsUrl);
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        logger.log('[VAD] WS连接成功');
        setIsConnected(true);
        // ← 修复：连接成功后立即发送 start，服务端收到后才回复 ready
        if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'start' }));
        }
      };

      ws.current.onmessage = async (e) => {
        try {
          const d = JSON.parse(e.data);
          logger.log('[VAD] 收到WS消息:', d.type, d);
          if (d.type === 'ready') {
            logger.log('[VAD] STT服务已就绪，启动录音...');
            try {
              rec.current?.start(500);
            } catch (err) {
              logger.error('[VAD] MediaRecorder.start() 失败:', err);
              startingRef.current = false;
              setError('录音启动失败');
              return;
            }
            startingRef.current = false;
            isVadRunningRef.current = true;
            setIsListening(true);
            expressionBus.listening();
            vadRaf.current = requestAnimationFrame(vadLoop);
            logger.log('[VAD] VAD循环已启动, isVadRunning=', isVadRunningRef.current, 'rec.state=', rec.current?.state);
          } else if (d.type === 'final') {
            // ← 修复：处理空识别结果，避免连续模式卡死
            const t = (d.text || '').trim();
            if (t) {
              logger.log('[VAD] 识别结果:', t);
              onTranscript.current?.(t);
              await sendToLLM(t);
            } else {
              logger.log('[VAD] 识别结果为空');
              if (continuousMode.current) {
                logger.log('[VAD] 连续模式：空结果，重新开始监听');
                setTimeout(() => restartListeningRef.current(), 300);
              }
            }
          } else if (d.type === 'interim' && d.text) {
            onTranscript.current?.(d.text);
          } else if (d.type === 'error') {
            logger.error('[VAD] STT错误:', d.message || d.error || '未知');
            onError.current?.(d.message || d.error || 'STT识别失败');
            if (continuousMode.current && !stoppingRef.current) {
              logger.log('[VAD] 连续模式：STT错误，重新开始监听');
              setTimeout(() => restartListeningRef.current(), 1000);
            }
          }
        } catch { /* ignore */ }
      };

      ws.current.onclose = (ev) => {
        logger.log('[VAD] WS关闭 code:', ev.code, 'reason:', ev.reason, 'wasClean:', ev.wasClean);
        setIsConnected(false);
        startingRef.current = false;
        setIsListening(false);
        setIsProcessing(false);
        ws.current = null;

        if (!ev.wasClean && reconnectCountRef.current < 3 && continuousMode.current && !stoppingRef.current) {
          reconnectCountRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectCountRef.current - 1), 5000);
          logger.log('[VAD] 将在', delay, 'ms后重连 (第', reconnectCountRef.current, '次)');
          reconnectTimerRef.current = setTimeout(() => {
            if (continuousMode.current && !stoppingRef.current) {
              logger.log('[VAD] 尝试重连...');
              start();
            }
          }, delay);
        }
      };

      ws.current.onerror = (e) => {
        logger.error('[VAD] WS错误:', e);
        setError('WebSocket连接失败');
        startingRef.current = false;
        setIsListening(false);
        setIsProcessing(false);
        ws.current = null;
        onError.current?.('WebSocket连接失败');
      };

      // ❌ 不要在这里启动 MediaRecorder - 改为在收到 'ready' 消息后启动
    } catch (e) {
      logger.error('[VAD] 启动失败:', e);
      startingRef.current = false;
      if ((e as DOMException).name === 'NotAllowedError') setError('麦克风权限被拒绝');
      else setError('无法访问麦克风');
      onError.current?.((e as Error).message);
    }
  }, [isListening, isProcessing, sendToLLM, vadLoop]);

  // ─────────────────────────────────────────────
  // 重新开始监听（连续模式内部使用）—— 整合第1个文件的修复 + 旧WS回调清理
  // ─────────────────────────────────────────────
  const restartListening = useCallback(async () => {
    if (stoppingRef.current) {
      logger.log('[VAD] restartListening跳过: 正在停止');
      return;
    }
    if (!continuousMode.current) {
      logger.log('[VAD] restartListening跳过: 连续模式已关闭');
      return;
    }
    if (startingRef.current) {
      logger.log('[VAD] restartListening跳过: 正在启动');
      return;
    }
    startingRef.current = true;
    logger.log('[VAD] restartListening: 重新开始监听...');
    sent.current = false;
    lastSpeech.current = Date.now();
    speechStart.current = 0;
    speechFrameCount.current = 0;
    silenceFrameCount.current = 0;
    noiseFloor.current = 0;
    noiseSampleCount.current = 0;
    adaptiveThreshold.current = THRESHOLD;
    setError(null);
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    reconnectCountRef.current = 0;

    // 清理旧的 WebSocket 连接（先清空回调再 close，防止触发重连竞态）
    if (ws.current) {
      const oldWs = ws.current;
      oldWs.onclose = null;
      oldWs.onerror = null;
      oldWs.onmessage = null;
      oldWs.onopen = null;
      try {
        if (oldWs.readyState === WebSocket.OPEN || oldWs.readyState === WebSocket.CONNECTING) {
          oldWs.close();
        }
      } catch { /* ignore */ }
      ws.current = null;
    }

    // 清理旧的录音资源
    stopRec();

    try {
      // 重新获取麦克风
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 48000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
      ctx.current = new AudioContext();
      const src = ctx.current.createMediaStreamSource(stream.current);
      anal.current = ctx.current.createAnalyser();
      anal.current.fftSize = 256;
      src.connect(anal.current);

      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      rec.current = new MediaRecorder(stream.current, { mimeType: mime });
      rec.current.ondataavailable = async (e) => {
        if (e.data.size > 0 && ws.current?.readyState === WebSocket.OPEN) {
          const data = new Uint8Array(await e.data.arrayBuffer());
          ws.current.send(data);
        } else if (e.data.size > 0) {
          logger.warn('[VAD] 音频chunk未发送: ws状态=', ws.current?.readyState);
        }
      };

      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/stt/ws`;
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        logger.log('[VAD] 重连WS连接成功');
        setIsConnected(true);
        reconnectCountRef.current = 0;
        if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'start' }));
        }
      };

      ws.current.onmessage = async (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.type === 'ready') {
            startingRef.current = false;
            rec.current?.start(500);
            isVadRunningRef.current = true;
            setIsListening(true);
            setIsProcessing(false);
            expressionBus.listening();
            vadRaf.current = requestAnimationFrame(vadLoop);
            logger.log('[VAD] 重连后VAD循环已启动');
          } else if (d.type === 'final') {
            const t = (d.text || '').trim();
            if (t) {
              logger.log('[VAD] 识别结果:', t);
              onTranscript.current?.(t);
              await sendToLLM(t);
            } else {
              logger.log('[VAD] 识别结果为空');
              if (continuousMode.current) {
                logger.log('[VAD] 连续模式：空结果，重新开始监听');
                setTimeout(() => restartListeningRef.current(), 300);
              }
            }
          } else if (d.type === 'interim' && d.text) {
            onTranscript.current?.(d.text);
          } else if (d.type === 'error') {
            logger.error('[VAD] 重连STT错误:', d.message || d.error || '未知');
            onError.current?.(d.message || d.error || 'STT识别失败');
            if (continuousMode.current && !stoppingRef.current) {
              logger.log('[VAD] 连续模式：STT错误，重新开始监听');
              setTimeout(() => restartListeningRef.current(), 1000);
            }
          }
        } catch { /* ignore */ }
      };

      ws.current.onclose = (ev) => {
        logger.log('[VAD] 重连WS关闭 code:', ev.code, 'reason:', ev.reason, 'wasClean:', ev.wasClean);
        setIsConnected(false);
        startingRef.current = false;
        setIsListening(false);
        setIsProcessing(false);
        ws.current = null;

        if (!ev.wasClean && reconnectCountRef.current < 3 && continuousMode.current && !stoppingRef.current) {
          reconnectCountRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectCountRef.current - 1), 5000);
          logger.log('[VAD] 连续模式重连：将在', delay, 'ms后重连 (第', reconnectCountRef.current, '次)');
          reconnectTimerRef.current = setTimeout(() => {
            if (continuousMode.current && !stoppingRef.current) {
              logger.log('[VAD] 连续模式重连...');
              restartListeningRef.current();
            }
          }, delay);
        }
      };
      ws.current.onerror = () => {
        logger.error('[VAD] 重连WS错误');
        setError('WebSocket连接失败');
        startingRef.current = false;
        setIsListening(false);
        setIsProcessing(false);
        ws.current = null;
        onError.current?.('WebSocket连接失败');
      };
    } catch (e) {
      logger.error('[VAD] 重新监听失败:', e);
      startingRef.current = false;
      setIsListening(false);
      onError.current?.((e as Error).message);
    }
  }, [sendToLLM, vadLoop, stopRec]);

  useEffect(() => {
    restartListeningRef.current = restartListening;
  }, [restartListening]);

  // ─────────────────────────────────────────────
  // 停止（用户手动触发）
  // ─────────────────────────────────────────────
  const stop = useCallback(() => {
    logger.log('[VAD] 停止（用户手动）');
    continuousMode.current = false;
    stoppingRef.current = true;
    startingRef.current = false;
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    reconnectCountRef.current = 0;

    // 先发送 stop 信令
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'stop' }));
    }

    // 停止录音（会触发最后一次 ondataavailable）
    stopRec();

    // 延迟关闭 WebSocket，确保 MediaRecorder.stop() 触发的最后一个 ondataavailable 有时间发送
    if (ws.current?.readyState === WebSocket.OPEN) {
      const wsToClose = ws.current;
      setTimeout(() => {
        try { wsToClose.close(); } catch { /* ignore */ }
        if (ws.current === wsToClose) ws.current = null;
        stoppingRef.current = false;
      }, 300);
    } else {
      ws.current = null;
      stoppingRef.current = false;
    }

    abort.current?.abort();
    setIsProcessing(false);
    setIsSpeaking(false);
    setIsConnected(false);
  }, [stopRec]);

  // ─────────────────────────────────────────────
  // 切换
  // ─────────────────────────────────────────────
  const toggle = useCallback(() => {
    if (isListening || isProcessing) stop(); else start();
  }, [isListening, isProcessing, start, stop]);

  // ─────────────────────────────────────────────
  // 卸载清理
  // ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      continuousMode.current = false;
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      stopRec();
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
      abort.current?.abort();
    };
  }, [stopRec]);

  return { isListening, isProcessing, isSpeaking, isConnected, error, start, stop, toggle };
}