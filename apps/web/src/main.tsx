import { useEffect, useState, createContext, useContext, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';

import LoginPage from './pages/LoginPage';
import { PersonaCenterPage } from './pages/PersonaCenterPage';
import { PersonaDetailPage } from './pages/PersonaDetailPage';
import { Live2DPage } from './pages/Live2DPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import MemoryPage from './pages/MemoryPage';
import { Navbar } from './components/Navbar';
import { ChatProvider } from './contexts/ChatContext';
import { AiProvidersPage } from './pages/AiProvidersPage';
import { AppProvider } from './contexts/AppContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { getUserRaw, clearAuth, checkAuthAsync } from './utils/auth';
import { logger } from './utils/logger';
import { storage } from './utils/storage';

// ============================================================
// 启动时应用保存的主题设置
// ============================================================
const applyStoredTheme = () => {
  try {
    const settings = storage.getItem<{ theme?: string }>(storage.KEYS.SETTINGS, { theme: 'dark' });
    const theme = settings?.theme || 'dark';
    const root = document.documentElement;
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', theme);
    }
  } catch (e) {
    console.warn('Failed to apply theme:', e);
  }
};
applyStoredTheme();

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const error = event.error;
    if (error) {
      const errorMsg = error.message || '';
      if (errorMsg.includes('Cubism 4 runtime') ||
          errorMsg.includes('pixi-live2d')) {
        logger.warn('[Global Error Handler] Suppressed Live2D error:', errorMsg);
        event.preventDefault();
        return;
      }
    }
    logger.error('[Global Error]', event.error);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason;
    if (error) {
      const errorMsg = error.message || '';
      if (errorMsg.includes('Cubism 4 runtime')) {
        logger.warn('[Global Error Handler] Suppressed Live2D promise error:', errorMsg);
        event.preventDefault();
        return;
      }
    }
    logger.error('[Unhandled Promise Rejection]', event.reason);
  });
}

const AuthContext = createContext<{
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  checkAuth: () => boolean;
}>({
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
  checkAuth: () => false,
});

export { AuthContext };

const readAuthState = () => {
  const user = getUserRaw();
  return !!user;
};

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(readAuthState);

  const checkAuth = useCallback(() => {
    const isAuth = readAuthState();
    setIsAuthenticated(isAuth);
    return isAuth;
  }, []);

  const login = useCallback(() => setIsAuthenticated(true), []);
  const logout = useCallback(() => {
    clearAuth();
    setIsAuthenticated(false);
  }, []);

  useEffect(() => {
    checkAuthAsync().then(isAuth => {
      if (isAuth !== readAuthState()) {
        setIsAuthenticated(isAuth);
      }
    });
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

function LayoutWithNavbar({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <div style={{ marginTop: 60, height: 'calc(100vh - 60px)', overflow: 'auto' }}>
        {children}
      </div>
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<LayoutWithNavbar><PersonaCenterPage /></LayoutWithNavbar>} />
      <Route path="/personas" element={<LayoutWithNavbar><PersonaCenterPage /></LayoutWithNavbar>} />
      <Route path="/personas/:id" element={<LayoutWithNavbar><PersonaDetailPage /></LayoutWithNavbar>} />
      <Route path="/live2d" element={<LayoutWithNavbar><Live2DPage /></LayoutWithNavbar>} />
      <Route path="/profile" element={<LayoutWithNavbar><ProfilePage /></LayoutWithNavbar>} />
      <Route path="/settings" element={<LayoutWithNavbar><SettingsPage /></LayoutWithNavbar>} />
      <Route path="/memory" element={<LayoutWithNavbar><MemoryPage /></LayoutWithNavbar>} />
      <Route path="/ai-providers" element={<LayoutWithNavbar><AiProvidersPage /></LayoutWithNavbar>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(
  <BrowserRouter>
    <AuthProvider>
      <AppProvider>
        <ChatProvider>
          <ErrorBoundary>
            <div style={{ width: '100%', minHeight: '100vh' }}>
              <AppRoutes />
            </div>
          </ErrorBoundary>
        </ChatProvider>
      </AppProvider>
    </AuthProvider>
  </BrowserRouter>
);
