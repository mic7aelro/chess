'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export type ToastType = 'info' | 'error' | 'success';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

import { createContext, useContext } from 'react';

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let _uid = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = String(++_uid);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-20 md:bottom-5 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateX(12px)';
    requestAnimationFrame(() => {
      el.style.transition = `opacity var(--dur) var(--ease-out), transform var(--dur) var(--ease-out)`;
      el.style.opacity = '1';
      el.style.transform = 'translateX(0)';
    });
  }, []);

  const borderColor = t.type === 'error' ? '#ca3431' : t.type === 'success' ? '#6fbc5b' : 'var(--line-strong)';

  return (
    <div
      ref={ref}
      className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg text-sm max-w-sm shadow-lg"
      style={{
        backgroundColor: 'var(--bg-2)',
        border: `1px solid ${borderColor}`,
        boxShadow: 'var(--shadow-1)',
        color: 'var(--fg-0)',
      }}
    >
      <span className="flex-1">{t.message}</span>
      <button
        onClick={() => onDismiss(t.id)}
        className="shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
