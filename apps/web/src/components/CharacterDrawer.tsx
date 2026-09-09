import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../main';
import { apiFetch } from '../utils/auth';
import './CharacterDrawer.css';

export interface Persona {
  id: string;
  name: string;
  subtitle: string;
  description?: string;
  systemPrompt?: string;
  avatar?: string;
  accent?: string;
  voiceModelId?: string | null;
}

interface Props {
  persona: Persona | null;
  open: boolean;
  onClose: () => void;
  onSave: (p: Persona) => Promise<void>;
  onStartChat: (p: Persona) => void;
}

export const CharacterDrawer = ({ persona, open, onClose, onSave, onStartChat }: Props) => {
  const { logout } = useContext(AuthContext)!;
  const [form, setForm] = useState<Persona | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (persona) setForm({ ...persona });
  }, [persona]);

  if (!open || !form) return null;

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setError(undefined);
    try {
      const res = await apiFetch(`/api/personas/${form.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: form.name,
          subtitle: form.subtitle,
          description: form.description,
          systemPrompt: form.systemPrompt,
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: '保存失败' }));
        throw new Error(err.message);
      }
      await onSave(form);
      onClose();
    } catch (err) {
      // 如果是认证错误，则登出用户并重定向到登录页
      if (err instanceof Error && err.message.includes('登录已过期')) {
        logout();
        window.location.href = '/login';
        return;
      }
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>查看/编辑角色</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="drawer-body">
          <label>名称</label>
          <input
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="角色名"
          />

          <label>简介</label>
          <textarea
            value={form.subtitle}
            onChange={e => setForm({ ...form, subtitle: e.target.value })}
            placeholder="一句话介绍"
            rows={2}
          />

          <label>详细描述</label>
          <textarea
            value={form.description || ''}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="详细描述（可选）"
            rows={3}
          />

          <label>System Prompt（人格设定）</label>
          <textarea
            value={form.systemPrompt || ''}
            onChange={e => setForm({ ...form, systemPrompt: e.target.value })}
            placeholder="输入角色的性格、语气、背景设定..."
            rows={8}
            style={{ fontSize: 13, lineHeight: 1.6 }}
          />

          {error && <div className="drawer-error">{error}</div>}
        </div>

        <div className="drawer-footer">
          <button className="btn-secondary" onClick={() => onStartChat(form)}>
            💬 开始聊天
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '💾 保存修改'}
          </button>
        </div>
      </div>
    </div>
  );
};