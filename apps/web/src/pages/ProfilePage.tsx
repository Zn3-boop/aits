import { useState, useContext } from 'react';
import { AuthContext } from '../main';
import { apiFetch, parseApiError, readJsonStorage, setUserRaw } from '../utils/auth';
import './ProfilePage.css';

type ProfileUser = {
  nickname?: string;
  username?: string;
  avatar?: string;
};

const readStoredProfileUser = (): ProfileUser => readJsonStorage<ProfileUser>('user', {});

const readStoredNickname = () => {
  const storedUser = readStoredProfileUser();
  return storedUser.nickname || storedUser.username || '';
};

export const ProfilePage = () => {
  const { logout } = useContext(AuthContext)!;
  const [user] = useState<ProfileUser>(readStoredProfileUser);
  const [nickname, setNickname] = useState(readStoredNickname);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const updateProfile = async () => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch('/api/users/me', {
        method: 'PUT',
        body: JSON.stringify({ nickname, username: user.username }),
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      const data = await response.json();
      setUserRaw(JSON.stringify(data.user));
      setMessage('个人信息已更新');
    } catch (err) {
      // 如果是认证错误，则登出用户并重定向到登录页
      if (err instanceof Error && err.message.includes('登录已过期')) {
        logout();
        window.location.href = '/login';
        return;
      }
      setError(err instanceof Error ? err.message : '更新失败');
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async () => {
    if (!oldPassword || !newPassword) {
      setError('请填写旧密码和新密码');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch('/api/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      if (!response.ok) throw new Error(await parseApiError(response));
      setMessage('密码修改成功');
      setOldPassword('');
      setNewPassword('');
    } catch (err) {
      // 如果是认证错误，则登出用户并重定向到登录页
      if (err instanceof Error && err.message.includes('登录已过期')) {
        logout();
        window.location.href = '/login';
        return;
      }
      setError(err instanceof Error ? err.message : '密码修改失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="profile-page">
      <div className="hero-panel">
        <p className="eyebrow">PROFILE</p>
        <h1>个人中心</h1>
        <p className="description">管理你的个人信息和账号安全。</p>
      </div>

      <section className="profile-layout">
        <article className="status-card profile-panel">
          <div className="profile-header">
            <div className="profile-avatar">
              {user.avatar ? (
                <img src={user.avatar} alt="" />
              ) : (
                <span className="avatar-placeholder">
                  {(user.nickname || user.username || 'U')[0]}
                </span>
              )}
            </div>
            <div>
              <h3>{user.nickname || user.username || '用户'}</h3>
              <p className="username">@{user.username}</p>
            </div>
          </div>

          <div className="profile-form">
            <div className="form-group">
              <label>昵称</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="输入昵称..."
              />
            </div>
            <button className="primary-button" onClick={updateProfile} disabled={loading}>
              {loading ? '保存中...' : '保存资料'}
            </button>
          </div>
        </article>

        <aside className="status-card profile-side-panel">
          <h3>修改密码</h3>
          <div className="profile-form">
            <div className="form-group">
              <label>旧密码</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="输入旧密码"
              />
            </div>
            <div className="form-group">
              <label>新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="输入新密码（至少6位）"
              />
            </div>
            <button className="primary-button" onClick={changePassword} disabled={loading}>
              {loading ? '修改中...' : '修改密码'}
            </button>
          </div>
          {message && <p className="success-text">{message}</p>}
          {error && <p className="error-text">{error}</p>}
        </aside>
      </section>
    </section>
  );
};