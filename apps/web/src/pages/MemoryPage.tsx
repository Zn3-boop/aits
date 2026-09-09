import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../main';
import { apiFetch } from '../utils/auth';
import { logger } from '../utils/logger';

interface Memory {
  id: string;
  content: string;
  priority: number;
  memoryType: string;
  tags?: Record<string, unknown>;
  personaId?: string;
  personaName?: string;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  memory: '普通记忆',
  preference: '偏好',
  emotion: '情绪',
  profile: '个人信息',
  touch: '互动',
  fact: '事实',
};

export default function MemoryPage() {
  const { logout } = useContext(AuthContext)!;
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    loadMemories();
  }, [logout]);

  async function loadMemories(keyword?: string) {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (keyword) params.set('keyword', keyword);
      const url = '/api/memories/all' + (params.toString() ? '?' + params.toString() : '');
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
      } else {
        logger.error('加载记忆失败:', res.status);
      }
    } catch (error) {
      logger.error('加载记忆失败:', error);
      if (error instanceof Error && error.message.includes('登录已过期')) {
        logout();
        window.location.href = '/login';
      }
    } finally {
      setLoading(false);
    }
  }

  const filteredMemories = memories.filter(m => {
    const matchType = filterType === 'all' || m.memoryType === filterType;
    return matchType;
  });

  const typeOptions = [...new Set(memories.map(m => m.memoryType))];

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ color: 'var(--accent)', marginBottom: '20px' }}>📚 记忆库</h1>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="搜索记忆..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') loadMemories(search); }}
          style={{
            flex: 1,
            padding: '12px',
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-input)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '14px'
          }}
        />
        <button
          onClick={() => loadMemories(search)}
          style={{
            padding: '12px 20px',
            backgroundColor: 'var(--accent)',
            color: 'var(--bg-primary)',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          搜索
        </button>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{
            padding: '12px',
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-input)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontSize: '14px'
          }}
        >
          <option value="all">全部类型</option>
          {typeOptions.map(t => (
            <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--text-dim)' }}>
        共 {filteredMemories.length} 条记忆
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
          加载中...
        </div>
      ) : filteredMemories.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
          {search ? '没有找到相关记忆' : '暂无记忆记录'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '15px' }}>
          {filteredMemories.map(memory => (
            <div
              key={memory.id}
              style={{
                padding: '20px',
                backgroundColor: 'var(--bg-secondary)',
                borderRadius: '12px',
                borderLeft: '4px solid var(--accent)'
              }}
            >
              <div style={{ marginBottom: '10px', lineHeight: '1.6', color: 'var(--text-primary)' }}>
                {memory.content}
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '12px', color: 'var(--text-dim)', flexWrap: 'wrap' }}>
                {memory.personaName && (
                  <span style={{ padding: '2px 8px', backgroundColor: 'var(--accent)', color: 'var(--bg-primary)', borderRadius: '4px' }}>
                    {memory.personaName}
                  </span>
                )}
                <span style={{ padding: '2px 8px', backgroundColor: 'var(--bg-input)', borderRadius: '4px' }}>
                  {TYPE_LABELS[memory.memoryType] || memory.memoryType}
                </span>
                <span style={{ padding: '2px 8px', backgroundColor: 'var(--bg-input)', borderRadius: '4px' }}>
                  优先级: {memory.priority}
                </span>
                {memory.tags && typeof memory.tags === 'object' && 'source' in memory.tags && (
                  <span style={{ padding: '2px 8px', backgroundColor: 'var(--bg-input)', borderRadius: '4px' }}>
                    来源: {(memory.tags as Record<string, string>).source === 'auto-extract' ? '自动提取' : (memory.tags as Record<string, string>).source}
                  </span>
                )}
                <span style={{ marginLeft: 'auto' }}>
                  {new Date(memory.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}