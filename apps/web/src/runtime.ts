import type {
  Live2DMotionCommand,
  Live2DRenderFrame,
  RuntimeAuditEvent,
  RuntimeEmotionState,
  RuntimeSessionBundle,
  RuntimeTraceRecord,
  RuntimeVisemePacket,
  VoiceSynthesisResult
} from '@lpm/shared';

export const createMotionCommand = (
  sessionId: string,
  motionGroup: string,
  expression: string
): Live2DMotionCommand => ({
  sessionId,
  motionGroup,
  expression,
  priority: 'normal',
  issuedAt: new Date().toISOString(),
  source: 'ui-demo'
});

export const createEmotionState = (sessionId: string, emotion = 'neutral'): RuntimeEmotionState => ({
  sessionId,
  emotion,
  intensity: emotion === 'neutral' ? 0.35 : 0.7,
  capturedAt: new Date().toISOString(),
  source: 'placeholder-rule-engine'
});

export const createRenderFrame = (
  sessionId: string,
  pose: { yaw: number; pitch: number; roll: number },
  visemeLevel: number
): Live2DRenderFrame => ({
  sessionId,
  timestamp: new Date().toISOString(),
  pose,
  eye: {
    leftOpen: Number((1 - visemeLevel * 0.2).toFixed(2)),
    rightOpen: Number((1 - visemeLevel * 0.2).toFixed(2))
  },
  mouth: {
    openness: visemeLevel,
    shape: visemeLevel > 0.66 ? 'A' : visemeLevel > 0.33 ? 'O' : 'I'
  },
  source: 'frontend-preview'
});

export const createVisemePacket = (
  sessionId: string,
  synthesis: VoiceSynthesisResult | undefined,
  fallbackFrames: RuntimeSessionBundle['session']['visemes']
): RuntimeVisemePacket => ({
  sessionId,
  requestId: synthesis?.requestId ?? `preview-${sessionId}`,
  frames: synthesis?.visemes ?? fallbackFrames,
  audioUrl: synthesis?.audioUrl,
  emittedAt: new Date().toISOString()
});

export const createRuntimeBundle = (
  session: RuntimeSessionBundle['session'],
  synthesis?: VoiceSynthesisResult
): RuntimeSessionBundle => {
  const motion = createMotionCommand(session.sessionId, session.motionGroup, session.expression);
  const emotion = createEmotionState(session.sessionId);
  const visemePacket = createVisemePacket(session.sessionId, synthesis, session.visemes);
  const previewLevel = visemePacket.frames[0]?.value ?? 0.25;
  const renderFrame = createRenderFrame(session.sessionId, session.pose, previewLevel);

  return {
    session,
    motion,
    emotion,
    visemePacket,
    renderFrame,
    checkpoints: [
      {
        name: 'session-ready',
        status: 'completed',
        timestamp: new Date().toISOString(),
        note: 'Live2D session metadata received from server.'
      },
      {
        name: 'viseme-preview-ready',
        status: 'completed',
        timestamp: new Date().toISOString(),
        note: 'Frontend created placeholder viseme and render preview pipeline.'
      },
      {
        name: 'mediapipe-binding',
        status: 'pending',
        timestamp: new Date().toISOString(),
        note: 'Replace placeholder pose updates with MediaPipe Face Mesh stream.'
      }
    ]
  };
};

export const createRuntimeAuditTrail = (bundle: RuntimeSessionBundle): RuntimeAuditEvent[] => [
  {
    category: 'session',
    timestamp: new Date().toISOString(),
    summary: 'Live2D session bundle prepared on frontend.',
    payload: {
      sessionId: bundle.session.sessionId,
      modelId: bundle.session.modelId
    }
  },
  {
    category: 'motion',
    timestamp: new Date().toISOString(),
    summary: 'Motion command issued for preview renderer.',
    payload: bundle.motion
  },
  {
    category: 'emotion',
    timestamp: new Date().toISOString(),
    summary: 'Emotion placeholder generated for UI timeline.',
    payload: bundle.emotion
  },
  {
    category: 'viseme',
    timestamp: new Date().toISOString(),
    summary: 'Viseme packet prepared for lip-sync preview.',
    payload: {
      requestId: bundle.visemePacket.requestId,
      frameCount: bundle.visemePacket.frames.length
    }
  },
  {
    category: 'render',
    timestamp: new Date().toISOString(),
    summary: 'Render frame snapshot produced for debugging.',
    payload: bundle.renderFrame
  }
];

export const createTraceRecords = (events: RuntimeAuditEvent[]): RuntimeTraceRecord[] =>
  events.map((event, index) => ({
    id: `${event.category}-${index}`,
    stage: event.category,
    detail: event.summary,
    timestamp: event.timestamp
  }));
