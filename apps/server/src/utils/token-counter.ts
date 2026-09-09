export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const char of text) {
    if (/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(char)) {
      tokens += 1.5;
    } else if (/[a-zA-Z]/.test(char)) {
      tokens += 0.25;
    } else if (/\d/.test(char)) {
      tokens += 0.5;
    } else {
      tokens += 0.5;
    }
  }
  return Math.ceil(tokens);
}

export function estimateMessagesTokens(
  messages: Array<{ content: string }>,
  overheadPerMessage: number = 4
): number {
  return messages.reduce(
    (sum, m) => sum + overheadPerMessage + estimateTokens(m.content),
    0
  );
}

export function shouldCompress(
  messages: Array<{ content: string }>,
  maxTokens: number = 2500
): boolean {
  return estimateMessagesTokens(messages) > maxTokens;
}