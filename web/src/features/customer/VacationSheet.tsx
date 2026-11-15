import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Palmtree, Sparkles } from 'lucide-react';
import { get, post, qs } from '@/lib/api';
import { addDays, plural, rupees, shortDate, weekday } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { Sheet } from '@/components/Sheet';
import { Button, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useInvalidateCustomer } from './api';

const SPAN = 45;

interface Preview {
  days: number;
  savings: number;
  resume_date: string;
  message: string;
}

/** Fluid date-range slider: drag either handle (or use arrow keys) to pick the days away. */
function RangeSlider({ from, start, end, onChange }: { from: string; start: number; end: number; onChange: (s: number, e: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef<'s' | 'e' | null>(null);

  const toIndex = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * (SPAN - 1));
  };
  const move = (clientX: number) => {
    const i = toIndex(clientX);
    if (dragging.current === 's') onChange(Math.min(i, end), end);
    else if (dragging.current === 'e') onChange(start, Math.max(i, start));
  };
  const pct = (i: number) => `${(i / (SPAN - 1)) * 100}%`;

  const handle = (which: 's' | 'e', value: number) => (
    <button
      type="button"
      role="slider"
      aria-label={which === 's' ? 'Leaving on' : 'Back on'}
      aria-valuemin={0}
      aria-valuemax={SPAN - 1}
      aria-valuenow={value}
      aria-valuetext={shortDate(addDays(from, value))}
      onPointerDown={(e) => {
        e.stopPropagation();
        dragging.current = which;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => dragging.current && move(e.clientX)}
      onPointerUp={() => (dragging.current = null)}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        if (which === 's') onChange(Math.max(0, Math.min(end, start + d)), end);
        else onChange(start, Math.min(SPAN - 1, Math.max(start, end + d)));
      }}
      className="absolute top-1/2 z-10 size-7 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-[3px] border-milk bg-ink shadow-lift active:cursor-grabbing"
      style={{ left: pct(value) }}
    />
  );

  return (
    <div className="px-3.5 py-6">
      <div
        ref={track}
        className="relative h-2 touch-none rounded-full bg-sand"
        onPointerDown={(e) => {
          const i = toIndex(e.clientX);
          dragging.current = Math.abs(i - start) <= Math.abs(i - end) ? 's' : 'e';
          move(e.clientX);
        }}
      >
        <div className="absolute inset-y-0 rounded-full bg-terracotta" style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }} />
        {Array.from({ length: SPAN }, (_, i) =>
          weekday(addDays(from, i)) === 'Mon' ? <span key={i} className="absolute top-4 h-1.5 w-px bg-sand-deep" style={{ left: pct(i) }} /> : null,
        )}
        {handle('s', start)}
        {handle('e', end)}
      </div>
      <div className="mt-5 flex justify-between text-2xs text-muted">
        <span>{shortDate(from)}</span>
        <span>{shortDate(addDays(from, SPAN - 1))}</span>
      </div>
    </div>
  );
}

export function VacationSheet({ open, onClose, from }: { open: boolean; onClose: () => void; from: string }) {
  const [range, setRange] = useState<[number, number]>([1, 5]);
  useEffect(() => {
    if (open) setRange([1, 5]);
  }, [open]);
  const start = addDays(from, range[0]);
  const end = addDays(from, range[1]);
  const debounced = useDebounced(`${start}|${end}`, 250);
  const toast = useToast();
  const invalidate = useInvalidateCustomer();

  const preview = useQuery({
    queryKey: ['vacation-preview', debounced],
    queryFn: () => {
      const [s, e] = debounced.split('|');
      return get<Preview>(`/api/v2/customer/vacations/preview/${qs({ start_date: s, end_date: e })}`);
    },
    enabled: open,
    placeholderData: (prev) => prev,
  });
  const save = useMutation({
    mutationFn: () => post('/api/v2/customer/vacations/', { start_date: start, end_date: end }),
    onSuccess: () => {
      invalidate();
      toast.show(`Vacation saved · deliveries resume ${shortDate(addDays(end, 1))}`);
      onClose();
    },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Plan a vacation"
      subtitle="Slide to choose the days you’re away. Everything resumes on its own."
      footer={
        <Button block size="lg" loading={save.isPending} onClick={() => save.mutate()} icon={<Palmtree className="size-4" strokeWidth={1.75} />}>
          Pause {plural(range[1] - range[0] + 1, 'day')}
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {[
          ['Leaving', start],
          ['Last day away', end],
        ].map(([l, d]) => (
          <div key={l} className="rounded-2xl border border-sand bg-ivory px-4 py-3">
            <p className="eyebrow">{l}</p>
            <p className="num mt-1 text-base font-semibold">
              {weekday(d)}, {shortDate(d)}
            </p>
          </div>
        ))}
      </div>
      <RangeSlider from={from} start={range[0]} end={range[1]} onChange={(s, e) => setRange([s, e])} />
      <div className="rounded-2xl bg-sage-soft p-4">
        {preview.data ? (
          <>
            <p className="num text-2xl font-semibold tracking-tight text-sage-deep">{rupees(preview.data.savings)} saved</p>
            <p className="mt-1 flex gap-2 text-sm text-sage-deep/90">
              <Sparkles className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              {preview.data.message}
            </p>
          </>
        ) : preview.error ? (
          <p className="text-sm text-danger">{(preview.error as Error).message}</p>
        ) : (
          <Skeleton className="h-14" />
        )}
      </div>
      <p className="mt-3 text-xs text-muted">Add-ons on these days are cancelled and nothing is charged. You can end a vacation early from Plan.</p>
    </Sheet>
  );
}
