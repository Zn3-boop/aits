import { useContext, useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../main';
import { getUserRaw } from '../utils/auth';
import './Navbar.css';

type User = {
  id: string;
  username: string;
  nickname: string;
  avatar?: string;
};

const readStoredUser = (): User | null => {
  const stored = getUserRaw();
  if (!stored) return null;
  try {
    return JSON.parse(stored) as User;
  } catch {
    return null;
  }
};

export const Navbar = () => {
  const auth = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(readStoredUser);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setUser(readStoredUser());
    });
  }, [auth?.isAuthenticated]);

  const handleLogout = () => {
    auth?.logout();
    setShowDropdown(false);
    navigate('/login');
  };

  useEffect(() => {
    const handleClickOutside = () => setShowDropdown(false);
    if (showDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showDropdown]);

  const hasUser = !!getUserRaw();
  if (!auth?.isAuthenticated && !hasUser) return null;

  const links = [
    { to: '/', label: '角色中心' },
    { to: '/live2d', label: 'Live2D' },

    { to: '/ai-providers', label: 'AI 模型' },
    { to: '/memory', label: '记忆' },
    { to: '/settings', label: '设置' },
  ];

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/">AITS</Link>
      </div>

      <div className="navbar-links">
        {links.map(link => (
          <Link
            key={link.to}
            to={link.to}
            className={location.pathname === link.to ? 'active' : ''}
          >
            {link.label}
          </Link>
        ))}
      </div>

      <div className="navbar-user">
        <button
          className="user-button"
          onClick={(e) => {
            e.stopPropagation();
            setShowDropdown(!showDropdown);
          }}
        >
          <span className="user-avatar">
            {user?.avatar ? (
              <img src={user.avatar} alt="" />
            ) : (
              <span className="avatar-placeholder">
                {user?.nickname?.[0] ?? user?.username?.[0] ?? 'U'}
              </span>
            )}
          </span>
          <span className="user-name">{user?.nickname ?? user?.username ?? '用户'}</span>
          <span className="dropdown-arrow">▼</span>
        </button>
        {showDropdown && (
          <div className="user-dropdown">
            <Link to="/profile" onClick={() => setShowDropdown(false)}>个人信息</Link>
            <Link to="/settings" onClick={() => setShowDropdown(false)}>系统设置</Link>
            <button onClick={handleLogout}>退出登录</button>
          </div>
        )}
      </div>
    </nav>
  );
};