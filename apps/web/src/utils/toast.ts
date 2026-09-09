import type { ToastType } from '../hooks/useToast';

const TOAST_COLORS: Record<ToastType, string> = {
  success: '#34d399',
  error: '#f87171',
  warning: '#fbbf24',
  info: '#60a5fa'
};

export const showToast = (message: string, type: ToastType = 'success') => {
  const div = document.createElement('div');
  div.textContent = message;
  div.style.cssText = `
    position: fixed; top: 80px; right: 20px; z-index: 9999;
    padding: 12px 20px; border-radius: 12px; font-size: 14px;
    background: ${TOAST_COLORS[type]}; color: #020617;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3000);
};