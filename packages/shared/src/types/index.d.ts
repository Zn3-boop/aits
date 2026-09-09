export type ChannelMode = 'text' | 'voice';
export type ScopeType = 'memory' | 'persona' | 'voice';
export type VoiceEngineProvider = 'cosyvoice-http' | 'gpt-sovits-http' | 'edge-tts';
export type VoiceJobStatus = 'pending' | 'processing' | 'completed' | 'failed';
export interface ChatMessagePayload {
    userId: string;
    sessionId: string;
    message: string;
    channel: ChannelMode;
}
export interface ChatContextItem {
    id: string;
    scope: ScopeType;
    payload: Record<string, unknown>;
    updatedAt: string;
}
export interface ChatResponsePayload {
    reply: string;
    memoryScope: string;
    personaScope: string;
    context: ChatContextItem[];
    security: {
        promptInjectionDetected: boolean;
        contentBlocked: boolean;
    };
    model: {
        provider: string;
        baseUrl: string;
        name?: string;
    };
}
export interface PublicRuntimeConfig {
    appName: string;
    wsUrl: string;
}
export interface VisemeFrame {
    time: number;
    value: number;
}
export interface Live2DSessionState {
    sessionId: string;
    userId: string;
    runtime: 'cubism-web-sdk';
    modelId: string;
    modelPath: string;
    motionGroup: string;
    expression: string;
    lipSyncMode: 'viseme-stream';
    ttsStreamUrl: string;
    faceTracking: {
        provider: 'mediapipe-face-mesh';
        enabled: boolean;
    };
    pose: {
        yaw: number;
        pitch: number;
        roll: number;
    };
    visemes: VisemeFrame[];
    avatarModel: {
        id: string;
        path: string;
        runtime: 'cubism-web-sdk';
        idleMotionGroup: string;
        defaultExpression: string;
        previewImage: string;
    };
    lipSyncSource: {
        mode: 'tts-viseme';
        ttsStreamUrl: string;
        visemeFrames: VisemeFrame[];
        audioSampleRate: number;
    };
    multiUserScope: {
        userId: string;
        personaKey: string;
        voiceProfileKey: string;
        storageRoot: string;
    };
    runtimeNotes: {
        renderer: 'frontend-driven';
        note: string;
        nextStep: string;
    };
}
export interface VoiceCloneJob {
    jobId: string;
    userId: string;
    provider: VoiceEngineProvider;
    status: VoiceJobStatus;
    sourceFiles: string[];
    createdAt: string;
    updatedAt: string;
    outputVoiceId?: string;
    error?: string;
    upload: {
        acceptedFormats: string[];
        minSamples: number;
        recommendedDurationSec: number;
        targetSampleRate: number;
    };
    storage: {
        userVoiceDir: string;
        isolationKey: string;
    };
    nextAction: 'upload-more-samples' | 'ready-for-synthesis';
}
export interface VoiceSynthesisResult {
    requestId: string;
    userId: string;
    provider: VoiceEngineProvider;
    text: string;
    audioUrl: string;
    mimeType: 'audio/wav' | 'audio/mpeg';
    sampleRate: number;
    visemes: VisemeFrame[];
    audioBase64?: string;
}
export interface Live2DMotionCommand {
    sessionId: string;
    motionGroup: string;
    expression: string;
    priority: 'low' | 'normal' | 'high';
    issuedAt: string;
    source: 'ui-demo' | 'server-rule' | 'mediapipe-stream';
}
export interface RuntimeEmotionState {
    sessionId: string;
    emotion: string;
    intensity: number;
    capturedAt: string;
    source: 'placeholder-rule-engine' | 'emotion-model' | 'user-feedback';
}
export interface RuntimeVisemePacket {
    sessionId: string;
    requestId: string;
    frames: VisemeFrame[];
    audioUrl?: string;
    emittedAt: string;
}
export interface Live2DRenderFrame {
    sessionId: string;
    timestamp: string;
    pose: {
        yaw: number;
        pitch: number;
        roll: number;
    };
    eye: {
        leftOpen: number;
        rightOpen: number;
    };
    mouth: {
        openness: number;
        shape: 'A' | 'E' | 'I' | 'O' | 'U';
    };
    source: 'frontend-preview' | 'mediapipe-stream';
}
export interface RuntimeCheckpoint {
    name: string;
    status: 'pending' | 'completed' | 'failed';
    timestamp: string;
    note: string;
}
export interface RuntimeSessionBundle {
    session: Live2DSessionState;
    motion: Live2DMotionCommand;
    emotion: RuntimeEmotionState;
    visemePacket: RuntimeVisemePacket;
    renderFrame: Live2DRenderFrame;
    checkpoints: RuntimeCheckpoint[];
}
export interface RuntimeAuditEvent {
    category: 'session' | 'motion' | 'emotion' | 'viseme' | 'render';
    timestamp: string;
    summary: string;
    payload: unknown;
}
export interface RuntimeTraceRecord {
    id: string;
    stage: string;
    detail: string;
    timestamp: string;
}
//# sourceMappingURL=index.d.ts.map