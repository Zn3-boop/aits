import { mkdir, appendFile, rm } from 'node:fs/promises';
import path from 'node:path';

const dataRoot = path.resolve(process.cwd(), '../../data');
const systemRoot = path.join(dataRoot, 'system');
const usersRoot = path.join(dataRoot, 'users');
const startupLogFile = path.join(systemRoot, 'startup.log');

const ensureDir = async (dir: string) => {
  await mkdir(dir, { recursive: true });
};

const writeQueues = new Map<string, Promise<void>>();

const appendJsonLine = async (filePath: string, entry: Record<string, unknown>) => {
  const nextLine = `${JSON.stringify(entry)}\n`;
  const prev = writeQueues.get(filePath) ?? Promise.resolve();
  const next = prev
    .then(() => ensureDir(path.dirname(filePath)))
    .then(() => appendFile(filePath, nextLine, 'utf8'))
    .catch((err) => {
      console.warn(`[audit] write failed: ${filePath}`, err);
    });
  writeQueues.set(filePath, next);
  void next.then(() => {
    if (writeQueues.get(filePath) === next) {
      writeQueues.delete(filePath);
    }
  });
};

const nowIso = () => new Date().toISOString();

export const getUserAuditRoot = (userId: string) => path.join(usersRoot, userId, 'audit');

export const writeStartupAudit = async (payload: Record<string, unknown>) => {
  await appendJsonLine(startupLogFile, {
    type: 'system.startup',
    timestamp: nowIso(),
    ...payload
  });
};

// [P1-1] 审计写入加 try-catch：防止审计写入失败（磁盘满/权限不足）阻断主业务流程
export const writeUserAudit = async (
  userId: string,
  category: 'chat' | 'memory' | 'live2d' | 'voice' | 'security' | 'emotion' | 'conversation' | 'persona',
  payload: Record<string, unknown>
) => {
  try {
    const filePath = path.join(getUserAuditRoot(userId), `${category}.jsonl`);
    await appendJsonLine(filePath, {
      userId,
      category,
      timestamp: nowIso(),
      ...payload
    });
  } catch (err) {
    // 审计写入失败仅 warn，不向上抛出，保证主业务不受影响
    console.warn(`[audit] writeUserAudit failed for user=${userId} category=${category}`, err);
  }
};

export const deleteUserLocalData = async (userId: string) => {
  const userDir = path.join(usersRoot, userId);
  await rm(userDir, { recursive: true, force: true });
  return { userId, deletedPath: userDir };
};