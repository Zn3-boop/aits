/**
 * useRealtimeVoice - 实时语音对话 Hook（SpeechRecognition 原生版）
 * 
 * 简化版：检测到语音 → 说话时显示倒计时 → 停止说话 N 秒后自动发送
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseRealtimeVoiceOptions {
  onTranscriptChange?: (text: string) => void;
  onAutoSend?: (text: string) => void;
  autoSendDelay?: number;
  enabled?: boolean;
}

export interface RealtimeVoiceReturn {
  isListening: boolean;
  countdown: number;
  error: string | null;
  hasSpeech: boolean;
}

export function useRealtimeVoice(options: UseRealtimeVoiceOptions): RealtimeVoiceReturn {
  const { onTranscriptChange, onAutoSend, autoSendDelay = 3000, enabled } = options;

  const [isListening, setIsListening] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hasSpeech, setHasSpeech] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptRef = useRef('');
  const interimRef = useRef('');
  const lastTranscriptTimeRef = useRef(0);
  const startListeningRef = useRef<() => void>(() => {});
  // 跟踪是否正在发送
  const isSendingRef = useRef(false);

  const SpeechRecognitionAPI = (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition 
    || (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

  // 清除定时器
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCountdown(0);
  }, []);

  // 开始/重置倒计时
  const resetCountdown = useCallback(() => {
    clearTimer();
    
    console.log('[useRealtimeVoice] 重置倒计时:', autoSendDelay / 1000, '秒');
    
    const remaining = Math.ceil(autoSendDelay / 1000);
    setCountdown(remaining);
    
    timerRef.current = setTimeout(() => {
      // 倒计时结束，发送消息
      const text = transcriptRef.current.trim();
      console.log('[useRealtimeVoice] 倒计时结束，准备发送:', text);
      
      if (text && !isSendingRef.current) {
        isSendingRef.current = true;
        console.log('[useRealtimeVoice] 自动发送!');
        onAutoSend?.(text);
        
        // 重置
        transcriptRef.current = '';
        interimRef.current = '';
        onTranscriptChange?.('');
        setCountdown(0);
        setHasSpeech(false);
        isSendingRef.current = false;
      }
    }, autoSendDelay);
  }, [autoSendDelay, onAutoSend, onTranscriptChange, clearTimer]);

  // 停止监听
  const stopListening = useCallback(() => {
    clearTimer();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
    setHasSpeech(false);
  }, [clearTimer]);

  // 开始监听
  const startListening = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      setError('浏览器不支持语音识别，请使用 Chrome/Edge');
      return;
    }
    
    setError(null);
    clearTimer();

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('[useRealtimeVoice] 语音识别开始');
      setIsListening(true);
      setHasSpeech(false);
      transcriptRef.current = '';
      interimRef.current = '';
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let final = '';
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (final) {
        transcriptRef.current += final;
      }
      interimRef.current = interim;

      const displayText = transcriptRef.current + interim;
      onTranscriptChange?.(displayText);

      // 检测到语音内容
      if (displayText.trim()) {
        console.log('[useRealtimeVoice] 检测到语音:', displayText.slice(0, 50));
        lastTranscriptTimeRef.current = Date.now();
        setHasSpeech(true);
        
        // 重置倒计时
        resetCountdown();
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[useRealtimeVoice] 识别错误:', event.error);
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      setError(`识别错误: ${event.error}`);
      if (enabled) {
        setTimeout(() => startListeningRef.current(), 500);
      }
    };

    recognition.onend = () => {
      console.log('[useRealtimeVoice] 语音识别结束');
      if (enabled && !isSendingRef.current) {
        startListeningRef.current();
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      console.log('[useRealtimeVoice] 启动语音识别');
    } catch (err) {
      console.error('[useRealtimeVoice] 启动失败:', err);
      setError('启动语音识别失败');
    }
  }, [SpeechRecognitionAPI, enabled, onTranscriptChange, clearTimer, resetCountdown]);

  // 更新 ref
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  // 处理 enabled 变化
  useEffect(() => {
    if (enabled) {
      transcriptRef.current = '';
      interimRef.current = '';
      isSendingRef.current = false;
      startListeningRef.current();
    } else {
      stopListening();
    }
    return () => {
      stopListening();
    };
  }, [enabled, stopListening]);

  return {
    isListening,
    countdown,
    error,
    hasSpeech,
  };
}