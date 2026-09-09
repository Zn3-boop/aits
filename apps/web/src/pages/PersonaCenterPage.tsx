/**
 * 角色中心页面
 * 
 * 功能：
 * 1. 展示所有角色卡片
 * 2. 点击卡片跳转到聊天页面
 */

import { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../main';
import { apiFetch } from '../utils/auth';
import { logger } from '../utils/logger';

interface Persona {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  subtitle?: string;
  accent?: string;
  isSystem?: boolean;
  modelPath?: string;
}

export function PersonaCenterPage() {
  const navigate = useNavigate();
  const { logout } = useContext(AuthContext)!;
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPersonas = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/personas');
      if (res.ok) {
        const data = await res.json();
        const list = data.personas || data.data || [];
        setPersonas(Array.isArray(list) ? list : []);
      } else {
        logger.error('加载角色列表失败:', res.status);
      }
    } catch (error) {
      logger.error('加载角色列表失败:', error);
      if (error instanceof Error && error.message.includes('登录已过期')) {
        logout();
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [logout, navigate]);

  useEffect(() => {
    void loadPersonas();
  }, [loadPersonas]);

  const getInitial = (name: string) => name.charAt(0) || '?';

  return (
    <div style={{
      padding: '40px',
      maxWidth: '1200px',
      margin: '0 auto',
      minHeight: 'calc(100vh - 60px)'
    }}>
      <div style={{
        marginBottom: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <h1 style={{
            margin: 0,
            fontSize: '28px',
            fontWeight: 'bold',
            color: 'var(--accent)'
          }}>
            角色中心
          </h1>
          <p style={{
            margin: '8px 0 0 0',
            color: 'var(--text-dim)',
            fontSize: '14px'
          }}>
            选择一个角色开始对话
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{
          textAlign: 'center',
          padding: '60px',
          color: 'var(--text-dim)'
        }}>
          加载中...
        </div>
      ) : personas.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px',
          color: 'var(--text-dim)'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎭</div>
          <p>暂无角色，请先创建角色</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '20px'
        }}>
          {personas.map(persona => (
            <div
              key={persona.id}
              onClick={() => navigate(`/personas/${persona.id}`)}
              style={{
                padding: '24px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.transform = 'translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: persona.accent || 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                fontWeight: 'bold',
                color: '#020617',
                marginBottom: '16px'
              }}>
                {getInitial(persona.name)}
              </div>
              <h3 style={{
                margin: '0 0 8px 0',
                fontSize: '18px',
                fontWeight: 'bold',
                color: 'var(--text-primary)'
              }}>
                {persona.name}
              </h3>
              {persona.subtitle && (
                <p style={{
                  margin: '0 0 8px 0',
                  fontSize: '13px',
                  color: 'var(--accent)'
                }}>
                  {persona.subtitle}
                </p>
              )}
              <p style={{
                margin: 0,
                fontSize: '14px',
                color: 'var(--text-dim)',
                lineHeight: '1.5',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}>
                {persona.description || '暂无描述'}
              </p>
              {persona.modelPath && (
                <div style={{
                  marginTop: '12px',
                  padding: '4px 10px',
                  background: 'var(--bg-input)',
                  borderRadius: '12px',
                  fontSize: '12px',
                  color: 'var(--text-dim)',
                  display: 'inline-block'
                }}>
                  🎭 已绑定 Live2D
                </div>
              )}
              <div style={{
                marginTop: '16px',
                padding: '10px',
                background: 'var(--accent)',
                color: '#020617',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 'bold',
                textAlign: 'center'
              }}>
                开始聊天 →
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
