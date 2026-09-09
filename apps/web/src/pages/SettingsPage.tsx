import { useState, useEffect } from 'react';
import './SettingsPage.css';
import { apiFetch, parseApiError } from '../utils/auth';
import { storage } from '../utils/storage';

// ============================================================
// AI Provider Settings Types
// ============================================================

type AiProvider = {
  id: string;
  name: string;
  type: 'ollama' | 'minimax' | 'openai' | 'anthropic' | 'custom';
  baseUrl?: string;
  apiKey?: string;
  model: string;
  isDefault: boolean;
  isActive: boolean;
};

const PROVIDER_META: Record<string, { label: string; defaultBaseUrl: string; models: string[] }> = {
  ollama: {
    label: 'Ollama',
    defaultBaseUrl: 'http://localhost:11434/api',
    models: [],
  },
  minimax: {
    label: 'MiniMax',
    defaultBaseUrl: 'https://api.minimax.chat/v1',
    models: ['abab5.5-chat', 'abab6.5-chat', 'abab6.5s-chat'],
  },
  openai: {
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    models: ['gpt-3.5-turbo', 'gpt-4o', 'gpt-4o-mini'],
  },
  anthropic: {
    label: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229'],
  },
};

// ============================================================
// LLM Settings Panel Component
// ============================================================

export const LLMSettingsPanel = () => {
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [providerType, setProviderType] = useState<string>('ollama');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');

  // 1. 加载当前所有 Provider
  useEffect(() => {
    apiFetch('/api/ai-providers')
      .then(r => r.json())
      .then((d: { providers?: AiProvider[] }) => {
        const list = d.providers || [];
        setProviders(list);
        const def = list.find(p => p.isDefault);
        if (def) {
          setProviderType(def.type);
          setModel(def.model);
          setApiKey(def.apiKey || '');
          setBaseUrl(def.baseUrl || PROVIDER_META[def.type]?.defaultBaseUrl || '');
        }
      })
      .catch(() => { /* ignore - user may not be logged in */ });
  }, []);

  // 2. Ollama 动态拉取本地模型列表
  useEffect(() => {
    if (providerType === 'ollama') {
      apiFetch('/api/ai-models')
        .then(r => r.json())
        .then((d: { models?: Array<{ id: string; name: string; provider: string }> }) => {
          const names = (d.models || [])
            .filter(m => m.provider === 'ollama' && m.id !== 'default')
            .map(m => m.name);
          setOllamaModels(names);
          if (names.length && !names.includes(model)) {
            setModel(names[0]);
          }
        })
        .catch(() => setOllamaModels([]));
    }
  }, [providerType]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const meta = PROVIDER_META[providerType];
      const payload = {
        name: meta.label,
        type: providerType,
        model,
        baseUrl: baseUrl || meta.defaultBaseUrl,
        apiKey: apiKey || undefined,
        isDefault: true,
        isActive: true,
      };

      // 找同类型的现有 Provider
      const existing = providers.find(p => p.type === providerType);

      if (existing) {
        // 更新现有，设为默认
        const res = await apiFetch(`/api/ai-providers/${existing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...existing, ...payload }),
        });
        if (!res.ok) {
          throw new Error(await parseApiError(res));
        }
        // 把其他 Provider 的 isDefault 取消
        await Promise.all(
          providers
            .filter(p => p.id !== existing.id && p.isDefault)
            .map(p =>
              apiFetch(`/api/ai-providers/${p.id}`, {
                method: 'PUT',
                body: JSON.stringify({ ...p, isDefault: false }),
              })
            )
        );
      } else {
        // 新建，自动设为默认
        const res = await apiFetch('/api/ai-providers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          throw new Error(await parseApiError(res));
        }
      }

      setToast('模型配置已保存，下次对话立即生效');
      setTimeout(() => setToast(''), 3000);
    } catch (err) {
      setToast(err instanceof Error ? err.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const meta = PROVIDER_META[providerType];

  return (
    <div className="llm-settings-panel">
      <div className="form-field">
        <label>模型提供商</label>
        <select value={providerType} onChange={e => setProviderType(e.target.value)}>
          {Object.entries(PROVIDER_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label>模型名称</label>
        {providerType === 'ollama' ? (
          ollamaModels.length ? (
            <select value={model} onChange={e => setModel(e.target.value)}>
              {ollamaModels.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="qwen2.5:1.5b"
            />
          )
        ) : (
          <select value={model} onChange={e => setModel(e.target.value)}>
            {meta.models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
      </div>

      {providerType !== 'ollama' && (
        <div className="form-field">
          <label>API Key {providerType === 'minimax' && '(可选，若后端已配置)'}</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-..."
          />
        </div>
      )}

      <div className="form-field">
        <label>Base URL</label>
        <input
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          placeholder={meta.defaultBaseUrl}
        />
      </div>

      <button className="primary-button" onClick={handleSave} disabled={loading}>
        {loading ? '保存中...' : '保存并切换'}
      </button>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
};

// ============================================================
// Original Settings Types
// ============================================================

type Settings = {
  apiUrl: string;
  wsUrl: string;
  modelProvider: string;
  modelName: string;
  theme: 'light' | 'dark' | 'auto';
  language: 'zh-CN' | 'en-US';
  notifications: boolean;
  autoScroll: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  apiUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  wsUrl: import.meta.env.VITE_WS_BASE_URL ?? 'ws://localhost:8787',
  modelProvider: 'ollama',
  modelName: 'qwen2.5:7b',
  theme: 'dark',
  language: 'zh-CN',
  notifications: true,
  autoScroll: true
};

const readStoredSettings = (): Settings => {
  return storage.getItem<Settings>(storage.KEYS.SETTINGS, DEFAULT_SETTINGS);
};

export const SettingsPage = () => {
  const [settings, setSettings] = useState<Settings>(readStoredSettings);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const handleChange = (field: keyof Settings, value: string | boolean) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const applyTheme = (theme: 'light' | 'dark' | 'auto') => {
    const root = document.documentElement;
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', theme);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError(undefined);
    try {
      // 保存本地设置
      storage.setItem(storage.KEYS.SETTINGS, settings);
      // 应用主题
      applyTheme(settings.theme);
      await new Promise((resolve) => setTimeout(resolve, 500));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    setSaved(false);
  };

  return (
    <section className="settings-page">
      <div className="hero-panel">
        <p className="eyebrow">SETTINGS</p>
        <h1>系统设置</h1>
        <p className="description">
          配置系统参数，包括 API 地址、模型设置、界面主题等。
        </p>
      </div>

      <section className="settings-layout">
        <article className="status-card settings-panel">
          <div className="settings-panel-header">
            <div>
              <span className="badge">CONFIGURE</span>
              <h3>系统配置</h3>
            </div>
          </div>

          <div className="settings-form">
            <div className="settings-section">
              <h4>API 配置</h4>
              <div className="form-group">
                <label>API 地址</label>
                <input
                  type="text"
                  value={settings.apiUrl}
                  onChange={(e) => handleChange('apiUrl', e.target.value)}
                  placeholder="http://localhost:8787"
                />
              </div>
              <div className="form-group">
                <label>WebSocket 地址</label>
                <input
                  type="text"
                  value={settings.wsUrl}
                  onChange={(e) => handleChange('wsUrl', e.target.value)}
                  placeholder="ws://localhost:8787"
                />
              </div>
            </div>

            <div className="settings-section">
              <h4>AI 模型配置</h4>
              <p className="section-hint">通过 API 保存模型配置到数据库，每次对话实时生效</p>
              <LLMSettingsPanel />
            </div>

            {/* 界面设置 - 暂未实现
            <div className="settings-section">
              <h4>界面设置</h4>
              <div className="form-group">
                <label>主题</label>
                <select
                  value={settings.theme}
                  onChange={(e) => handleChange('theme', e.target.value)}
                >
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                  <option value="auto">自动</option>
                </select>
              </div>
              <div className="form-group">
                <label>语言</label>
                <select
                  value={settings.language}
                  onChange={(e) => handleChange('language', e.target.value)}
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="en-US">English</option>
                </select>
              </div>
            </div>

            <div className="settings-section">
              <h4>功能设置</h4>
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.notifications}
                    onChange={(e) => handleChange('notifications', e.target.checked)}
                  />
                  <span>启用通知</span>
                </label>
              </div>
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.autoScroll}
                    onChange={(e) => handleChange('autoScroll', e.target.checked)}
                  />
                  <span>自动滚动</span>
                </label>
              </div>
            </div>
            */}

            <div className="form-actions">
              <button className="secondary-button" onClick={handleReset} disabled={loading}>
                重置
              </button>
              <button className="primary-button" onClick={handleSave} disabled={loading}>
                {loading ? '保存中...' : '保存设置'}
              </button>
            </div>

            {error && <p className="error-text">{error}</p>}
            {saved && <p className="success-text">✓ 设置已保存</p>}
          </div>
        </article>

        <aside className="status-card settings-side-panel">
          <span className="badge">INFO</span>
          <h3>设置说明</h3>
          <div className="settings-info">
            <div className="info-item">
              <h4>API 配置</h4>
              <p>配置后端 API 和 WebSocket 服务器地址。修改后需要刷新页面生效。</p>
            </div>
            <div className="info-item">
              <h4>模型设置</h4>
              <p>选择 AI 模型提供商和模型名称。不同提供商可能需要不同的配置。</p>
            </div>
            <div className="info-item">
              <h4>界面设置</h4>
              <p>自定义界面主题和语言。主题设置为"自动"时将跟随系统主题。</p>
            </div>
            <div className="info-item">
              <h4>功能设置</h4>
              <p>控制通知和自动滚动等功能的开关。</p>
            </div>
          </div>

          <div className="settings-status">
            <h4>当前状态</h4>
            <ul>
              <li>API: {settings.apiUrl}</li>
              <li>WebSocket: {settings.wsUrl}</li>
              <li>模型: {settings.modelProvider} / {settings.modelName}</li>
              <li>主题: {settings.theme}</li>
              <li>语言: {settings.language}</li>
            </ul>
          </div>
        </aside>
      </section>
    </section>
  );
};