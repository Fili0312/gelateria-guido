'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { cn } from './cn';
import { AlertTriangleIcon, CheckIcon, InfoIcon, XIcon } from './icons';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';
export type ToastId = string;

export interface ToastInput {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** Millisecondi; 0 mantiene la notifica finché viene chiusa. */
  durationMs?: number;
}

interface ToastItem extends Omit<ToastInput, 'tone' | 'durationMs'> {
  id: ToastId;
  tone: ToastTone;
  durationMs: number;
}

export interface ToastApi {
  toast: (input: ToastInput) => ToastId;
  dismiss: (id: ToastId) => void;
  dismissAll: () => void;
}

export interface ToastProviderProps {
  children: ReactNode;
  defaultDurationMs?: number;
  maxToasts?: number;
}

const ToastContext = createContext<ToastApi | null>(null);
let toastSequence = 0;

const toneClasses: Record<ToastTone, string> = {
  info: 'border-l-brand-600',
  success: 'border-l-diminuzione',
  warning: 'border-l-attenzione',
  error: 'border-l-aumento',
};

const iconClasses: Record<ToastTone, string> = {
  info: 'text-brand-600',
  success: 'text-diminuzione',
  warning: 'text-attenzione',
  error: 'text-aumento',
};

function ToneIcon({ tone }: { tone: ToastTone }) {
  const className = cn('mt-0.5 size-5', iconClasses[tone]);

  if (tone === 'success') return <CheckIcon className={className} />;
  if (tone === 'warning' || tone === 'error') {
    return <AlertTriangleIcon className={className} />;
  }
  return <InfoIcon className={className} />;
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: ToastId) => void }) {
  useEffect(() => {
    if (item.durationMs <= 0) return;
    const timer = window.setTimeout(() => onDismiss(item.id), item.durationMs);
    return () => window.clearTimeout(timer);
  }, [item.durationMs, item.id, onDismiss]);

  return (
    <article
      className={cn(
        'pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-l-4 border-neutral-200 bg-white p-3 shadow-lg',
        toneClasses[item.tone],
      )}
      role={item.tone === 'error' ? 'alert' : 'status'}
      aria-atomic="true"
    >
      <ToneIcon tone={item.tone} />
      <div className="min-w-0 flex-1 py-1">
        <p className="text-sm font-semibold text-neutral-900">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-sm leading-5 text-neutral-600">{item.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className={cn(
          'hover:bg-neutral-100 inline-flex size-tap shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:text-neutral-800',
          'focus-visible:ring-brand-600 focus-visible:ring-2 focus-visible:outline-none',
        )}
        aria-label="Chiudi notifica"
      >
        <XIcon className="size-4" />
      </button>
    </article>
  );
}

export function ToastProvider({
  children,
  defaultDurationMs = 6000,
  maxToasts = 4,
}: ToastProviderProps) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: ToastId) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const dismissAll = useCallback(() => setItems([]), []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = `toast-${Date.now()}-${++toastSequence}`;
      const item: ToastItem = {
        ...input,
        id,
        tone: input.tone ?? 'info',
        durationMs: input.durationMs ?? defaultDurationMs,
      };
      setItems((current) => [...current, item].slice(-Math.max(1, maxToasts)));
      return id;
    },
    [defaultDurationMs, maxToasts],
  );

  const api = useMemo<ToastApi>(
    () => ({ toast, dismiss, dismissAll }),
    [dismiss, dismissAll, toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col gap-2 sm:right-4 sm:left-auto sm:w-full sm:max-w-sm"
        aria-label="Notifiche"
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast deve essere usato dentro <ToastProvider>.');
  return value;
}
