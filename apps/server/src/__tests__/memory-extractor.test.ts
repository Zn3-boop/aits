import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

vi.mock('../db.js', () => ({
  prisma: {
    personaMemory: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { extractAndStoreMemory } from '../services/memory-extractor.js';
import { prisma } from '../db.js';

const mockFindFirst = vi.mocked(prisma.personaMemory.findFirst);
const mockCreate = vi.mocked(prisma.personaMemory.create);

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

describe('extractAndStoreMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores preference fact when user mentions likes', async () => {
    mockFindFirst.mockResolvedValue(null as never);
    mockCreate.mockResolvedValue({ id: '1' } as never);

    const result = await extractAndStoreMemory('p1', 'u1', '我喜欢吃火锅', '我也是！');

    expect(result.stored).toBe(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          personaId: 'p1',
          userId: 'u1',
          content: expect.stringContaining('用户偏好'),
          fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      })
    );
  });

  it('stores emotion fact when user expresses feelings', async () => {
    mockFindFirst.mockResolvedValue(null as never);
    mockCreate.mockResolvedValue({ id: '2' } as never);

    const result = await extractAndStoreMemory('p1', 'u1', '我今天非常开心', '太好了！');

    expect(result.stored).toBe(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: expect.stringContaining('用户情绪'),
          fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      })
    );
  });

  it('stores profile fact when user shares personal info', async () => {
    mockFindFirst.mockResolvedValue(null as never);
    mockCreate.mockResolvedValue({ id: '3' } as never);

    const result = await extractAndStoreMemory('p1', 'u1', '我是大学生', '哦！');

    expect(result.stored).toBe(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: expect.stringContaining('用户信息'),
          fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      })
    );
  });

  it('stores touch interaction fact', async () => {
    mockFindFirst.mockResolvedValue(null as never);
    mockCreate.mockResolvedValue({ id: '4' } as never);

    const result = await extractAndStoreMemory('p1', 'u1', '摸了摸你的头', '嘿嘿');

    expect(result.stored).toBe(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: expect.stringContaining('互动记录'),
          fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      })
    );
  });

  it('skips duplicate facts by fingerprint', async () => {
    mockFindFirst.mockResolvedValue({ id: 'existing' } as never);

    const result = await extractAndStoreMemory('p1', 'u1', '我喜欢吃火锅', '我也是！');

    expect(result.stored).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('uses sha256 fingerprint for dedup instead of prefix', async () => {
    mockFindFirst.mockResolvedValue(null as never);
    mockCreate.mockResolvedValue({ id: '1' } as never);

    await extractAndStoreMemory('p1', 'u1', '我喜欢吃火锅', '我也是！');

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      })
    );
  });

  it('stores both facts with same prefix but different content', async () => {
    mockFindFirst.mockResolvedValue(null as never);
    mockCreate.mockResolvedValue({ id: '1' } as never);

    const contentA = '用户偏好：我喜欢橘猫';
    const contentB = '用户偏好：我喜欢橘猫，还养了两只宠物';
    const fpA = sha256(contentA);
    const fpB = sha256(contentB);

    expect(fpA).not.toBe(fpB);
  });

  it('returns 0 for empty user message', async () => {
    const result = await extractAndStoreMemory('p1', 'u1', '', '回复');

    expect(result.stored).toBe(0);
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns 0 for generic message without facts', async () => {
    const result = await extractAndStoreMemory('p1', 'u1', '你好', '你好呀！');

    expect(result.stored).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('stores multiple facts from a single message', async () => {
    mockFindFirst.mockResolvedValue(null as never);
    mockCreate.mockResolvedValue({ id: 'multi' } as never);

    const result = await extractAndStoreMemory('p1', 'u1', '我喜欢吃火锅，我今天非常开心', '太好了！');

    expect(result.stored).toBe(2);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});