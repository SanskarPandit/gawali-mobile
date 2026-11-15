import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarX2, Palmtree, PauseCircle, PlayCircle, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { del, get, patch, post } from '@/lib/api';
import type { DayOrder, Subscription, Vacation } from '@/lib/types';
import { plural, qty, rupees, shortDate } from '@/lib/format';
import { Button, Card, EmptyState, ErrorState, PageHeader, Pill, SectionTitle, Skeleton, Stepper } from '@/components/ui';
import { ProductArt, containerLabel } from '@/components/ProductArt';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { keys, useHome, useInvalidateCustomer } from './api';
import { VacationSheet } from './VacationSheet';

interface OrderRow extends Omit<DayOrder, 'amount'> { amount: number; date: string }

export default function PlanPage() {
  const home = useHome();
  const subs = useQuery({ queryKey: keys.subs, queryFn: () => get<Subscription[]>('/api/v2/customer/subscriptions/') });
  const vacations = useQuery({ queryKey: keys.vacations, queryFn: () => get<Vacation[]>('/api/v2/customer/vacations/') });
  const orders = useQuery({ queryKey: keys.orders, queryFn: () => get<OrderRow[]>('/api/v2/customer/orders/') });
  const invalidate = useInvalidateCustomer();
  const toast = useToast();
  const [vac, setVac] = useState(false);
  const [cancelling, setCancelling] = useState<Subscription | null>(null);
  const [localQty, setLocalQty] = useState<Record<string, number>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const refresh = () => { invalidate(); vacations.refetch(); };
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => patch<Subscription>(`/api/v2/customer/subscriptions/${id}/`, body),
    onSuccess: (s, v) => {
      refresh();
      if (v.body.status) toast.show(s.status === 'paused' ? `${s.product.name} paused` : s.status === 'cancelled' ? `${s.product.name} cancelled` : `${s.product.name} resumed`);
      else toast.show(`Daily quantity set to ${qty(s.default_quantity)}`);
    },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });
  const cancelOrder = useMutation({ mutationFn: (id: string) => post(`/api/v2/customer/orders/${id}/cancel/`), onSuccess: () => { refresh(); toast.show('Add-on cancelled'); }, onError: (e: Error) => toast.show(e.message, { kind: 'error' }) });
  const endVacation = useMutation({ mutationFn: (id: string) => del(`/api/v2/customer/vacations/${id}/`), onSuccess: () => { refresh(); toast.show('Vacation removed · deliveries resume'); }, onError: (e: Error) => toast.show(e.message, { kind: 'error' }) });

  const setQty = (s: Subscription, v: number) => {
    setLocalQty((x) => ({ ...x, [s.id]: v }));
    clearTimeout(timers.current[s.id]);
    timers.current[s.id] = setTimeout(() => update.mutate({ id: s.id, body: { default_quantity: v } }), 500);
  };

  if (subs.isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-48" /><Skeleton className="h-40" /></div>;
  if (subs.error) return <ErrorState error={subs.error} onRetry={() => subs.refetch()} />;
  const from = home.data?.cutoff.governs_date;
  const upcoming = (orders.data ?? []).filter((o) => o.status === 'pending' && from && o.date >= home.data!.today.date);
  const daily = (subs.data ?? []).filter((s) => s.status === 'active').reduce((t, s) => t + s.default_quantity * s.product.price, 0);

  return (
    <div className="space-y-8">
      <PageHeader title="Your plan" sub={`Changes apply from ${from ? shortDate(from) : 'the next open day'} · ${rupees(daily)} per day`}
        actions={<>
          <Button variant="outline" icon={<Palmtree className="size-4" strokeWidth={1.5} />} onClick={() => setVac(true)} disabled={!from}>Plan vacation</Button>
          <Link to="/app/shop"><Button icon={<Plus className="size-4" strokeWidth={1.75} />}>Add product</Button></Link>
        </>} />

      <section>
        <SectionTitle title="Daily deliveries" sub="Your default order every morning" />
        {subs.data!.length === 0 ? (
          <Card><EmptyState icon={<ShoppingBag className="size-5" strokeWidth={1.5} />} title="No daily plan yet" body="Subscribe to milk or curd and it arrives every morning." action={<Link to="/app/shop"><Button>Browse the shop</Button></Link>} /></Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {subs.data!.map((s) => {
              const v = localQty[s.id] ?? s.default_quantity;
              const paused = s.status === 'paused';
              return (
                <Card key={s.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <ProductArt product={s.product} className="size-14 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate font-medium">{s.product.name}</p>
                        {paused ? <Pill tone="amber">Paused</Pill> : <Pill tone="sage">Active</Pill>}
                      </div>
                      <p className="truncate text-xs text-muted">{s.product.unit} · {containerLabel(s.product.container)} · since {shortDate(s.start_date)}</p>
                      <p className="num mt-1 text-sm">{rupees(v * s.product.price)} <span className="text-muted">/ day</span></p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-sand pt-4">
                    <Stepper value={v} min={s.product.step || 0.5} step={s.product.step || 1} onChange={(x) => setQty(s, x)} disabled={paused} />
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="secondary" icon={paused ? <PlayCircle className="size-3.5" strokeWidth={1.75} /> : <PauseCircle className="size-3.5" strokeWidth={1.75} />}
                        onClick={() => update.mutate({ id: s.id, body: { status: paused ? 'active' : 'paused' } })}>
                        {paused ? 'Resume' : 'Pause'}
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Cancel subscription" onClick={() => setCancelling(s)}><Trash2 className="size-3.5" strokeWidth={1.75} /></Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <SectionTitle title="Upcoming add-ons" sub="One-time items on future deliveries" />
          <Card className="divide-y divide-sand">
            {upcoming.length === 0 ? <p className="p-5 text-sm text-muted">No add-ons scheduled.</p> : upcoming.map((o) => (
              <div key={o.id} className="flex items-center gap-3 p-4">
                <ProductArt product={o.product} className="size-10 shrink-0" iconClass="size-5" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{qty(o.quantity)} × {o.product.name}</p>
                  <p className="num text-xs text-muted">{shortDate(o.date)} · {rupees(o.amount)}{o.is_express ? ' · Express' : ''}</p>
                </div>
                {!o.is_express && from && o.date >= from && (
                  <Button size="sm" variant="ghost" aria-label="Cancel add-on" loading={cancelOrder.isPending && cancelOrder.variables === o.id} onClick={() => cancelOrder.mutate(o.id)}><X className="size-4" strokeWidth={1.75} /></Button>
                )}
              </div>
            ))}
          </Card>
        </section>
        <section>
          <SectionTitle title="Vacations" sub="Deliveries pause and resume automatically" />
          <Card className="divide-y divide-sand">
            {(vacations.data ?? []).length === 0 ? <p className="p-5 text-sm text-muted">No vacations planned.</p> : vacations.data!.map((v) => {
              const over = home.data && v.end_date < home.data.today.date;
              return (
                <div key={v.id} className="flex items-center gap-3 p-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sand-soft"><Palmtree className="size-5 text-terracotta" strokeWidth={1.5} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="num text-sm font-medium">{shortDate(v.start_date)} – {shortDate(v.end_date)}</p>
                    <p className="truncate text-xs text-muted">{plural(v.days, 'day')}{v.reason ? ` · ${v.reason}` : ''}{over ? ' · completed' : ''}</p>
                  </div>
                  {!over && <Button size="sm" variant="ghost" icon={<CalendarX2 className="size-3.5" strokeWidth={1.75} />} loading={endVacation.isPending && endVacation.variables === v.id} onClick={() => endVacation.mutate(v.id)}>End</Button>}
                </div>
              );
            })}
          </Card>
        </section>
      </div>

      {from && <VacationSheet open={vac} onClose={() => { setVac(false); vacations.refetch(); }} from={from} />}
      <Sheet open={!!cancelling} onClose={() => setCancelling(null)} title="Cancel this subscription?" size="sm"
        footer={<div className="flex gap-2"><Button variant="outline" block onClick={() => setCancelling(null)}>Keep it</Button>
          <Button variant="danger" block loading={update.isPending} onClick={() => update.mutate({ id: cancelling!.id, body: { status: 'cancelled' } }, { onSuccess: () => setCancelling(null) })}>Cancel daily</Button></div>}>
        <p className="text-sm text-muted">{cancelling?.product.name} stops from {from ? shortDate(from) : 'the next open day'}. Your wallet balance stays withdrawable — nothing is locked.</p>
      </Sheet>
    </div>
  );
}
