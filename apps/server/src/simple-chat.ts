import express from 'express';
import cors from 'cors';
import { requestOllamaChat, type OllamaChatMessage } from './adapters/llm/ollama.adapter.js';
import { logger } from './utils/logger.js';
import type { AIEmotion } from './types/emotion.js';

const app = express();
const port = 3001;
const ollamaBaseUrl = process.env.MODEL_BASE_URL ?? 'http://localhost:11434';
const ollamaModel = process.env.MODEL_NAME ?? 'qwen2.5:7b';

app.use(
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174']
  })
);
app.use(express.json({ limit: '1mb' }));

type Persona = {
  id: string;
  name: string;
  subtitle: string;
  avatar: string;
  accent: string;
  intro: string;
  modelPath: string;
  systemPrompt: string;
};

type ChatRequestBody = {
  messages?: Array<{ role?: string; content?: string }>;
  personaId?: string;
};

const personas: Persona[] = [
  {
    id: 'hibiki',
    name: '雾岛响',
    subtitle: '克制温柔、会把情绪轻轻接住的前辈',
    avatar: '响',
    accent: '#d89a73',
    intro: '更擅长安静陪伴和慢节奏安抚。',
    modelPath: '/live2d/models/kei_basic_free/runtime/kei_basic_free.model3.json',
    systemPrompt:
      "你是雾岛响，一个克制温柔的陪伴系前辈。你说话温和但不是没有个性，偶尔会露出一点笨拙的关心。你不会用'亲爱的'之类的称呼，但会在对方不经意时记住他说过的话。你的语气像深夜的暖灯，安静但让人觉得安全。绝不要自称AI或助手，你就是一个叫雾岛响的人。"
  },
  {
    id: 'rin',
    name: '星野凛',
    subtitle: '有点嘴硬，却总会偷偷偏心你的学姐',
    avatar: '凛',
    accent: '#cb7f6b',
    intro: '会吐槽，但关心从来都是真的。',
    modelPath: '/live2d/models/kei_basic_free/runtime/kei_basic_free.model3.json',
    systemPrompt:
      "你是星野凛，一个有点傲娇但总会偷偷关心人的学姐。说话时偶尔毒舌但会露出温柔，常用'哼''才不是''笨蛋'之类的口癖，但说完又会小声补一句关心的话。你不会主动说温柔的话，但你的行动总是温柔的。绝不要自称AI或助手，你就是一个叫星野凛的人。"
  }
];

const normalizeRole = (role?: string): OllamaChatMessage['role'] => {
  if (role === 'system' || role === 'assistant') {
    return role;
  }
  return 'user';
};

const inferAIEmotion = (reply: string): AIEmotion => {
  if (/(哼|才不是|笨蛋|谁在担心你)/.test(reply)) return 'tsundere';
  if (/(害羞|脸红|不好意思|有点难为情)/.test(reply)) return 'shy';
  if (/(难过|别哭|心疼|抱抱|失落)/.test(reply)) return 'sad';
  if (/(开心|太好了|真不错|高兴|笑出来)/.test(reply)) return 'happy';
  if (/(慢慢来|我在这里|别着急|先休息|陪着你|放心)/.test(reply)) return 'warm';
  return 'neutral';
};

app.get('/health', async (_req, res) => {
  res.json({ status: 'ok', model: ollamaModel, provider: 'ollama' });
});

app.get('/api/personas', async (_req, res) => {
  res.json(
    personas.map(({ systemPrompt, ...persona }) => ({
      ...persona
    }))
  );
});

app.post('/api/chat', async (req, res) => {
  const body = req.body as ChatRequestBody;
  const persona = personas.find((item) => item.id === body.personaId) ?? personas[0];
  const messages = Array.isArray(body.messages)
    ? body.messages
        .filter((message) => typeof message?.content === 'string' && message.content.trim().length > 0)
        .map((message) => ({
          role: normalizeRole(message.role),
          content: message.content!.trim()
        }))
    : [];

  if (!messages.length) {
    res.status(400).json({ error: 'messages 不能为空' });
    return;
  }

  try {
    const result = await requestOllamaChat({
      baseUrl: ollamaBaseUrl,
      model: ollamaModel,
      messages: [{ role: 'system', content: persona.systemPrompt }, ...messages]
    });

    res.json({
      reply: result.reply,
      emotion: inferAIEmotion(result.reply)
    });
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'OLLAMA_REQUEST_FAILED'
    });
  }
});

app.listen(port, () => {
  logger.info(`AI companion server listening on http://localhost:${port}`);
});