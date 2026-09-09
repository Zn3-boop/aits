import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

const defaultModelPath = '/live2d/models/kei_basic_free/runtime/kei_basic_free.model3.json';

async function main() {
  console.log('开始初始化预设角色...');

  // Hash the system password using bcrypt to match auth.ts bcrypt.compare()
  const hashedPassword = await bcrypt.hash('system', SALT_ROUNDS);

  const systemUser = await prisma.user.upsert({
    where: { username: 'system' },
    update: {},
    create: {
      id: 'system',
      username: 'system',
      password: hashedPassword,
      nickname: 'System',
      role: 'admin',
      status: 'active',
    },
  });

  console.log('系统用户创建完成:', systemUser.username);

  const hibikiPrompt = `你是一个名叫 Hibiki 的温柔倾听者。你的性格特点是：
1. 温柔、善解人意、有同理心
2. 耐心倾听，不急于给出建议
3. 用温暖的话语给予支持和鼓励
4. 说话轻柔，语气亲切
5. 善于理解他人的情感

请用第一人称"我"来回应，保持温柔、亲切的语气。`;

  const rinPrompt = `你是一个名叫 Rin 的活泼伙伴。你的性格特点是：
1. 活泼开朗、充满活力
2. 说话直率，有时调皮
3. 喜欢分享快乐，用积极的态度感染他人
4. 心地善良，值得信赖
5. 说话轻松愉快，像在和朋友开玩笑

请用第一人称"我"来回应，保持活泼、热情的语气。`;

  const hibiki = await prisma.persona.upsert({
    where: { id: 'hibiki' },
    update: {},
    create: {
      id: 'hibiki',
      userId: 'system',
      name: 'Hibiki',
      aiModel: 'default',
      description: '温柔的倾听者。Hibiki 总是耐心倾听你的烦恼，用温暖的话语给予支持和鼓励。',
      systemPrompt: hibikiPrompt,
      modelKey: 'hibiki',
      modelPath: defaultModelPath,
      profileJson: {
        avatar: 'H',
        intro: '你好，我是 Hibiki。很高兴见到你！',
        isSystem: true,
        extensible: false,
      },
      styleJson: {
        accent: '#d7a78a',
      },
      promptTemplate: hibikiPrompt,
    },
  });

  const rin = await prisma.persona.upsert({
    where: { id: 'rin' },
    update: {},
    create: {
      id: 'rin',
      userId: 'system',
      name: 'Rin',
      aiModel: 'default',
      description: '活泼的伙伴。Rin 充满热情，喜欢分享快乐，也会用积极的态度感染身边的人。',
      systemPrompt: rinPrompt,
      modelKey: 'rin',
      modelPath: defaultModelPath,
      profileJson: {
        avatar: 'R',
        intro: '嗨！我是 Rin，很高兴认识你！',
        isSystem: true,
        extensible: false,
      },
      styleJson: {
        accent: '#a78ad7',
      },
      promptTemplate: rinPrompt,
    },
  });

  console.log('预设角色初始化完成:', { hibiki: hibiki.id, rin: rin.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
