import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Persona } from '../types/index';
import { apiFetch, parseApiError } from '../utils/auth';
import { logger } from '../utils/logger';
import './PersonasPage.css';

export const PersonasPage = () => {
  const navigate = useNavigate();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    subtitle: '',
    description: '',
    speakingStyle: '',
    systemPrompt: '',
    modelKey: ''
  });

  const [isCreating, setIsCreating] = useState(false);

  const loadPersonas = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/personas');

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      const data = (await res.json()) as { personas: Persona[] };
      setPersonas(data.personas || []);
    } catch (error) {
      logger.error('加载角色列表失败:', error);
      setShowToast({ message: '加载失败，请重试', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadPersonas();
    });
  }, [loadPersonas]);

  const handleCreate = async () => {
    if (!formData.name?.trim() || !formData.description?.trim() || !formData.systemPrompt?.trim() || !formData.modelKey?.trim()) {
      setShowToast({ message: '请填写所有必填项', type: 'error' });
      return;
    }

    setIsCreating(true);
    try {
      const res = await apiFetch('/api/personas', {
        method: 'POST',
      body: JSON.stringify({
        ...formData,
        avatar: null,      // 不要传首字母，让后端默认 null
        accent: 'var(--accent)',
        isSystem: false,
        extensible: true
      })
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      setShowToast({ message: '创建成功', type: 'success' });
      setShowCreateModal(false);
      setFormData({
        name: '',
        subtitle: '',
        description: '',
        speakingStyle: '',
        systemPrompt: '',
        modelKey: ''
      });
      void loadPersonas();
    } catch (error: unknown) {
      setShowToast({ message: error instanceof Error ? error.message : '创建失败', type: 'error' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个角色吗？此操作不可恢复。')) {
      return;
    }

    try {
      const res = await apiFetch(`/api/personas/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }

      setShowToast({ message: '删除成功', type: 'success' });
      void loadPersonas();
    } catch (error) {
      logger.error('删除角色失败:', error);
      setShowToast({ message: '删除失败，请重试', type: 'error' });
    }
  };

  const handleUnbindModel = async (id: string) => {
    if (!confirm('确定要解绑该角色的 Live2D 模型吗？角色本身不会被删除。')) {
      return;
    }
    try {
      const res = await apiFetch(`/api/personas/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ modelPath: null }),
      });
      if (!res.ok) {
        throw new Error(await parseApiError(res));
      }
      setShowToast({ message: '已解绑模型', type: 'success' });
      void loadPersonas();
    } catch (error) {
      logger.error('解绑模型失败:', error);
      setShowToast({ message: '解绑失败，请重试', type: 'error' });
    }
  };

  if (isLoading) {
    return (
      <div className="personas-page">
        <div className="loading-state">
          <div className="skeleton-card" />
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      </div>
    );
  }

  return (
    <div className="personas-page">
      <div className="page-header">
        <h1>角色管理</h1>
        <button className="create-button" onClick={() => setShowCreateModal(true)}>
          + 新建角色
        </button>
      </div>

      <div className="personas-grid">
        {personas.map((persona) => (
          <div key={persona.id} className="persona-card">
            <div 
              className="persona-avatar"
              style={{ background: `linear-gradient(135deg, ${persona.accent}, var(--accent-secondary))` }}
            >
              {persona.avatar || persona.name?.charAt(0) || '?'}
            </div>
            <h3>{persona.name}</h3>
            <p className="subtitle">{persona.subtitle}</p>
            <p className="description">{persona.description}</p>
            <div className="card-actions">
              <button 
                className="view-button"
                onClick={() => navigate(`/personas/${persona.id}`)}
              >
                查看详情
              </button>
              {persona.modelPath && persona.modelPath !== '' && (
                <button 
                  className="unbind-button"
                  onClick={() => handleUnbindModel(persona.id)}
                  title="移除 Live2D 模型绑定"
                >
                  解绑模型
                </button>
              )}
              {persona.extensible && (
                <button 
                  className="delete-button"
                  onClick={() => handleDelete(persona.id)}
                >
                  删除
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>新建角色</h2>
            <div className="form-field">
              <label>角色名称 *</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="输入角色名称"
              />
            </div>
            <div className="form-field">
              <label>一句话定位</label>
              <input
                type="text"
                value={formData.subtitle}
                onChange={e => setFormData(prev => ({ ...prev, subtitle: e.target.value }))}
                placeholder="用一句话描述这个角色"
              />
            </div>
            <div className="form-field">
              <label>性格描述 *</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="详细描述角色的性格特点"
                rows={4}
              />
            </div>
            <div className="form-field">
              <label>说话风格</label>
              <textarea
                value={formData.speakingStyle}
                onChange={e => setFormData(prev => ({ ...prev, speakingStyle: e.target.value }))}
                placeholder="描述角色的说话方式和语气"
                rows={3}
              />
            </div>
            <div className="form-field">
              <label>系统提示词 *</label>
              <textarea
                value={formData.systemPrompt}
                onChange={e => setFormData(prev => ({ ...prev, systemPrompt: e.target.value }))}
                placeholder="输入系统提示词，定义角色的行为和回应方式"
                rows={6}
              />
            </div>
            <div className="form-field">
              <label>选择模型 *</label>
              <select
                value={formData.modelKey}
                onChange={e => setFormData(prev => ({ ...prev, modelKey: e.target.value }))}
              >
                <option value="">请选择模型</option>
                <option value="hibiki">Hibiki</option>
                <option value="rin">Rin</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="cancel-button" onClick={() => setShowCreateModal(false)}>
                取消
              </button>
              <button 
                className="confirm-button" 
                onClick={handleCreate}
                disabled={isCreating}
              >
                {isCreating ? '创建中...' : '确认创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showToast && (
        <div className={`toast ${showToast.type}`}>
          {showToast.message}
        </div>
      )}
    </div>
  );
};