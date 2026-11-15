import { useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { Check, Droplet, Lock, Palmtree, Plus, Repeat, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import type { DayPlan, Home, ShopProduct } from '@/lib/types';
import { clock, dayLabel, dayNum, qty, rupees, weekday } from '@/lib/format';
import { post } from '@/lib/api';
import { useLongPress } from '@/lib/hooks';
import { Sheet } from '@/components/Sheet';
import { Button, Pill } from '@/components/ui';
import { ProductArt } from '@/components/ProductArt';
import { useToast } from '@/components/Toast';
import { useInvalidateCustomer, usePatchDay, useSkipDay } from './api';
import { useShop } from './shopApi';

function summary(d: DayPlan) {
  const lines = [
    ...d.items.filter((i) => i.quantity > 0).map((i) => `${qty(i.quantity)}× ${i.product.name}`),
    ...d.orders.filter((o) => o.status !== 'cancelled').map((o) => `+ ${o.product.name}`),
  ];
  return lines;
}

function DayPill({ day, today, onTap, onHold }: { day: DayPlan; today: string; onTap: () => void; onHold: () => void }) {
  const press = useLongPress(onHold, onTap);
  const active = day.status === 'scheduled';
  const delivered = day.status === 'delivered';
  const off = day.status === 'skipped' || day.status === 'vacation' || day.status === 'paused' || day.status === 'missed';
  const lines = summary(day);
  return (
    <motion.button
      layout
      whileTap={{ scale: 0.96 }}
      {...press}
      aria-label={`${dayLabel(day.date, today)}: ${day.status}${lines.length ? `, ${lines.join(', ')}` : ''}. Tap to ${day.locked ? 'view' : delivered ? 'see receipt' : active ? 'skip' : 'deliver'}, hold for options.`}
      className={clsx(
        'relative flex w-[7.25rem] shrink-0 snap-start select-none flex-col rounded-2xl border p-3 text-left transition-colors sm:w-auto sm:min-w-0 sm:flex-1',
        active && 'border-ink bg-ink text-ivory shadow-lift',
        delivered && 'border-sand bg-sand-soft text-ink',
        off && 'stripes border-sand bg-milk text-muted',
        day.status === 'none' && 'border-dashed border-sand-deep bg-milk text-muted',
      )}
      style={{ touchAction: 'pan-x' }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className={clsx('text-2xs font-medium uppercase tracking-wider', active ? 'text-ivory/60' : 'text-muted')}>
          {day.date === today ? 'Today' : weekday(day.date)}
        </span>
        {day.locked && !delivered && <Lock className={clsx('size-3', active ? 'text-ivory/50' : 'text-muted')} strokeWidth={1.75} />}
      </div>
      <span className="num mt-0.5 text-2xl font-semibold leading-none tracking-tight">{dayNum(day.date)}</span>
      <div className="mt-3 flex items-center gap-1.5">
        {delivered ? (
          <span className="flex size-5 items-center justify-center rounded-full bg-sage text-ivory">
            <Check className="size-3" strokeWidth={2.5} />
          </span>
        ) : active ? (
          <Droplet className="size-4 fill-ivory text-ivory" strokeWidth={1.5} />
        ) : day.status === 'vacation' ? (
          <Palmtree className="size-4" strokeWidth={1.5} />
        ) : (
          <span className="size-4 rounded-full border border-current opacity-50" />
        )}
        <span className={clsx('truncate text-2xs font-medium', active ? 'text-ivory/80' : '')}>
          {delivered ? 'Delivered' : active ? rupees(day.amount) : day.status === 'vacation' ? 'Vacation' : day.status === 'missed' ? 'Missed' : day.status === 'none' ? 'No plan' : 'Skipped'}
        </span>
      </div>
      <p className={clsx('mt-1.5 line-clamp-2 min-h-[2rem] text-2xs leading-4', active ? 'text-ivory/70' : 'text-muted')}>
        {lines.length ? lines.join(', ') : '—'}
      </p>
    </motion.button>
  );
}

export function CalendarRibbon({ home, onVacation, onPassport }: { home: Home; onVacation: () => void; onPassport?: (deliveryId?: string) => void }) {
  const today = home.today.date;
  const skip = useSkipDay();
  const toast = useToast();
  const [receipt, setReceipt] = useState<DayPlan | null>(null);
  const [dial, setDial] = useState<DayPlan | null>(null);

  const tap = (d: DayPlan) => {
    if (d.status === 'delivered') return setReceipt(d);
    if (d.locked) {
      return toast.show(d.date === today ? 'Today’s delivery is already on its way.' : `This day locked at ${home.cutoff.cutoff_label}.`, { kind: 'info' });
    }
    if (d.status === 'vacation') return toast.show('You’re on vacation that day. Edit it from Plan.', { kind: 'info' });
    if (d.status === 'none') return toast.show('No plan that day. Add items from the shop.', { kind: 'info' });
    const next = d.status !== 'skipped';
    skip.mutate(
      { date: d.date, skip: next },
      { onSuccess: () => toast.show(next ? `${dayLabel(d.date, today)} skipped` : `${dayLabel(d.date, today)} back on`, { action: { label: 'Undo', onClick: () => skip.mutate({ date: d.date, skip: !next }) } }) },
    );
  };

  const hold = (d: DayPlan) => {
    if (d.status === 'delivered') return setReceipt(d);
    if (d.locked) return toast.show('This day is locked — options open for future days.', { kind: 'info' });
    setDial(d);
  };

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">Your week</h2>
          <p className="mt-0.5 truncate text-xs text-muted">Tap to skip or deliver · hold to swap milk or add essentials</p>
        </div>
        <Button variant="outline" size="sm" icon={<Palmtree className="size-3.5" strokeWidth={1.75} />} onClick={onVacation}>
          Vacation
        </Button>
      </div>
      <div className="scrollbar-none -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {home.week.map((d) => (
          <DayPill key={d.date} day={d} today={today} onTap={() => tap(d)} onHold={() => hold(d)} />
        ))}
      </div>
      <ReceiptSheet day={receipt} today={today} onClose={() => setReceipt(null)} onPassport={onPassport} />
      <QuickDial day={dial} today={today} onClose={() => setDial(null)} />
    </section>
  );
}

function ReceiptSheet({ day, today, onClose, onPassport }: { day: DayPlan | null; today: string; onClose: () => void; onPassport?: (id?: string) => void }) {
  return (
    <Sheet open={!!day} onClose={onClose} title={day ? `Receipt · ${dayLabel(day.date, today)}` : ''} subtitle={day?.delivered_at ? `Delivered at ${clock(day.delivered_at)}` : undefined} size="sm">
      {day && (
        <div className="space-y-4">
          {day.proof_photo && (
            <figure className="overflow-hidden rounded-2xl border border-sand">
              <img src={day.proof_photo} alt="Delivery proof photo" className="aspect-[4/3] w-full object-cover" />
              <figcaption className="flex items-center gap-1.5 bg-sand-soft px-3 py-2 text-2xs text-muted">
                <ShieldCheck className="size-3.5 text-sage" strokeWidth={1.75} /> Proof of drop uploaded by your partner
              </figcaption>
            </figure>
          )}
          <ul className="divide-y divide-sand rounded-2xl border border-sand">
            {day.items.filter((i) => i.quantity > 0).map((i) => (
              <li key={i.subscription_id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 truncate">{qty(i.quantity)} × {i.product.name}</span>
                <span className="num shrink-0 font-medium">{rupees(i.line_amount)}</span>
              </li>
            ))}
            {day.orders.filter((o) => o.status === 'delivered').map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 truncate">{qty(o.quantity)} × {o.product.name}</span>
                <span className="num shrink-0 font-medium">{rupees(o.amount)}</span>
              </li>
            ))}
            <li className="flex items-center justify-between px-4 py-3 text-sm font-semibold">
              <span>Total charged</span>
              <span className="num">{rupees(day.amount)}</span>
            </li>
          </ul>
          {onPassport && (
            <Button variant="outline" block icon={<ShieldCheck className="size-4" strokeWidth={1.5} />} onClick={() => { onClose(); onPassport(day.items[0]?.delivery_id); }}>
              View purity passport
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
}

const ESSENTIALS = ['curd', 'paneer', 'bakery', 'eggs', 'ghee'];

function QuickDial({ day, today, onClose }: { day: DayPlan | null; today: string; onClose: () => void }) {
  const shop = useShop(!!day);
  const toast = useToast();
  const patchDay = usePatchDay();
  const invalidate = useInvalidateCustomer();
  const milkLine = day?.items.find((i) => i.product.category === 'milk' && i.subscription_status === 'active');

  const swap = useMutation({
    mutationFn: (p: ShopProduct) => post<DayPlan>(`/api/v2/customer/day/${day!.date}/swap/`, { subscription_id: milkLine!.subscription_id, product_id: p.id }),
    onSuccess: (d, p) => {
      patchDay(d);
      invalidate();
      toast.show(`${dayLabel(d.date, today)}: switched to ${p.name}`);
      onClose();
    },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });
  const add = useMutation({
    mutationFn: (p: ShopProduct) => post('/api/v2/customer/orders/', { product_id: p.id, quantity: 1, date: day!.date, source: 'calendar' }),
    onSuccess: (_d, p) => {
      invalidate();
      toast.show(`Added ${p.name} to ${dayLabel(day!.date, today)}`);
    },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });

  const milks = (shop.data?.all ?? []).filter((p) => p.category === 'milk' && p.id !== milkLine?.product.id);
  const essentials = (shop.data?.all ?? []).filter((p) => ESSENTIALS.includes(p.category)).slice(0, 8);

  return (
    <Sheet open={!!day} onClose={onClose} title={day ? `Customise ${dayLabel(day.date, today)}` : ''} subtitle="Only this day changes — your plan stays the same." size="md">
      {day && (
        <div className="space-y-6">
          {milkLine && (
            <div>
              <p className="eyebrow mb-2.5 flex items-center gap-1.5"><Repeat className="size-3.5" strokeWidth={1.75} /> Switch milk for this day</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {milks.map((p) => (
                  <button key={p.id} onClick={() => swap.mutate(p)} disabled={swap.isPending}
                    className="flex min-w-0 items-center gap-3 rounded-2xl border border-sand p-3 text-left transition hover:border-ink disabled:opacity-50">
                    <ProductArt product={p} className="size-10 shrink-0" iconClass="size-5" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="num block text-xs text-muted">{qty(milkLine.quantity || milkLine.default_quantity)} × {p.unit} · {rupees(p.price)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="eyebrow mb-2.5 flex items-center gap-1.5"><Plus className="size-3.5" strokeWidth={1.75} /> Add daily essentials</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {essentials.map((p) => (
                <button key={p.id} onClick={() => add.mutate(p)} disabled={add.isPending}
                  className="group flex min-w-0 flex-col items-start rounded-2xl border border-sand p-3 text-left transition hover:border-ink disabled:opacity-50">
                  <ProductArt product={p} className="h-14 w-full" />
                  <span className="mt-2 w-full truncate text-xs font-medium">{p.name}</span>
                  <span className="num flex w-full items-center justify-between text-2xs text-muted">
                    {rupees(p.price)}
                    <Plus className="size-3.5 text-ink opacity-0 transition group-hover:opacity-100" strokeWidth={2} />
                  </span>
                </button>
              ))}
            </div>
          </div>
          {day.orders.filter((o) => o.status === 'pending').length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {day.orders.filter((o) => o.status === 'pending').map((o) => <Pill key={o.id} tone="sage">+ {qty(o.quantity)} {o.product.name}</Pill>)}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
