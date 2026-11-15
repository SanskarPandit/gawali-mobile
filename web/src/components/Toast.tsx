import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import clsx from 'clsx';

type Kind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: Kind;
  message: string;
  action?: { label: string; onClick: () => void };
}

const Ctx = createContext<{
  show: (message: string, opts?: { kind?: Kind; action?: ToastItem['action']; duration?: number }) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const show = useCallback(
    (message: string, opts: { kind?: Kind; action?: ToastItem['action']; duration?: number } = {}) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-2), { id, message, kind: opts.kind ?? 'success', action: opts.action }]);
      setTimeout(() => dismiss(id), opts.duration ?? (opts.action ? 6000 : 3200));
    },
    [dismiss],
  );
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:bottom-auto sm:top-5 sm:pb-0">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              role="status"
              className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-ivory shadow-lift"
            >
              {t.kind === 'success' ? (
                <CheckCircle2 className="size-4 shrink-0 text-[#7CC492]" strokeWidth={1.75} />
              ) : t.kind === 'error' ? (
                <AlertCircle className="size-4 shrink-0 text-[#F0A08F]" strokeWidth={1.75} />
              ) : (
                <Info className="size-4 shrink-0 text-ivory/70" strokeWidth={1.75} />
              )}
              <span className="min-w-0 flex-1">{t.message}</span>
              {t.action && (
                <button
                  className={clsx('shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-[#E9C9A9] hover:bg-ivory/10')}
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast outside provider');
  return ctx;
}
