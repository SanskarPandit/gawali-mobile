import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Leaf, Milk, Recycle } from 'lucide-react';
import clsx from 'clsx';
import { get } from '@/lib/api';
import type { Bottles } from '@/lib/types';
import { plural, rupees, shortDate } from '@/lib/format';
import { Card, ErrorState, Pill, Skeleton } from '@/components/ui';
import { keys } from './api';

interface Entry { id: string; kind: 'bottle_issued' | 'bottle_returned' | 'pouch_returned'; label: string; count: number; date: string; recorded_by: string | null }

export function BottleReturnLedger() {
  const q = useQuery({ queryKey: keys.bottles, queryFn: () => get<Bottles & { entries: Entry[] }>('/api/v2/customer/bottles/') });
  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const b = q.data;
  const progress = 10 - b.pouches_to_next_credit;
  const R = 34;
  const C = 2 * Math.PI * R;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <Card className="p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex -space-x-3">
              {Array.from({ length: Math.min(6, Math.max(1, b.with_you)) }, (_, i) => (
                <span key={i} className={clsx('flex h-16 w-10 items-end justify-center rounded-t-[1.1rem] rounded-b-lg border-2 border-milk pb-2', b.with_you ? 'bg-gradient-to-b from-sand-soft to-sand' : 'bg-sand-soft opacity-40')}>
                  <Milk className="size-4 text-terracotta" strokeWidth={1.5} />
                </span>
              ))}
            </div>
            <div className="min-w-0">
              <p className="num text-2xl font-semibold tracking-tight">{plural(b.with_you, 'Glass Bottle')} with you</p>
              <p className="num mt-1 text-sm text-muted">Deposit held {rupees(b.deposit_held)} · {rupees(b.deposit_each)} per bottle, refunded instantly on pickup</p>
            </div>
          </div>
          <div className="mt-5 rounded-2xl bg-ivory p-4 text-sm text-ink/80">
            Rinse empties and leave them by the door. Your partner scans them during the morning drop and {rupees(b.deposit_each)} per bottle returns to your wallet.
          </div>
        </Card>

        <Card>
          <h2 className="border-b border-sand p-5 font-semibold">Return ledger</h2>
          <ul className="divide-y divide-sand">
            {b.entries.length === 0 && <li className="p-6 text-center text-sm text-muted">No packaging movements yet.</li>}
            {b.entries.map((e) => {
              const back = e.kind !== 'bottle_issued';
              return (
                <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                  <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-xl', back ? 'bg-sage-soft text-sage' : 'bg-sand-soft text-ink/70')}>
                    {e.kind === 'pouch_returned' ? <Recycle className="size-4" strokeWidth={1.75} /> : back ? <ArrowUpRight className="size-4" strokeWidth={1.75} /> : <ArrowDownLeft className="size-4" strokeWidth={1.75} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.label}</p>
                    <p className="truncate text-xs text-muted">{shortDate(e.date)}{e.recorded_by ? ` · logged by ${e.recorded_by}` : ''}</p>
                  </div>
                  <span className={clsx('num shrink-0 text-sm font-semibold', back && 'text-sage')}>{back ? '−' : '+'}{e.count}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <aside className="min-w-0 space-y-6">
        <Card className="p-5">
          <p className="eyebrow flex items-center gap-1.5"><Leaf className="size-3.5 text-sage" strokeWidth={1.75} /> Pouch recycling</p>
          <div className="mt-4 flex items-center gap-4">
            <svg viewBox="0 0 80 80" className="size-20 shrink-0 -rotate-90">
              <circle cx="40" cy="40" r={R} fill="none" stroke="#EAE6DF" strokeWidth="7" />
              <circle cx="40" cy="40" r={R} fill="none" stroke="#2E7D47" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress / 10)} className="transition-all duration-700" />
            </svg>
            <div className="min-w-0">
              <p className="num text-lg font-semibold">{progress}/10 pouches</p>
              <p className="text-sm text-muted">{b.pouches_to_next_credit} more for a {rupees(b.eco_credit_each)} eco-credit</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted">Return 10 clean, rinsed pouches to earn a credit. Lifetime: {b.pouches_returned} pouches recycled.</p>
        </Card>
        <Card className="p-5">
          <Pill tone="sage">Circular since day one</Pill>
          <p className="mt-2 text-sm text-ink/80">Every glass bottle is washed at 85 °C, inspected and refilled up to 40 times before it’s recycled.</p>
        </Card>
      </aside>
    </div>
  );
}
