import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logger } from '../utils/logger';
import { useContext } from 'react';
import { AuthContext } from '../main';
import { API_BASE_URL, setUserRaw, setToken } from '../utils/auth';

type AuthMode = 'login' | 'register';

export default function LoginPage() {
  const navigate = useNavigate();
  const authContext = useContext(AuthContext);
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const body = mode === 'register'
        ? { username, password, nickname }
        : { username, password };

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        let msg = '认证失败';
        try {
          const errData = await response.json();
          msg = errData.message || msg;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      const data = await response.json();

      if (data.token && data.user) {
        setToken(data.token);
        setUserRaw(JSON.stringify(data.user));

        authContext?.login();
        authContext?.checkAuth();

        setSuccess(mode === 'register' ? '注册成功，正在跳转...' : '欢迎回来，正在跳转...');

        window.setTimeout(() => {
          navigate('/', { replace: true });
        }, 0);
      } else {
        throw new Error('登录失败，未获取到token');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary)',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      zIndex: 9999
    }}>
      <div style={{
        background: 'var(--bg-secondary)',
        backdropFilter: 'blur(20px)',
        borderRadius: '20px',
        padding: '40px',
        width: '100%',
        maxWidth: '400px',
        boxShadow: 'var(--card-shadow)',
        transition: 'transform 0.3s ease'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{
            margin: '0 0 8px 0',
            fontSize: '24px',
            fontWeight: 'bold',
            color: 'var(--text-primary)'
          }}>
            {mode === 'login' ? '欢迎回来' : '创建你的专属陪伴'}
          </h1>
          <p style={{
            margin: 0,
            fontSize: '14px',
            color: 'var(--text-dim)'
          }}>
            有人在这里等你
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '500',
              color: 'var(--text-secondary)'
            }}>
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="请输入用户名"
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid var(--border-input)',
                borderRadius: '12px',
                fontSize: '14px',
                boxSizing: 'border-box',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-input)';
              }}
            />
          </div>

          <div>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '500',
              color: 'var(--text-secondary)'
            }}>
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid var(--border-input)',
                borderRadius: '12px',
                fontSize: '14px',
                boxSizing: 'border-box',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-input)';
              }}
            />
          </div>

          {mode === 'register' && (
            <div>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: 'var(--text-secondary)'
              }}>
                昵称
              </label>
              <input
                type="text"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                placeholder="请输入昵称"
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid var(--border-input)',
                  borderRadius: '12px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-input)';
                }}
              />
            </div>
          )}

          {error && (
            <div style={{
              padding: '10px 14px',
              background: 'var(--bg-input)',
              borderRadius: '8px',
              fontSize: '14px',
              color: 'var(--error)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'var(--error)',
                color: 'var(--bg-primary)',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                !
              </span>
              {error}
            </div>
          )}

          {success && (
            <div style={{
              padding: '10px 14px',
              background: 'var(--bg-input)',
              borderRadius: '8px',
              fontSize: '14px',
              color: 'var(--success)'
            }}>
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '14px',
              background: 'var(--accent)',
              color: 'var(--bg-primary)',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'all 0.2s',
              height: '48px'
            }}
          >
            {loading ? '处理中...' : (mode === 'login' ? '登录' : '创建账号')}
          </button>
        </form>

        <div style={{
          textAlign: 'center',
          marginTop: '24px',
          fontSize: '14px'
        }}>
          {mode === 'login' ? (
            <span style={{ color: 'var(--text-dim)' }}>
              还没有账号？
              <button
                type="button"
                onClick={() => setMode('register')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  textDecoration: 'underline',
                  marginLeft: '4px'
                }}
              >
                立即注册
              </button>
            </span>
          ) : (
            <span style={{ color: 'var(--text-dim)' }}>
              已有账号？
              <button
                type="button"
                onClick={() => setMode('login')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  textDecoration: 'underline',
                  marginLeft: '4px'
                }}
              >
                立即登录
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}