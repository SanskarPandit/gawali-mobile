import { AnimatePresence, motion } from 'framer-motion';
import { BellOff, Camera, DoorOpen, KeyRound, Lock, PauseCircle, PlayCircle, Plus, Sun, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import clsx from 'clsx';
import type { Home } from '@/lib/types';
import { longDate, qty, rupees, shortDate } from '@/lib/format';
import { post } from '@/lib/api';
import { Button, Pill, Stepper } from '@/components/ui';
import { ProductArt, containerLabel } from '@/components/ProductArt';
import { useToast } from '@/components/Toast';
import { CutoffBadge } from './CutoffBadge';
import { useInvalidateCustomer, useSkipDay } from './api';
import { useDayQuantity } from './useDayEdits';

export function DoorstepPill({ doorstep, onClick }: { doorstep: Home['doorstep']; onClick: () => void }) {
  const modes = [
    doorstep.silent_delivery && { icon: BellOff, label: 'Silent delivery' },
    doorstep.use_gate_hook && { icon: DoorOpen, label: 'Milk bag on gate hook' },
    doorstep.photo_proof && { icon: Camera, label: 'Photo verification' },
  ].filter(Boolean) as { icon: typeof BellOff; label: string }[];
  return (
    <button
      onClick={onClick}
      className="group inline-flex max-w-full items-center gap-2 rounded-full border border-sand bg-milk py-1 pl-1.5 pr-3 text-xs font-medium text-ink transition hover:border-sand-deep"
      aria-label="Change doorstep preferences"
    >
      <span className="flex -space-x-1">
        {(modes.length ? modes : [{ icon: DoorOpen, label: '' }]).map((m, i) => (
          <span key={i} className="flex size-6 items-center justify-center rounded-full border-2 border-milk bg-sand-soft text-ink/80">
            <m.icon className="size-3" strokeWidth={1.75} />
          </span>
        ))}
      </span>
      <span className="truncate">{modes.length ? modes.map((m) => m.label).join(' · ') : 'Ring the doorbell'}</span>
    </button>
  );
}

export function TomorrowHeroCard({
  home,
  onDoorstep,
  onRefetch,
}: {
  home: Home;
  onDoorstep: () => void;
  onRefetch: () => void;
}) {
  const t = home.tomorrow;
  const locked = t.locked;
  const skipped = t.status === 'skipped' || t.status === 'vacation' || t.status === 'paused';
  const setQty = useDayQuantity();
  const nav = useNavigate();
  const skip = useSkipDay();
  const toast = useToast();
  const invalidate = useInvalidateCustomer();
  const cancelOrder = useMutation({
    mutationFn: (id: string) => post(`/api/v2/customer/orders/${id}/cancel/`),
    onSuccess: () => {
      invalidate();
      toast.show('Add-on removed');
    },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });

  const toggleSkip = () => {
    const next = !skipped;
    skip.mutate(
      { date: t.date, skip: next },
      {
        onSuccess: () =>
          toast.show(next ? `Skipped ${shortDate(t.date)}. You won’t be charged.` : 'Delivery restored', {
            action: next ? { label: 'Undo', onClick: () => skip.mutate({ date: t.date, skip: false }) } : undefined,
          }),
      },
    );
  };

  const items = t.items.filter((i) => i.subscription_status !== 'cancelled');
  const orders = t.orders.filter((o) => o.status !== 'cancelled');

  return (
    <section className="card relative overflow-hidden">
      <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-terracotta-soft/70 blur-3xl" />
      <div className="relative p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="eyebrow flex items-center gap-1.5">
            <Sun className="size-3.5 text-terracotta" strokeWidth={1.75} />
            Tomorrow at a glance
          </p>
          <CutoffBadge cutoff={home.cutoff} onExpire={onRefetch} />
        </div>

        <div className="mt-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[1.6rem] font-semibold leading-tight tracking-tight sm:text-[2rem]">{longDate(t.date)}</h1>
            <p className="mt-1 text-sm text-muted">
              {skipped ? (
                t.status === 'vacation' ? 'You’re on vacation — nothing will be delivered.' : 'Paused for this morning — nothing will be delivered.'
              ) : (
                <>
                  Arriving <span className="num font-medium text-ink">{home.dairy.slot}</span> · from {home.dairy.hub_name}
                </>
              )}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="eyebrow">Tomorrow’s total</p>
            <motion.p key={t.amount} initial={{ opacity: 0.4, y: -4 }} animate={{ opacity: 1, y: 0 }} className="num text-2xl font-semibold tracking-tight">
              {rupees(t.amount)}
            </motion.p>
          </div>
        </div>

        {locked && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-sand-soft px-3.5 py-3 text-sm">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted" strokeWidth={1.5} />
            <p className="text-ink/80">
              Tomorrow’s order locked at {home.cutoff.cutoff_label} and is being packed. Changes now apply from{' '}
              <span className="font-medium">{shortDate(home.cutoff.governs_date)}</span>.
            </p>
          </div>
        )}

        <ul className="mt-5 divide-y divide-sand rounded-2xl border border-sand bg-ivory/60">
          <AnimatePresence initial={false}>
            {items.map((item) => {
              const paused = item.subscription_status === 'paused';
              return (
                <motion.li
                  key={item.subscription_id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={clsx('flex items-center gap-3 p-3 sm:gap-4 sm:p-4', (item.quantity === 0 || skipped) && 'opacity-60')}
                >
                  <ProductArt product={item.product} className="size-12 shrink-0 sm:size-14" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium sm:text-[0.9375rem]">{item.product.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="num text-xs text-muted">
                        {qty(item.quantity)} × {item.product.unit} · {rupees(item.product.price)}
                      </span>
                      <Pill tone="outline" className="!py-0.5">{containerLabel(item.product.container)}</Pill>
                      {item.is_override && item.quantity > 0 && <Pill tone="terracotta" className="!py-0.5">Changed for this day</Pill>}
                      {paused && <Pill tone="amber" className="!py-0.5">Plan paused</Pill>}
                    </div>
                  </div>
                  <Stepper
                    value={item.quantity}
                    step={item.product.step || 1}
                    disabled={locked || skipped || paused}
                    onChange={(v) => setQty(t.date, item.subscription_id, v)}
                  />
                </motion.li>
              );
            })}
            {orders.map((o) => (
              <motion.li key={o.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                <ProductArt product={o.product} className="size-12 shrink-0 sm:size-14" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium sm:text-[0.9375rem]">{o.product.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="num text-xs text-muted">
                      {qty(o.quantity)} × {o.product.unit} · {rupees(o.amount)}
                    </span>
                    <Pill tone="sage" className="!py-0.5">{o.is_express ? 'Express' : 'Add-on'}</Pill>
                  </div>
                </div>
                {!locked && o.status === 'pending' && !o.is_express && (
                  <button
                    onClick={() => cancelOrder.mutate(o.id)}
                    aria-label={`Remove ${o.product.name}`}
                    className="inline-flex size-9 items-center justify-center rounded-xl text-muted transition hover:bg-danger-soft hover:text-danger"
                  >
                    <X className="size-4" strokeWidth={1.75} />
                  </button>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
          {items.length === 0 && orders.length === 0 && (
            <li className="p-5 text-center text-sm text-muted">
              Nothing scheduled.{' '}
              <Link to="/app/shop" className="font-medium text-terracotta hover:underline">
                Start a daily plan
              </Link>
            </li>
          )}
        </ul>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <DoorstepPill doorstep={home.doorstep} onClick={onDoorstep} />
            {home.gate_token && (
              <span className="num inline-flex items-center gap-1.5 rounded-full border border-sand bg-milk px-3 py-1.5 text-xs font-medium" title="Shared with society security for tomorrow’s slot">
                <KeyRound className="size-3.5 text-sage" strokeWidth={1.75} />
                Gate pass <span className="font-mono tracking-wider">{home.gate_token}</span>
              </span>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="md" icon={<Plus className="size-4" strokeWidth={1.75} />} onClick={() => nav('/app/shop')} disabled={locked} className="flex-1 sm:flex-none">
              Add items
            </Button>
            <Button
              variant={skipped ? 'sage' : 'primary'}
              onClick={toggleSkip}
              loading={skip.isPending}
              disabled={locked || t.status === 'vacation' || items.length === 0}
              icon={skipped ? <PlayCircle className="size-4" strokeWidth={1.75} /> : <PauseCircle className="size-4" strokeWidth={1.75} />}
              className="flex-1 sm:flex-none"
            >
              {skipped ? 'Resume tomorrow' : 'Skip tomorrow'}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
