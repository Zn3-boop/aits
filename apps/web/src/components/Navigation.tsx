type NavigationProps = {
  currentPage: string;
  onPageChange: (page: string) => void;
};

export const Navigation = ({ currentPage, onPageChange }: NavigationProps) => {
  const menuItems = [
    { id: 'chat', label: '聊天', icon: '💬' },
    { id: 'memory', label: '记忆', icon: '🧠' },
    { id: 'voice', label: '语音', icon: '🎤' },
    { id: 'live2d', label: 'Live2D', icon: '🎭' },
    { id: 'persona', label: '角色', icon: '👤' },
    { id: 'settings', label: '设置', icon: '⚙️' }
  ];

  return (
    <nav className="navigation">
      <div className="nav-container">
        <div className="nav-brand">
          <span className="brand-icon">✨</span>
          <span className="brand-text">LPM AI</span>
        </div>
        <div className="nav-menu">
          {menuItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => onPageChange(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
};