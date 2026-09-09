import { Prisma } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { isPostgres, prisma, queryJson } from './db.js';
import { deleteUserLocalData } from './local-audit.js';
import { logger } from './utils/logger.js';

export type ScopedRecord = {
  id: string;
  userId: string;
  scope: 'memory' | 'voice';
  payload: Record<string, unknown>;
  updatedAt: string;
  createdAt?: string;
  deletedAt?: string | null;
};

export type RetrievalMode = 'keyword' | 'semantic' | 'jsonb';

export type RetrievalCandidate = {
  record: ScopedRecord;
  score: number;
  matchedTerms: string[];
  reasons: string[];
  mode: RetrievalMode;
};

export type MemorySearchOptions = {
  query?: string;
  limit?: number;
  tags?: string[];
  minPriority?: number;
  memoryTypes?: ScopeType[];
  semantic?: boolean;
  jsonPathFilters?: Array<{
    path: string[];
    equals?: string | number | boolean;
    contains?: string;
  }>;
};

type ScopeType = ScopedRecord['scope'];

type UpsertScopedRecordInput = {
  id: string;
  userId: string;
  scope: ScopeType;
  payload: Record<string, unknown>;
  updatedAt?: string;
};

type UpdateScopedRecordInput = {
  id: string;
  userId: string;
  scope: ScopeType;
  payload?: Record<string, unknown>;
  deletedAt?: string | null;
};

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

const normalizeKey = (value: string) => createHash('sha256').update(value).digest();

const encryptionKey = () => {
  const raw = process.env.ENCRYPTION_KEY || 'dev-encryption-key-32chars!!';
  if (raw === 'dev-encryption-key-32chars!!') {
    logger.warn('[SECURITY] Using default ENCRYPTION_KEY — set a strong key in production!');
  }
  return normalizeKey(raw);
};

const parseJsonRecord = (value: Prisma.JsonValue): Record<string, unknown> => {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
};


/**
 * 将 userId (可能是 UUID 或 username) 解析为数据库中的 UUID
 */
const resolveUserId = async (userId: string): Promise<string> => {
  // 先尝试按 id (UUID) 查找
  const byId = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (byId) return byId.id;

  // 再尝试按 username 查找
  const byUsername = await prisma.user.findUnique({ where: { username: userId }, select: { id: true } });
  if (byUsername) return byUsername.id;

  // 都找不到就返回原值（后续查询会返回空结果）
  return userId;
};

const parseTags = (value: Prisma.JsonValue): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  return [];
};

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);

const unique = <T>(items: T[]) => [...new Set(items)];

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

const flattenPayloadText = (payload: Record<string, unknown>) => JSON.stringify(payload).toLowerCase();

const extractPayloadTags = (payload: Record<string, unknown>) => {
  const direct = payload.tags;
  if (Array.isArray(direct)) {
    return direct.filter((item): item is string => typeof item === 'string').map((item) => item.toLowerCase());
  }
  return [];
};

const getValueAtPath = (payload: Record<string, unknown>, path: string[]) => {
  let cursor: unknown = payload;
  for (const segment of path) {
    if (typeof cursor !== 'object' || cursor === null || Array.isArray(cursor) || !(segment in cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
};

const scoreCandidate = (record: ScopedRecord, query: string, semantic: boolean): RetrievalCandidate => {
  const text = flattenPayloadText(record.payload);
  const recordTags = extractPayloadTags(record.payload);
  const terms = unique(tokenize(query));
  const matchedTerms = terms.filter((term) => text.includes(term) || recordTags.includes(term));
  const overlap = terms.length ? matchedTerms.length / terms.length : 0;
  let score = overlap * 0.6;
  const reasons: string[] = [];
  let mode: RetrievalMode = 'keyword';

  if (matchedTerms.length > 0) {
    reasons.push(`keyword:${matchedTerms.join(',')}`);
  }

  if (semantic) {
    const semanticHints = unique(
      terms.flatMap((term) => {
        const hints = [term];
        if (term.includes('工作')) hints.push('职业', '公司');
        if (term.includes('喜欢')) hints.push('偏好', '兴趣');
        if (term.includes('家')) hints.push('家庭', '住址');
        if (term.includes('生日')) hints.push('出生');
        return hints;
      })
    );

    const semanticMatches = semanticHints.filter((term) => text.includes(term));
    if (semanticMatches.length > 0) {
      score += 0.3 + semanticMatches.length * 0.05;
      reasons.push(`semantic:${unique(semanticMatches).join(',')}`);
      mode = matchedTerms.length > 0 ? 'semantic' : 'semantic';
    }
  }

  const priority = typeof record.payload.priority === 'number' ? Number(record.payload.priority) : 0;
  score += Math.min(priority, 10) * 0.02;
  if (priority > 0) {
    reasons.push(`priority:${priority}`);
  }

  const freshnessBoost = Math.max(0, 1 - (Date.now() - new Date(record.updatedAt).getTime()) / (1000 * 60 * 60 * 24 * 30));
  score += freshnessBoost * 0.1;
  reasons.push(`freshness:${freshnessBoost.toFixed(2)}`);

  return {
    record,
    score: Number(score.toFixed(4)),
    matchedTerms,
    reasons,
    mode
  };
};

const encryptPayload = (payload: Record<string, unknown>) => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
    data: encrypted.toString('base64')
  });
};

const decryptPayload = (value: string | null, fallback: Record<string, unknown>) => {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value) as { iv: string; tag: string; data: string };
    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(parsed.iv, 'base64'));

    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(parsed.data, 'base64')),
      decipher.final()
    ]).toString('utf8');

    return JSON.parse(decrypted) as Record<string, unknown>;
  } catch (err) {
    // [P1-4] 解密失败记录 error 日志，便于排查密钥轮换/数据损坏问题，仍返回 fallback 不阻断业务
    logger.error('[memory-store] decryptPayload failed, returning fallback', err);
    return fallback;
  }
};

const ensureUser = async (userId: string) => {
  const byId = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true } });
  if (byId) return byId;

  const byUsername = await prisma.user.findUnique({ where: { username: userId }, select: { id: true, username: true } });
  if (byUsername) return byUsername;

  throw new Error(`User not found: ${userId}. User must register before using memory features.`);
};

const toRecord = (memory: {
  id: string;
  contentJson: Prisma.JsonValue;
  encryptedBlob: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  user?: { username: string };
  userId?: string;
  memoryType: string;
}): ScopedRecord => {
  const rawPayload = parseJsonRecord(memory.contentJson);

  let payload: Record<string, unknown>;
  try {
    payload = decryptPayload(memory.encryptedBlob, rawPayload);
  } catch {
    payload = rawPayload;
  }

  return {
    id: memory.id,
    userId: memory.user?.username ?? memory.userId ?? 'unknown',
    scope: memory.memoryType as ScopeType,
    payload,
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
    deletedAt: memory.deletedAt?.toISOString() ?? null
  };
};

const toTagJson = (payload: Record<string, unknown>) => JSON.stringify(extractPayloadTags(payload));

export const putScopedRecord = async (record: UpsertScopedRecordInput) => {
  const user = await ensureUser(record.userId);

  const saved = await prisma.memory.upsert({
    where: { id: record.id },
    update: {
      memoryType: record.scope,
      contentJson: JSON.stringify(record.payload),
      encryptedBlob: encryptPayload(record.payload),
      tags: toTagJson(record.payload),
      priority: typeof record.payload.priority === 'number' ? Number(record.payload.priority) : 0,
      deletedAt: null
    },
    create: {
      id: record.id,
      userId: user.id,
      memoryType: record.scope,
      contentJson: JSON.stringify(record.payload),
      encryptedBlob: encryptPayload(record.payload),
      tags: toTagJson(record.payload),
      priority: typeof record.payload.priority === 'number' ? Number(record.payload.priority) : 0
    },
    include: {
      user: {
        select: { username: true }
      }
    }
  });

  return toRecord(saved);
};

export const listScopedRecords = async (userId: string, scope: ScopeType, query?: string) => {
  const resolvedUserId = await resolveUserId(userId);
  const records = await prisma.memory.findMany({
    where: {
      memoryType: scope,
      deletedAt: null,
      userId: resolvedUserId
    },
    include: {
      user: {
        select: { username: true }
      }
    },
    orderBy: {
      updatedAt: 'desc'
    }
  });

  const mapped = records.map(toRecord);
  if (!query?.trim()) {
    return mapped;
  }

  const needle = query.trim().toLowerCase();
  return mapped.filter((item) => JSON.stringify(item.payload).toLowerCase().includes(needle));
};

export const searchScopedRecords = async (userId: string, scope: ScopeType, options: MemorySearchOptions = {}) => {
  const query = options.query?.trim() ?? '';
  const tags = options.tags?.map((item) => item.toLowerCase()) ?? [];
  const queryTerms = unique(tokenize(query));
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 20);
  const minPriority = options.minPriority ?? 0;

  const useJsonbFilters = !!options.jsonPathFilters?.length;

  if (isPostgres()) {
    const rows = await queryJson<
      Array<{
        id: string;
        userId: string;
        memoryType: string;
        contentJson: Prisma.JsonValue;
        tags: Prisma.JsonValue;
        priority: number;
        encryptedBlob: string | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
      }>
    >(Prisma.sql`
      SELECT
        m.id,
        u.username AS "userId",
        m."memoryType",
        m."contentJson",
        m.tags,
        m.priority,
        m."encryptedBlob",
        m."createdAt",
        m."updatedAt",
        m."deletedAt"
      FROM "Memory" m
      INNER JOIN "User" u ON u.id = m."userId"
      WHERE u.username = ${userId}
        AND m."memoryType" = ${scope}
        AND m."deletedAt" IS NULL
        AND m.priority >= ${minPriority}
      ORDER BY m.priority DESC, m."updatedAt" DESC
      LIMIT ${Math.max(limit * 5, 20)}
    `);

    const mapped = rows.map((row) =>
      toRecord({
        id: row.id,
        userId: row.userId,
        memoryType: row.memoryType,
        contentJson: row.contentJson,
        encryptedBlob: row.encryptedBlob,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
        deletedAt: row.deletedAt ? new Date(row.deletedAt) : null
      })
    );

    return mapped.map((record) => {
      if (!query) {
        return {
          record,
          score: 0.25,
          matchedTerms: [],
          reasons: ['postgres-jsonb-filter'],
          mode: useJsonbFilters ? 'jsonb' : 'keyword'
        };
      }

      const candidate = scoreCandidate(record, query, options.semantic !== false);
      return {
        ...candidate,
        mode: useJsonbFilters ? 'jsonb' : candidate.mode,
        reasons: [...candidate.reasons, 'postgres-native-ranking']
      };
    });
  }

  const resolvedUserId = await resolveUserId(userId);
  const records = await prisma.memory.findMany({
    where: {
      memoryType: scope,
      deletedAt: null,
      priority: { gte: minPriority },
      userId: resolvedUserId
    },
    include: {
      user: {
        select: { username: true }
      }
    },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }]
  });

  const mapped = records.map(toRecord);
  const filtered = mapped.filter((item) => {
    const payloadTags = extractPayloadTags(item.payload);
    const tagMatched = tags.length === 0 || tags.every((tag) => payloadTags.includes(tag));
    if (!tagMatched) {
      return false;
    }

    if (!options.jsonPathFilters?.length) {
      return true;
    }

    return options.jsonPathFilters.every((filter) => {
      const value = getValueAtPath(item.payload, filter.path);
      if (filter.equals !== undefined) {
        return String(value).toLowerCase() === String(filter.equals).toLowerCase();
      }
      if (filter.contains !== undefined) {
        return String(value ?? '').toLowerCase().includes(filter.contains.toLowerCase());
      }
      return true;
    });
  });

  if (!query) {
    return filtered.slice(0, limit).map((record) => ({
      record,
      score: 0.2,
      matchedTerms: [],
      reasons: ['filter-only'],
      mode: useJsonbFilters ? 'jsonb' : 'keyword'
    }));
  }

  return filtered
    .map((record) => scoreCandidate(record, query, options.semantic !== false))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((candidate) => ({
      ...candidate,
      mode: useJsonbFilters ? 'jsonb' : candidate.mode
    }));
};


export const updateScopedRecord = async (input: UpdateScopedRecordInput) => {
  const resolvedUserId = await resolveUserId(input.userId);
  const existing = await prisma.memory.findFirst({
    where: {
      id: input.id,
      memoryType: input.scope,
      userId: resolvedUserId
    },
    include: {
      user: {
        select: { username: true }
      }
    }
  });

  if (!existing) {
    return null;
  }

  const nextPayload = input.payload ?? parseJsonRecord(existing.contentJson);

  const saved = await prisma.memory.update({
    where: { id: existing.id },
    data: {
      contentJson: JSON.stringify(nextPayload),
      encryptedBlob: encryptPayload(nextPayload),
      tags: toTagJson(nextPayload),
      priority: typeof nextPayload.priority === 'number' ? Number(nextPayload.priority) : existing.priority,
      deletedAt: input.deletedAt === undefined ? existing.deletedAt : input.deletedAt ? new Date(input.deletedAt) : null
    },
    include: {
      user: {
        select: { username: true }
      }
    }
  });

  return toRecord(saved);
};

export const deleteScopedRecord = async (id: string, userId: string, scope: ScopeType) => {
  try {
    const resolvedUserId = await resolveUserId(userId);

    // 先检查记录是否存在且属于该用户
    const existing = await prisma.memory.findFirst({
      where: {
        id,
        memoryType: scope,
        userId: resolvedUserId
      },
      include: {
        user: {
          select: { username: true }
        }
      }
    });

    if (!existing) {
      logger.warn('deleteScopedRecord: record not found', JSON.stringify({ id, scope, userId, resolvedUserId }));
      return null;
    }

    // 物理删除
    await prisma.memory.delete({
      where: { id: existing.id }
    });

    return toRecord(existing);
  } catch (err) {
    logger.error('deleteScopedRecord error:', String(err));
    throw err;
  }
};

export const deleteAllUserScopedData = async (userId: string) => {
  // 先尝试按 id (UUID) 查找，再按 username 查找
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    ?? await prisma.user.findUnique({ where: { username: userId }, select: { id: true } });

  let databaseDeleted = false;

  if (user) {
    await prisma.$transaction([
      prisma.memory.deleteMany({ where: { userId: user.id } }),
      prisma.personaMemory.deleteMany({ where: { userId: user.id } }),
      prisma.personaConversation.deleteMany({ where: { userId: user.id } }),
      prisma.persona.deleteMany({ where: { userId: user.id } }),
      prisma.voiceProfile.deleteMany({ where: { userId: user.id } }),
      prisma.live2DModel.deleteMany({ where: { userId: user.id, isSystem: false } }),
      prisma.user.delete({ where: { id: user.id } })
    ]);
    databaseDeleted = true;
  }

  const local = await deleteUserLocalData(userId);

  return {
    success: true,
    userId,
    databaseDeleted,
    local
  };
};