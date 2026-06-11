import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

const CONFIG = {
  success: { Icon: CheckCircle, bg: '#D1FAE5', border: '#6EE7B7', text: '#065F46', icon: '#059669' },
  error:   { Icon: XCircle,    bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B', icon: '#DC2626' },
  warning: { Icon: AlertTriangle, bg: '#FEF3C7', border: '#FCD34D', text: '#92400E', icon: '#D97706' },
  info:    { Icon: Info,       bg: '#DBEAFE', border: '#93C5FD', text: '#1E40AF', icon: '#3B82F6' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Set());

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const addToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    const tid = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      timers.current.delete(tid);
    }, duration);
    timers.current.add(tid);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {toasts.map(({ id, message, type }) => {
          const { Icon, bg, border, text, icon } = CONFIG[type] || CONFIG.info;
          return (
            <div key={id} className="animate-fade-up" style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: bg, border: `1px solid ${border}`,
              borderRadius: 12, padding: '10px 14px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
              minWidth: 260, maxWidth: 360,
            }}>
              <Icon size={16} color={icon} style={{ flexShrink: 0 }} />
              <p style={{ flex: 1, fontSize: 13, fontWeight: 600, color: text, margin: 0 }}>{message}</p>
              <button onClick={() => dismiss(id)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                color: text, opacity: 0.5, display: 'flex',
              }}>
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
