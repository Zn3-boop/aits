import { useState, useEffect } from 'react';
import { apiFetch, parseApiError } from '../utils/auth';

type ProviderType = 'ollama' | 'openai' | 'anthropic' | 'minimax' | 'custom';

type AiProvider = {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type ProviderFormData = {
  name: string;
  type: ProviderType;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  isDefault: boolean;
};

const PROVIDER_TEMPLATES: Record<string, Partial<ProviderFormData>> = {
  ollama: {
    name: 'Ollama 本地',
    type: 'ollama',
    baseUrl: 'http://localhost:11434/api',
    model: 'qwen2.5:1.5b',
  },
  openai: {
    name: 'OpenAI',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-3.5-turbo',
  },
  anthropic: {
    name: 'Anthropic Claude',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-haiku-20240307',
  },
  minimax: {
    name: 'MiniMax',
    type: 'minimax',
    baseUrl: 'https://api.minimax.chat/v1',
    model: 'abab5.5-chat',
  },
};

export const AiProvidersPage = () => {
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AiProvider | null>(null);
  const [formData, setFormData] = useState<ProviderFormData>({
    name: '',
    type: 'ollama',
    baseUrl: '',
    apiKey: '',
    model: '',
    isDefault: false,
  });
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      const res = await apiFetch('/api/ai-providers');
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSelect = (type: string) => {
    const template = PROVIDER_TEMPLATES[type];
    if (template) {
      setFormData({
        ...formData,
        ...template,
        type: type as ProviderType,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setSuccess(undefined);

    try {
      const url = editingProvider
        ? `/api/ai-providers/${editingProvider.id}`
        : '/api/ai-providers';
      const method = editingProvider ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      setSuccess(editingProvider ? 'Provider 已更新' : 'Provider 已创建');
      setShowForm(false);
      setEditingProvider(null);
      setFormData({
        name: '',
        type: 'ollama',
        baseUrl: '',
        apiKey: '',
        model: '',
        isDefault: false,
      });
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const handleEdit = (provider: AiProvider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl || '',
      apiKey: provider.apiKey || '',
      model: provider.model,
      isDefault: provider.isDefault,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这个 Provider 吗？')) return;

    try {
      const res = await apiFetch(`/api/ai-providers/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      setSuccess('Provider 已删除');
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await apiFetch(`/api/ai-providers/${id}/set-default`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      setSuccess('默认 Provider 已更新');
      await loadProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置失败');
    }
  };

  if (loading) {
    return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)' }}>加载中...</div>;
  }

  return (
    <section style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, color: 'var(--text-primary)' }}>🤖 AI Provider 管理</h1>
        <p style={{ margin: '8px 0 0', color: 'var(--text-dim)' }}>
          配置多个 AI 模型提供商，为不同角色分配不同的模型
        </p>
      </div>

      {error && (
        <div style={{
          padding: 12,
          marginBottom: 16,
          background: 'var(--bg-input)',
          border: '1px solid var(--error)',
          borderRadius: 8,
          color: 'var(--error)'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: 12,
          marginBottom: 16,
          background: 'var(--bg-input)',
          border: '1px solid var(--success)',
          borderRadius: 8,
          color: 'var(--success)'
        }}>
          {success}
        </div>
      )}

      <button
        onClick={() => {
          setEditingProvider(null);
          setFormData({
            name: '',
            type: 'ollama',
            baseUrl: '',
            apiKey: '',
            model: '',
            isDefault: false,
          });
          setShowForm(true);
        }}
        style={{
          padding: '10px 20px',
          background: 'var(--accent)',
          color: 'var(--bg-primary)',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          marginBottom: 20,
          fontWeight: 600,
        }}
      >
        + 添加 Provider
      </button>

      {showForm && (
        <div style={{
          padding: 20,
          marginBottom: 20,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
        }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text-primary)' }}>
            {editingProvider ? '编辑 Provider' : '添加 Provider'}
          </h3>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--text-secondary)' }}>
                快速模板
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.keys(PROVIDER_TEMPLATES).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleTemplateSelect(type)}
                    style={{
                      padding: '6px 12px',
                      background: formData.type === type ? 'var(--accent)' : 'var(--bg-input)',
                      color: formData.type === type ? 'var(--bg-primary)' : 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    {type.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--text-secondary)' }}>
                名称 *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: 10,
                  border: '1px solid var(--border-input)',
                  borderRadius: 8,
                  fontSize: 14,
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--text-secondary)' }}>
                类型 *
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as ProviderType })}
                style={{
                  width: '100%',
                  padding: 10,
                  border: '1px solid var(--border-input)',
                  borderRadius: 8,
                  fontSize: 14,
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="ollama">Ollama</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="minimax">MiniMax</option>
                <option value="custom">自定义</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--text-secondary)' }}>
                Base URL
              </label>
              <input
                type="url"
                value={formData.baseUrl}
                onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                placeholder="https://api.example.com/v1"
                style={{
                  width: '100%',
                  padding: 10,
                  border: '1px solid var(--border-input)',
                  borderRadius: 8,
                  fontSize: 14,
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--text-secondary)' }}>
                API Key
              </label>
              <input
                type="password"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                placeholder="sk-..."
                style={{
                  width: '100%',
                  padding: 10,
                  border: '1px solid var(--border-input)',
                  borderRadius: 8,
                  fontSize: 14,
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--text-secondary)' }}>
                模型名称 *
              </label>
              <input
                type="text"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                required
                placeholder="gpt-3.5-turbo"
                style={{
                  width: '100%',
                  padding: 10,
                  border: '1px solid var(--border-input)',
                  borderRadius: 8,
                  fontSize: 14,
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                />
                <span>设为默认 Provider</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="submit"
                style={{
                  padding: '10px 20px',
                  background: 'var(--accent)',
                  color: 'var(--bg-primary)',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {editingProvider ? '更新' : '创建'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                style={{
                  padding: '10px 20px',
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {providers.length === 0 ? (
          <div style={{
            padding: 40,
            textAlign: 'center',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            color: 'var(--text-dim)'
          }}>
            暂无 Provider，点击上方按钮添加
          </div>
        ) : (
          providers.map(provider => (
            <div
              key={provider.id}
              style={{
                padding: 16,
                background: 'var(--bg-secondary)',
                border: provider.isDefault ? '2px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <strong style={{ fontSize: 16, color: 'var(--text-primary)' }}>{provider.name}</strong>
                  {provider.isDefault && (
                    <span style={{
                      padding: '2px 8px',
                      background: 'var(--accent)',
                      color: 'var(--bg-primary)',
                      borderRadius: 12,
                      fontSize: 11,
                    }}>
                      默认
                    </span>
                  )}
                  <span style={{
                    padding: '2px 8px',
                    background: 'var(--bg-input)',
                    color: 'var(--text-dim)',
                    borderRadius: 12,
                    fontSize: 11,
                  }}>
                    {provider.type.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                  模型: {provider.model}
                </div>
                {provider.baseUrl && (
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                    URL: {provider.baseUrl}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!provider.isDefault && (
                  <button
                    onClick={() => handleSetDefault(provider.id)}
                    style={{
                      padding: '6px 12px',
                      background: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    设为默认
                  </button>
                )}
                <button
                  onClick={() => handleEdit(provider)}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  编辑
                </button>
                <button
                  onClick={() => handleDelete(provider.id)}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--bg-input)',
                    color: 'var(--error)',
                    border: '1px solid var(--error)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
};