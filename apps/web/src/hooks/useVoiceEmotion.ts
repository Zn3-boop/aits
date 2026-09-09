import { useEffect, useRef, useState } from 'react';
import { voiceEmotionDetector } from '../services/emotion/VoiceEmotionDetector';
import { VoiceEmotionData } from '../services/multimodal/MultimodalEmotionFusion';

export function useVoiceEmotion(isListening: boolean) {
  const [data, setData] = useState<VoiceEmotionData | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isListening) {
      voiceEmotionDetector.stop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setData(null);
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      streamRef.current = stream;
      voiceEmotionDetector.start(stream, setData);
    }).catch(() => setData(null));

    return () => {
      voiceEmotionDetector.stop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [isListening]);

  return data;
}