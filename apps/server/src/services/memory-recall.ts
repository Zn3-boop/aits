import { prisma } from '../db.js';

const STOP_WORDS = new Set([
  '的','了','是','我','你','在','有','和','就','不','人','都','一','个','上','也','很','到','说','要','去','会','着','看','好','自己','这','那','什么','怎么','吗','吧','呢','啊','哦','嗯','这个','那个','今天','现在','还是','但是','因为','所以','如果','只是','可以','可能','觉得','感觉','知道','想','一下','没有','又','还','把','被','让','给','跟','对','能','而','已经','过','来','里','为','之','与','及','等','或','而且','然后','不过','虽然','如此','这样','那样','咱们','大家','别人','事情','东西','时候','地方','问题','工作','生活','时间','天','年','月','日','点','分','秒'
]);

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const clean = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ');
  const words = clean.split(/\s+/).filter(Boolean);
  for (const w of words) {
    if (/^\d+$/.test(w)) continue;
    if (w.length >= 2 && !STOP_WORDS.has(w)) tokens.push(w.toLowerCase());
  }
  return [...new Set(tokens)];
}

function calcRelevance(userMsg: string, memoryContent: string): number {
  const msgTokens = tokenize(userMsg);
  const memTokens = tokenize(memoryContent);
  if (memTokens.length === 0 || msgTokens.length === 0) return 0;
  const msgSet = new Set(msgTokens);
  let overlap = 0;
  for (const t of memTokens) if (msgSet.has(t)) overlap++;
  return overlap / Math.sqrt(msgTokens.length * memTokens.length);
}

function timeDecay(days: number): number {
  return Math.exp(-days / 30);
}

export async function recallMemories(
  userMessage: string,
  personaId: string,
  userId: string,
  limit: number = 8
) {
  const [recent, important] = await Promise.all([
    prisma.personaMemory.findMany({
      where: { personaId, userId },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
    prisma.personaMemory.findMany({
      where: { personaId, userId, importance: { gte: 8 } },
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
  ]);

  const seen = new Set<string>();
  const candidates: typeof recent = [];
  for (const m of [...important, ...recent]) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      candidates.push(m);
    }
  }

  const now = Date.now();
  const scored = candidates.map(m => {
    const relevance = calcRelevance(userMessage, m.content);
    const daysSince = (now - new Date(m.lastAccessed).getTime()) / (1000 * 60 * 60 * 24);
    const decay = timeDecay(daysSince);

    const score = relevance * 0.5
                + (m.importance / 10) * 0.3
                + decay * 0.15
                + Math.min(m.accessCount / 20, 0.05);

    return { memory: m, score, relevance };
  });

  const top = scored.sort((a, b) => b.score - a.score).slice(0, limit).map(s => s.memory);

  if (top.length > 0) {
    prisma.personaMemory.updateMany({
      where: { id: { in: top.map(m => m.id) } },
      data: {
        lastAccessed: new Date(),
        accessCount: { increment: 1 },
      },
    }).catch(() => {});
  }

  return top;
}