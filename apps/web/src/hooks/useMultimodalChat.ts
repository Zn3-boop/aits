import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../utils/auth";
import { logger } from "../utils/logger";
import { useVoiceInput } from "./useVoiceInput";
import { emotionFusion } from "../services/multimodal/MultimodalEmotionFusion";
import type { EmotionResult, EmotionType } from "../services/multimodal/MultimodalEmotionFusion";
import { voiceEmotionDetector } from "../services/emotion/VoiceEmotionDetector";
import { userMediaPipeEmotion } from "../services/emotion/UserMediaPipeEmotion";
import { live2dScheduler } from "../services/multimodal/Live2DScheduler";
import { lipSyncEnhancer } from "../live2d-enhancements/LipSyncEnhancer";
import type { Live2DDriver } from "../features/live2d-driver/driver";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface UseMultimodalChatOptions {
  driver: Live2DDriver | null;
  personaId?: string;
  systemPrompt?: string;
}

interface SSEEvent {
  type: "token" | "text" | "emotion" | "audio_chunk" | "done" | "error" | "delta" | "connected";
  content?: string;
  token?: string;
  emotion?: string;
  audio?: string;
  text?: string;
  message?: string;
  reply?: string;
}

export function useMultimodalChat(options: UseMultimodalChatOptions) {
  const { driver, personaId, systemPrompt } = options;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [fusedEmotion, setFusedEmotion] = useState<EmotionResult>({
    type: "neutral", intensity: 0.1, confidence: 0.5, source: "none",
  });
  const [isVideoOn, setIsVideoOn] = useState(false);

  const voiceInput = useVoiceInput({
    onResult: (text) => handleSend(text),
    onError: (err) => logger.error("[MultimodalChat] 语音错误:", err),
  });

  const emotionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const handleSendRef = useRef<(text: string) => Promise<void>>();

  useEffect(() => {
    if (!driver) return;

    live2dScheduler.registerCallbacks({
      onPreloadEmotion: (emotion, _intensity) => {
        driver.driveEmotion(emotion);
      },
      onPlayAudio: (url) => {
        const audio = new Audio(url);
        audio.preload = "auto";
        return audio;
      },
      onStopAudio: () => {},
      onLipSyncStart: (audio) => {
        lipSyncEnhancer.start(audio).catch(() => {
          const text = audio.dataset.text || "";
          const duration = audio.duration ? audio.duration * 1000 : undefined;
          lipSyncEnhancer.startSilentSimulation(text, duration);
        });
      },
      onLipSyncStop: () => {
        lipSyncEnhancer.stop();
      },
      onMicroExpression: (params) => {
        Object.entries(params).forEach(([k, v]) => driver.setOverrideParam(k, v));
      },
      onResetNeutral: () => {
        driver.driveEmotion("neutral");
      },
      onStateChange: (state) => {
        setIsAiSpeaking(state === "speaking");
      },
    });
  }, [driver]);

  useEffect(() => {
    if (isVideoOn) userMediaPipeEmotion.start();
    else userMediaPipeEmotion.stop();

    emotionTimerRef.current = setInterval(() => {
      const videoEmo = isVideoOn ? userMediaPipeEmotion.getLastEmotion() : null;
      const result = emotionFusion.fuse(null, videoEmo);
      setFusedEmotion(result);
    }, 500);

    return () => {
      if (emotionTimerRef.current) clearInterval(emotionTimerRef.current);
      userMediaPipeEmotion.stop();
    };
  }, [isVideoOn, voiceInput.isListening]);

  useEffect(() => {
    if (!voiceInput.isListening) {
      if (voiceStreamRef.current) {
        voiceEmotionDetector.stop();
        voiceStreamRef.current.getTracks().forEach(t => t.stop());
        voiceStreamRef.current = null;
      }
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      voiceStreamRef.current = stream;
      voiceEmotionDetector.start(stream, (data) => {
        const videoEmo = isVideoOn ? userMediaPipeEmotion.getLastEmotion() : null;
        const result = emotionFusion.fuse(data, videoEmo);
        setFusedEmotion(result);
      });
    }).catch(() => {});
  }, [voiceInput.isListening, isVideoOn]);

  const handleSend = useCallback(async (text: string) => {
    if (!text.trim() || !driver) return;

    live2dScheduler.interrupt();

    const userMsg: ChatMessage = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);

    const currentEmotion = fusedEmotion.type;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const res = await apiFetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          personaId,
          userEmotion: currentEmotion,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error("聊天请求失败");
      if (!res.body) throw new Error("无响应体");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      let currentAiEmotion: EmotionType = "neutral";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(l => l.trim());

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.slice(6);
          if (dataStr === "[DONE]") continue;

          try {
            const evt = JSON.parse(dataStr) as SSEEvent;

            if (evt.type === "token" || evt.type === "text" || evt.type === "delta") {
              const txt = evt.content || evt.token || "";
              if (!txt) continue;
              assistantText += txt;
              setMessages(prev => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === "assistant") last.content += txt;
                else copy.push({ role: "assistant", content: txt });
                return copy;
              });
            }

            if (evt.type === "emotion" && evt.emotion) {
              currentAiEmotion = evt.emotion as EmotionType;
            }

            if (evt.type === "audio_chunk" && evt.audio) {
              const binary = Uint8Array.from(atob(evt.audio), c => c.charCodeAt(0));
              const blob = new Blob([binary], { type: "audio/mpeg" });
              const url = URL.createObjectURL(blob);
              const text = evt.text || "";
              const emotion = (evt.emotion as EmotionType) || currentAiEmotion;

              const audio = new Audio(url);
              audio.dataset.text = text;

              live2dScheduler.schedule(emotion, 0.8, url, text);
            }

            if (evt.type === "done") {
              setMessages(prev => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === "assistant" && !last.content) last.content = assistantText;
                return copy;
              });
            }

            if (evt.type === "error") {
              logger.error("[ChatStream] SSE error:", evt.message);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        logger.error("[MultimodalChat] 发送失败:", err);
      }
    }
  }, [messages, personaId, fusedEmotion, driver, systemPrompt]);

  handleSendRef.current = handleSend;

  const toggleVideo = useCallback(() => {
    setIsVideoOn(prev => !prev);
  }, []);

  return {
    messages,
    isAiSpeaking,
    fusedEmotion,
    isListening: voiceInput.isListening,
    isVideoOn,
    interimTranscript: voiceInput.interimTranscript,
    startListening: voiceInput.startListening,
    stopListening: voiceInput.stopListening,
    toggleVideo,
    sendText: handleSend,
  };
}