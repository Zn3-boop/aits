import { prisma } from '../db.js';
import type { AIEmotion, UserEmotion, TimeMode } from '../types/emotion.js';

export type { AIEmotion, UserEmotion, TimeMode };

export const AFFECTION_LEVEL_NAMES = ['陌生', '初识', '熟悉', '亲密', '恋人', '专属'] as const;

const levelThresholds = [0, 50, 150, 320, 600, 1000];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function affectionLevelFromScore(score: number) {
  let level = 0;
  for (let i = 0; i < levelThresholds.length; i += 1) {
    if (score >= levelThresholds[i]) level = i;
  }
  return clamp(level, 0, levelThresholds.length - 1);
}

export function getTimeMode(date = new Date()): TimeMode {
  const hour = date.getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}

export async function getOrCreateAffection(personaId: string, userId: string) {
  const existing = await prisma.personaAffection.findUnique({
    where: { personaId_userId: { personaId, userId } },
  });
  if (existing) return existing;

  return prisma.personaAffection.create({
    data: {
      personaId,
      userId,
      level: 0,
      score: 0,
    },
  });
}

export async function updateAffectionAfterChat(personaId: string, userId: string, userMsg: string) {
  const current = await getOrCreateAffection(personaId, userId);
  let delta = 0;
  const reasons: string[] = [];

  if (/(谢谢|辛苦|关心你|想你|喜欢你|陪陪|抱抱|晚安|早安|注意休息|你也要)/.test(userMsg)) {
    delta += 10;
    reasons.push('care_or_kindness');
  }

  if (/(傻逼|滚|闭嘴|废物|垃圾|讨厌你|烦死|去死)/.test(userMsg)) {
    delta -= 20;
    reasons.push('negative_or_abusive');
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const activeDays = await prisma.personaConversation.findMany({
    where: { personaId, userId, role: 'user', createdAt: { gte: since }, deletedAt: null },
    select: { createdAt: true },
  });
  const uniqueDays = new Set(activeDays.map(item => item.createdAt.toISOString().slice(0, 10))).size;
  if (uniqueDays >= 7) {
    delta += 5;
    reasons.push('seven_day_streak');
  }

  const nextScore = clamp(current.score + delta, 0, 1000);
  const nextLevel = affectionLevelFromScore(nextScore);

  const updated = await prisma.personaAffection.upsert({
    where: { personaId_userId: { personaId, userId } },
    create: {
      personaId,
      userId,
      score: nextScore,
      level: nextLevel,
    },
    update: {
      score: nextScore,
      level: nextLevel,
    },
  });

  return { affection: updated, delta, reasons };
}

export function determineAIEmotion(userEmotion: UserEmotion, affectionLevel: number, timeMode: TimeMode): AIEmotion {
  if (timeMode === 'night' && (userEmotion === 'sad' || userEmotion === 'neutral' || userEmotion === 'tired')) return 'sleepy';
  if (userEmotion === 'sad') return affectionLevel >= 2 ? 'concerned' : 'warm';
  if (userEmotion === 'happy') return 'happy';
  if (userEmotion === 'angry') return affectionLevel >= 3 ? 'concerned' : 'warm';
  if (userEmotion === 'fearful') return affectionLevel >= 2 ? 'concerned' : 'warm';
  if (userEmotion === 'surprised') return affectionLevel >= 2 ? 'warm' : 'neutral';
  if (userEmotion === 'disgusted') return affectionLevel >= 2 ? 'concerned' : 'neutral';
  if (userEmotion === 'tired') return 'sleepy';
  if (affectionLevel >= 4) return 'shy';
  if (affectionLevel >= 2) return 'warm';
  return 'neutral';
}

export const emotionPrompts: Record<AIEmotion, string> = {
  warm: '你感到温暖，语气柔和，像老朋友一样接住对方的话。',
  tsundere: '你有点傲娇，嘴上说着不在乎，但行动和细节里会明显关心对方。',
  shy: '你有点害羞，说话轻声细语，偶尔会停顿或脸红，但仍认真回应。',
  sad: '你有些低落，但会努力不把情绪压给对方，用克制的方式表达需要陪伴。',
  happy: '你心情很好，回应更轻快，会自然地分享一点开心和鼓励。',
  neutral: '你状态平稳，保持自然、真诚、不过度夸张的陪伴语气。',
  concerned: '你很担心对方，会优先安抚、陪伴和确认对方当下是否安全舒服。',
  sleepy: '现在偏晚，你带着一点困意和温柔，提醒对方慢慢休息，不要说教。',
};

export const timeModePrompts: Record<TimeMode, string> = {
  morning: '现在是早晨，回复里可以带一点清醒、开始新一天的轻柔感。',
  afternoon: '现在是下午，回复保持稳定、陪伴和鼓励。',
  evening: '现在是傍晚，回复可以带一点收束一天后的放松感。',
  night: '现在是夜晚，回复更轻声、更安静，适合陪伴和休息。',
};