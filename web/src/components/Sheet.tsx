import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'framer-motion';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { useMediaQuery } from '@/lib/hooks';

/**
 * One overlay for every flow. Phones get a draggable bottom sheet; larger screens get a
 * centred dialog, or a right-hand drawer with `side`.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  side = false,
  hideClose,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  side?: boolean;
  hideClose?: boolean;
}) {
  const desktop = useMediaQuery('(min-width: 640px)');
  const panel = useRef<HTMLDivElement>(null);
  const restore = useRef<HTMLElement | null>(null);
  const drag = useDragControls();
  const startDrag = (e: React.PointerEvent) => !desktop && drag.start(e);

  useEffect(() => {
    if (!open) return;
    restore.current = document.activeElement as HTMLElement;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => panel.current?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      clearTimeout(t);
      restore.current?.focus?.();
    };
  }, [open, onClose]);

  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];
  const asDrawer = desktop && side;

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div
            className={clsx(
              'pointer-events-none absolute inset-0 flex',
              asDrawer ? 'justify-end' : desktop ? 'items-center justify-center p-6' : 'items-end',
            )}
          >
            <motion.div
              ref={panel}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={typeof title === 'string' ? title : undefined}
              className={clsx(
                'pointer-events-auto relative flex w-full flex-col bg-milk outline-none',
                asDrawer
                  ? clsx('h-full border-l border-sand shadow-lift', width.replace('sm:', ''))
                  : desktop
                    ? clsx('max-h-[min(88vh,860px)] rounded-3xl border border-sand shadow-lift', width)
                    : 'max-h-[92dvh] rounded-t-3xl shadow-sheet',
              )}
              initial={asDrawer ? { x: '100%' } : desktop ? { opacity: 0, y: 16, scale: 0.98 } : { y: '100%' }}
              animate={asDrawer ? { x: 0 } : desktop ? { opacity: 1, y: 0, scale: 1 } : { y: 0 }}
              exit={asDrawer ? { x: '100%' } : desktop ? { opacity: 0, y: 10, scale: 0.98 } : { y: '100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 40, mass: 0.9 }}
              drag={!desktop ? 'y' : false}
              dragListener={false}
              dragControls={drag}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={onDragEnd}
            >
              {!desktop && (
                <div className="flex shrink-0 touch-none justify-center pb-1 pt-2.5" onPointerDown={startDrag}>
                  <div className="h-1 w-10 rounded-full bg-sand-deep" />
                </div>
              )}
              {(title || !hideClose) && (
                <div className="flex shrink-0 touch-none items-start justify-between gap-4 px-5 pb-3 pt-2 sm:px-6 sm:pt-5" onPointerDown={startDrag}>
                  <div className="min-w-0">
                    {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
                    {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
                  </div>
                  {!hideClose && (
                    <button
                      onClick={onClose}
                      aria-label="Close"
                      className="-mr-1.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-sand-soft hover:text-ink"
                    >
                      <X className="size-5" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6">
                {children}
              </div>
              {footer && <div className="safe-bottom shrink-0 border-t border-sand bg-milk px-5 py-4 sm:rounded-b-3xl sm:px-6">{footer}</div>}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
