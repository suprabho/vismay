import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'info' | 'success' | 'error';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  /** Push a toast. Returns its id (auto-dismisses after `ttl` ms, default 5000). */
  toast: (message: string, type?: ToastType, ttl?: number) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE: Record<ToastType, { border: string; icon: typeof Info; iconColor: string }> = {
  info:    { border: 'border-telemetry-blue', icon: Info,        iconColor: 'text-telemetry-blue' },
  success: { border: 'border-emerald-500',    icon: CheckCircle, iconColor: 'text-emerald-500' },
  error:   { border: 'border-f1-red',         icon: AlertCircle, iconColor: 'text-f1-red' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = 'info', ttl = 5000) => {
      const id = nextId.current++;
      setToasts(prev => [...prev, { id, message, type }]);
      if (ttl > 0) window.setTimeout(() => dismiss(id), ttl);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none">
          <AnimatePresence initial={false}>
            {toasts.map(t => {
              const { border, icon: Icon, iconColor } = TONE[t.type];
              return (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 40 }}
                  transition={{ duration: 0.18 }}
                  className={`pointer-events-auto flex items-start gap-2 border-l-2 ${border} bg-neutral-900 text-white px-4 py-3 shadow-lg`}
                >
                  <Icon size={14} className={`${iconColor} mt-0.5 shrink-0`} />
                  <p className="font-mono text-[11px] leading-snug flex-1 break-words">{t.message}</p>
                  <button
                    onClick={() => dismiss(t.id)}
                    className="text-neutral-500 hover:text-white transition-colors shrink-0"
                    aria-label="Dismiss"
                  >
                    <X size={13} />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

/** Access the toast pusher. Falls back to a no-op + console if no provider is mounted. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: (message: string) => {
        console.warn('[toast] no ToastProvider mounted:', message);
        return -1;
      },
      dismiss: () => {},
    };
  }
  return ctx;
}
