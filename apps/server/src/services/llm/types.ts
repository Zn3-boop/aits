export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmResponse {
  reply: string;
  emotion?: string;
}

export interface LlmProvider {
  /**
   * 发送聊天请求
   * @param messages 消息历史
   * @param systemPrompt 系统提示词
   * @returns AI回复和情绪
   */
  chat(messages: LlmMessage[], systemPrompt: string): Promise<LlmResponse>;

  /**
   * 检查Provider是否可用
   */
  healthCheck(): Promise<boolean>;
}
