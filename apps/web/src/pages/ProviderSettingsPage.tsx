import { useEffect, useState } from 'react';
import { apiFetch } from '../utils/auth';

type Provider = {
  id: string;
  name: string;
  type: string;
  baseUrl: string | null;
  model: string;
  isDefault: boolean;
  isActive: boolean;
};

const TEMPLATES: Record<string, { name: string; baseUrl: string; model: string }> = {
  ollama: { name: '本地 Ollama', baseUrl: 'http://localhost:11434', model: 'qwen2.5:3b' },
  minimax: { name: 'MiniMax', baseUrl: 'https://api.minimax.chat', model: 'MiniMax-Text-01' },
  openai: { name: 'OpenAI 兼容', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  custom: { name: '自定义', baseUrl: '', model: '' },
};

export const ProviderSettingsPage = () => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editing, setEditing] = useState<Partial<Provider> & { type: string; apiKey?: string }>({ type: 'ollama' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/ai-providers');
      const data = await res.json();
      setProviders(data.providers || []);
    } catch (e) {
      setMessage({ type: 'error', text: '加载失败: ' + (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing.name || !editing.model) {
      setMessage({ type: 'error', text: '名称和模型不能为空' });
      return;
    }
    setSaving(true);
    try {
      const method = editing.id ? 'PUT' : 'POST';
      const url = editing.id ? `/api/providers/${editing.id}` : '/api/providers';
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(editing),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      setEditing({ type: 'ollama' });
      setMessage({ type: 'success', text: '保存成功' });
      await load();
    } catch (e) {
      setMessage({ type: 'error', text: '保存失败: ' + (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (id: string) => {
    try {
      await apiFetch(`/api/providers/${id}/default`, { method: 'POST' });
      await load();
      setMessage({ type: 'success', text: '已切换默认模型，下次聊天生效' });
    } catch (e) {
      setMessage({ type: 'error', text: '切换失败: ' + (e as Error).message });
    }
  };

  const remove = async (id: string) => {
    if (!confirm('确定删除？')) return;
    try {
      await apiFetch(`/api/providers/${id}`, { method: 'DELETE' });
      await load();
      setMessage({ type: 'success', text: '删除成功' });
    } catch (e) {
      setMessage({ type: 'error', text: '删除失败: ' + (e as Error).message });
    }
  };

  const applyTemplate = (type: string) => {
    const t = TEMPLATES[type];
    if (t) {
      setEditing(prev => ({
        ...prev,
        type,
        name: t.name,
        baseUrl: t.baseUrl,
        model: t.model,
      }));
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      ollama: '🤖 Ollama (本地)',
      minimax: '🌐 MiniMax',
      openai: '🔮 OpenAI 兼容',
      custom: '⚙️ 自定义',
    };
    return labels[type] || type;
  };

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto', color: 'var(--text-primary)' }}>
      <h1 style={{ marginBottom: 8 }}>🤖 AI 模型配置</h1>
      <p style={{ color: 'var(--text-dim)', marginBottom: 24 }}>
        配置不同的 AI 后端，设为默认即可切换整个系统使用的模型。<b>所有角色共用此配置。</b>
      </p>

      {message && (
        <div style={{
          padding: '10px 16px',
          borderRadius: 8,
          marginBottom: 16,
          background: message.type === 'success' ? 'rgba(47,143,84,0.1)' : 'rgba(177,75,75,0.1)',
          color: message.type === 'success' ? 'var(--success)' : 'var(--error)',
          fontSize: 14
        }}>
          {message.text}
        </div>
      )}

      {/* 表单 */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: 20,
        marginBottom: 24
      }}>
        <h3 style={{ marginTop: 0 }}>
          {editing.id ? '✏️ 编辑 Provider' : '➕ 添加新 Provider'}
        </h3>

        <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)', marginBottom: 4 }}>
              类型模板
            </label>
            <select
              value={editing.type || 'ollama'}
              onChange={e => applyTemplate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border-input)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 14
              }}
            >
              <option value="ollama">🤖 Ollama (本地)</option>
              <option value="minimax">🌐 MiniMax</option>
              <option value="openai">🔮 OpenAI 兼容格式</option>
              <option value="custom">⚙️ 自定义</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)', marginBottom: 4 }}>
              显示名称 *
            </label>
            <input
              value={editing.name || ''}
              onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
              placeholder="例如：本地 Ollama"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border-input)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)', marginBottom: 4 }}>
              Base URL
            </label>
            <input
              value={editing.baseUrl || ''}
              onChange={e => setEditing(p => ({ ...p, baseUrl: e.target.value }))}
              placeholder={TEMPLATES[editing.type || 'ollama']?.baseUrl || 'http://localhost:11434'}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border-input)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)', marginBottom: 4 }}>
              API Key（可选）
            </label>
            <input
              type="password"
              value={editing.apiKey || ''}
              onChange={e => setEditing(p => ({ ...p, apiKey: e.target.value }))}
              placeholder="留空则不使用认证"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border-input)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)', marginBottom: 4 }}>
              模型名称 *
            </label>
            <input
              value={editing.model || ''}
              onChange={e => setEditing(p => ({ ...p, model: e.target.value }))}
              placeholder={TEMPLATES[editing.type || 'ollama']?.model || 'qwen2.5:3b'}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border-input)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={save}
            disabled={saving}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--bg-primary)',
              cursor: 'pointer',
              fontSize: 14
            }}
          >
            {saving ? '保存中...' : (editing.id ? '更新' : '添加')}
          </button>
          {editing.id && (
            <button
              onClick={() => setEditing({ type: 'ollama' })}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: '1px solid var(--border-input)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: 14
              }}
            >
              取消编辑
            </button>
          )}
        </div>
      </div>

      {/* 列表 */}
      <div style={{ display: 'grid', gap: 12 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 40 }}>
            加载中...
          </div>
        ) : providers.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 40 }}>
            还没有配置任何模型，请添加一个 Provider
            <br />
            <small>系统会回退到环境变量中的默认配置</small>
          </div>
        ) : (
          providers.map(p => (
            <div
              key={p.id}
              style={{
                border: p.isDefault ? '2px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: 12,
                padding: 16,
                background: p.isDefault ? 'var(--bg-secondary)' : 'var(--bg-input)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                opacity: p.isActive ? 1 : 0.5
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                  {p.name}
                  {p.isDefault && (
                    <span style={{
                      marginLeft: 8,
                      padding: '2px 8px',
                      borderRadius: 10,
                      background: 'var(--accent)',
                      color: 'var(--bg-primary)',
                      fontSize: 11
                    }}>
                      当前默认
                    </span>
                  )}
                  {!p.isActive && (
                    <span style={{
                      marginLeft: 8,
                      padding: '2px 8px',
                      borderRadius: 10,
                      background: 'var(--text-dim)',
                      color: 'var(--bg-primary)',
                      fontSize: 11
                    }}>
                      已禁用
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                  {getTypeLabel(p.type)} · {p.model} · {p.baseUrl || '无 URL'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!p.isDefault && p.isActive && (
                  <button
                    onClick={() => setDefault(p.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: '1px solid var(--accent)',
                      background: 'transparent',
                      color: 'var(--accent)',
                      cursor: 'pointer',
                      fontSize: 13
                    }}
                  >
                    设为默认
                  </button>
                )}
                <button
                  onClick={() => setEditing(p)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border-input)',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: 13
                  }}
                >
                  编辑
                </button>
                <button
                  onClick={() => remove(p.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--border-input)',
                    background: 'transparent',
                    color: 'var(--error)',
                    cursor: 'pointer',
                    fontSize: 13
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 帮助说明 */}
      <div style={{
        marginTop: 24,
        padding: 16,
        background: 'var(--bg-input)',
        borderRadius: 12,
        fontSize: 13,
        color: 'var(--text-dim)'
      }}>
        <h4 style={{ margin: '0 0 8px 0' }}>💡 配置说明</h4>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li><b>Ollama</b>：本地部署，推荐用于开发测试，模型需提前下载</li>
          <li><b>MiniMax</b>：需要申请 API Key，国内可用</li>
          <li><b>OpenAI 兼容</b>：支持 OpenAI 格式 API，包括 Azure、Claude 等</li>
          <li>设为默认后，所有角色聊天都会使用该模型</li>
        </ul>
      </div>
    </div>
  );
};