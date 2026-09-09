import { createHash } from 'node:crypto';
import { prisma } from '../db.js';

type ExtractedFact = {
  content: string;
  category: 'preference' | 'emotion' | 'profile' | 'touch' | 'plan' | 'relationship' | 'rejection' | 'general';
  importance: number;
};

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

const pushFact = (facts: ExtractedFact[], fact: ExtractedFact) => {
  const content = normalize(fact.content);
  if (!content || content.length < 4) return;
  if (facts.some(item => item.content === content)) return;
  facts.push({ ...fact, content });
};

function extractByRegex(userMsg: string): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const msg = normalize(userMsg).slice(0, 500);
  if (!msg) return facts;

  if (/(喜欢|爱吃|爱喝|偏好|讨厌|不喜欢|不爱|害怕|想要|希望)/.test(msg)) {
    pushFact(facts, { content: `用户偏好：${msg}`, category: 'preference', importance: 7 });
  }
  if (/(难过|伤心|生气|焦虑|病了|不舒服|压力|失眠|孤独|非常.*开心|特别.*高兴)/.test(msg)) {
    pushFact(facts, { content: `用户情绪：${msg}`, category: 'emotion', importance: 5 });
  }
  if (/(我是|我叫|叫我|我住在|我在|我工作|我上学|我的生日|我家|我的职业)/.test(msg)) {
    pushFact(facts, { content: `用户信息：${msg}`, category: 'profile', importance: 9 });
  }
  if (/(摸了摸你的头|抱了抱你|牵了牵你的手|拍了拍你)/.test(msg)) {
    pushFact(facts, { content: `互动记录：${msg}`, category: 'touch', importance: 4 });
  }
  if (/(明天|下次|周末|打算|计划|准备|要去|想去做|目标是|希望下次)/.test(msg)) {
    pushFact(facts, { content: `用户计划：${msg}`, category: 'plan', importance: 6 });
  }
  if (/(我男|我女|我朋友|我同事|我家人|我父母|我对象|男朋友|女朋友|室友|闺蜜)/.test(msg)) {
    pushFact(facts, { content: `用户关系：${msg}`, category: 'relationship', importance: 8 });
  }
  if (/(不要|不想|不喜欢|讨厌|拒绝|别.*了|算了|别提|别问)/.test(msg)) {
    pushFact(facts, { content: `用户否定：${msg}`, category: 'rejection', importance: 7 });
  }

  return facts;
}

async function extractByLLM(
  userMsg: string,
  aiReply: string,
  config?: { baseUrl: string; model: string; provider: string; apiKey?: string }
): Promise<ExtractedFact[]> {
  if (!config) return [];

  const prompt = `你是记忆提取助手。从用户消息中提取值得长期记忆的事实。
只提取持久信息：偏好、身份、关系、计划、明确否定。忽略闲聊。
严格按以下 JSON 数组格式返回，不要有任何其他文字：
[{"content":"记忆内容","category":"preference|emotion|profile|plan|relationship|rejection|general","importance":1-10}]

用户消息：「${userMsg.slice(0, 300)}」
AI回复上下文：「${aiReply.slice(0, 200)}」`;

  try {
    const isOllama = config.provider === 'ollama' || config.baseUrl.includes('11434');
    let aiContent = '';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    if (isOllama) {
      const res = await fetch(`${config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: '你是一个精确的记忆提取助手，只返回JSON数组。' },
            { role: 'user', content: prompt },
          ],
          stream: false,
          format: 'json',
          options: { temperature: 0.2, num_predict: 200 },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json() as { message?: { content?: string } };
      aiContent = data?.message?.content || '';
    } else {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

      const res = await fetch(`${config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: '你是一个精确的记忆提取助手，只返回JSON数组。' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 200,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json() as { choices?: { message?: { content?: string } }[] };
      aiContent = data?.choices?.[0]?.message?.content || '';
    }

    const jsonMatch = aiContent.match(/\[[\s\S]*?\]/);
    const jsonStr = jsonMatch ? jsonMatch[0] : aiContent;
    const parsed = JSON.parse(jsonStr) as Array<{ content: string; category: string; importance: number }>;

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(p => p.content && p.content.length >= 4)
      .map(p => ({
        content: normalize(p.content),
        category: (['preference','emotion','profile','touch','plan','relationship','rejection','general'].includes(p.category)
          ? p.category
          : 'general') as ExtractedFact['category'],
        importance: Math.min(10, Math.max(1, Math.round(p.importance || 5))),
      }));
  } catch {
    return [];
  }
}

const computeFingerprint = (content: string): string =>
  createHash('sha256').update(content).digest('hex');

async function storeFacts(
  facts: ExtractedFact[],
  personaId: string,
  userId: string,
  aiReply: string
): Promise<number> {
  let stored = 0;
  for (const fact of facts) {
    const fingerprint = computeFingerprint(fact.content);
    const existing = await prisma.personaMemory.findFirst({
      where: {
        personaId,
        userId,
        fingerprint,
      },
    });

    if (!existing) {
      await prisma.personaMemory.create({
        data: {
          personaId,
          userId,
          content: fact.content,
          fingerprint,
          category: fact.category,
          importance: fact.importance,
          tags: {
            source: 'auto-extract',
            type: fact.category,
            aiContext: aiReply.slice(0, 120),
          },
          priority: fact.importance,
        },
      });
      stored += 1;
    }
  }
  return stored;
}

export async function extractAndStoreMemory(
  personaId: string,
  userId: string,
  userMsg: string,
  aiReply: string,
  llmConfig?: { baseUrl: string; model: string; provider: string; apiKey?: string }
) {
  const regexFacts = extractByRegex(userMsg);

  let llmFacts: ExtractedFact[] = [];
  if (regexFacts.length === 0 && normalize(userMsg).length > 10 && llmConfig) {
    llmFacts = await extractByLLM(userMsg, aiReply, llmConfig);
  }

  const allFacts = [...regexFacts];
  for (const f of llmFacts) {
    if (!allFacts.some(e => e.content === f.content)) allFacts.push(f);
  }

  const stored = await storeFacts(allFacts, personaId, userId, aiReply);
  return { stored, categories: allFacts.map(f => f.category) };
}