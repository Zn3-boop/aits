export type LlmChatRole = 'system' | 'user' | 'assistant';
export type LlmChatMessage = {
    role: LlmChatRole;
    content: string;
};
export type RetrievedMemorySummary = {
    id: string;
    score: number;
    mode: string;
    reasons: string[];
    payload: Record<string, unknown>;
};
export type ComposeCompanionMessagesInput = {
    userId: string;
    message: string;
    emotion: string;
    shortTermSummary: string[];
    longTermSummary: RetrievedMemorySummary[];
    channel?: 'text' | 'voice';
    personaPrompt?: string;
    personaName?: string;
};
export declare const composeCompanionMessages: (input: ComposeCompanionMessagesInput) => LlmChatMessage[];
//# sourceMappingURL=index.d.ts.map