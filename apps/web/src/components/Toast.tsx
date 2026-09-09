import { useEffect } from 'react';
import { useToast } from '../hooks/useToast';
import './Toast.css';

export const ToastContainer = () => {
  const { toasts, removeToast } = useToast();

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
};

interface ToastProps {
  toast: {
    id: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  };
  onRemove: (id: string) => void;
}

const Toast = ({ toast, onRemove }: ToastProps) => {
  useEffect(() => {
    // error 和 warning 类型不自动消失，需要手动关闭
    if (toast.type === 'error' || toast.type === 'warning') {
      return;
    }

    const timer = setTimeout(() => {
      onRemove(toast.id);
    }, 3000);

    return () => clearTimeout(timer);
  }, [toast.id, toast.type, onRemove]);

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '';
    }
  };

  return (
    <div className={`toast toast-${toast.type}`}>
      <div className="toast-icon">{getIcon()}</div>
      <div className="toast-message">{toast.message}</div>
      {(toast.type === 'error' || toast.type === 'warning') && (
        <button 
          className="toast-close"
          onClick={() => onRemove(toast.id)}
        >
          ×
        </button>
      )}
    </div>
  );
};
