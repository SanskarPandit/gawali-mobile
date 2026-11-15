import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock3, Lock } from 'lucide-react';
import clsx from 'clsx';
import type { Cutoff } from '@/lib/types';
import { countdownParts } from '@/lib/format';
import { useCountdown } from '@/lib/hooks';

function Digit({ value }: { value: string }) {
  return (
    <span className="relative inline-flex overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: '-60%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '60%', opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="inline-block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** "Cutoff in 2h 45m (11:00 PM)" — ticks every second, pulses amber in the final hour. */
export function CutoffBadge({ cutoff, onExpire }: { cutoff: Cutoff; onExpire?: () => void }) {
  const ms = useCountdown(cutoff.next_cutoff_at, cutoff.server_now);
  const { h, m, s, total } = countdownParts(ms);
  const expired = total <= 0;
  const fired = useRef(false);
  useEffect(() => {
    if (!expired) fired.current = false;
    else if (!fired.current) {
      fired.current = true;
      const t = setTimeout(() => onExpire?.(), 1200);
      return () => clearTimeout(t);
    }
  }, [expired, onExpire]);
  const urgent = total > 0 && total < 3600;
  const locked = cutoff.tomorrow_locked;

  return (
    <div
      className={clsx(
        'num inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        urgent ? 'animate-amber-pulse border-amber/30 bg-amber-soft text-amber' : 'border-sand bg-milk text-ink',
      )}
      aria-live="polite"
    >
      {locked ? <Lock className="size-3.5 shrink-0" strokeWidth={1.75} /> : <Clock3 className="size-3.5 shrink-0" strokeWidth={1.75} />}
      <span className="truncate">
        {locked ? 'Next cutoff in ' : 'Cutoff in '}
        <span className="font-semibold">
          {h > 0 && (
            <>
              <Digit value={String(h)} />h{' '}
            </>
          )}
          <Digit value={String(m).padStart(h > 0 ? 2 : 1, '0')} />m
          {h === 0 && (
            <>
              {' '}
              <Digit value={String(s).padStart(2, '0')} />s
            </>
          )}
        </span>
        <span className="text-current/70 opacity-70"> ({cutoff.cutoff_label})</span>
      </span>
    </div>
  );
}
