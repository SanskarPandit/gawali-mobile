import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, UserPlus, Users } from 'lucide-react';
import clsx from 'clsx';
import { get, patch, post, qs } from '@/lib/api';
import type { DayPlan, Subscription, Txn } from '@/lib/types';
import { dateTime, dayNum, qty, rupees, weekday } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { Avatar, Button, Card, EmptyState, ErrorState, Input, PageHeader, Pill, Select, Skeleton, Stepper, Toggle } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';

interface Row { over_limit?: boolean; id: string; name: string; email: string; phone: string; address: string; flat: string; society_name: string; route_id: string | null; route_name: string | null; stop_order: number; is_active: boolean; wallet_balance: number; billing_mode: string; plan: { product: string; quantity: number; unit: string; status: string }[]; daily_value: number }
interface Detail extends Row { landmark: string; instructions: string; subscriptions: Subscription[]; wallet: { balance: number; billing_mode: string; autopay_status: string; burn: { daily_average: number; covers_until: string | null } }; transactions: Txn[]; bottles: { with_you: number; deposit_held: number }; history: DayPlan[] }
interface Route { id: string; name: string }
interface Product { id: string; name: string; unit: string; price: number; is_available: boolean }

export function useRoutes() { return useQuery({ queryKey: ['dairy', 'routes'], queryFn: () => get<(Route & { households: number; description: string; partner: { id: string; name: string } | null })[]>('/api/v2/dairy/routes/') }); }
export function useProducts() { return useQuery({ queryKey: ['dairy', 'products'], queryFn: () => get<(Product & Record<string, any>)[]>('/api/v2/dairy/products/') }); }

function AddCustomer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const routes = useRoutes();
  const products = useProducts();
  const [f, setF] = useState<Record<string, string>>({ quantity: '1' });
  const [created, setCreated] = useState<{ name: string; email: string; temporary_password: string } | null>(null);
  const qc = useQueryClient();
  const m = useMutation({ mutationFn: () => post('/api/v2/dairy/customers/', f), onSuccess: (r) => { setCreated(r); qc.invalidateQueries({ queryKey: ['dairy'] }); } });
  useEffect(() => { if (open) { setF({ quantity: '1' }); setCreated(null); m.reset(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const err = (k: string) => (m.error as any)?.fields?.[k]?.[0];
  return (
    <Sheet open={open} onClose={onClose} title="Add a household" subtitle="Creates their login and first daily plan." size="lg"
      footer={created ? <Button block onClick={onClose}>Done</Button> : <Button block size="lg" loading={m.isPending} onClick={() => m.mutate()}>Create household</Button>}>
      {created ? (
        <div className="rounded-2xl bg-sage-soft p-5 text-sm">
          <p className="font-semibold text-sage-deep">{created.name} is set up.</p>
          <p className="mt-2 text-ink/80">Share these sign-in details. The password is shown only once.</p>
          <p className="num mt-3 font-mono">{created.email}<br />{created.temporary_password}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name" value={f.full_name ?? ''} onChange={set('full_name')} error={err('full_name')} />
          <Input label="Mobile" value={f.phone ?? ''} onChange={set('phone')} error={err('phone')} />
          <Input className="sm:col-span-2" label="Email" value={f.email ?? ''} onChange={set('email')} error={err('email')} />
          <Input label="Flat / house" value={f.flat ?? ''} onChange={set('flat')} />
          <Input label="Society" value={f.society_name ?? ''} onChange={set('society_name')} />
          <Input className="sm:col-span-2" label="Address" value={f.address ?? ''} onChange={set('address')} error={err('address')} />
          <Select label="Route" value={f.route_id ?? ''} onChange={set('route_id')}><option value="">Unassigned</option>{routes.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
          <Input label="Opening credit (₹, optional)" inputMode="numeric" value={f.opening_balance ?? ''} onChange={set('opening_balance')} />
          <Select label="Daily product" value={f.product_id ?? ''} onChange={set('product_id')}><option value="">No plan yet</option>{products.data?.filter((p) => p.is_available).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.unit} · {rupees(p.price)}</option>)}</Select>
          <Input label="Daily quantity" inputMode="decimal" value={f.quantity ?? ''} onChange={set('quantity')} />
          {m.error && !Object.keys((m.error as any).fields ?? {}).length && <p className="text-sm text-danger sm:col-span-2">{(m.error as Error).message}</p>}
        </div>
      )}
    </Sheet>
  );
}

function CustomerDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ['dairy', 'customer', id], queryFn: () => get<Detail>(`/api/v2/dairy/customers/${id}/`), enabled: !!id });
  const routes = useRoutes();
  const products = useProducts();
  const qc = useQueryClient();
  const toast = useToast();
  const [addProduct, setAddProduct] = useState('');
  const [payAmt, setPayAmt] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const done = (msg: string) => { qc.invalidateQueries({ queryKey: ['dairy'] }); toast.show(msg); };
  const upd = useMutation({ mutationFn: (b: Record<string, unknown>) => patch(`/api/v2/dairy/customers/${id}/`, b), onSuccess: () => done('Household updated'), onError: (e: Error) => toast.show(e.message, { kind: 'error' }) });
  const sub = useMutation({ mutationFn: ({ sid, b }: { sid: string; b: Record<string, unknown> }) => patch(`/api/v2/dairy/subscriptions/${sid}/`, b), onSuccess: () => done('Plan updated'), onError: (e: Error) => toast.show(e.message, { kind: 'error' }) });
  const addSub = useMutation({ mutationFn: () => post(`/api/v2/dairy/customers/${id}/subscriptions/`, { product_id: addProduct, quantity: 1 }), onSuccess: () => { setAddProduct(''); done('Plan line added'); }, onError: (e: Error) => toast.show(e.message, { kind: 'error' }) });
  const pay = useMutation({
    mutationFn: () => post(`/api/v2/dairy/customers/${id}/payments/`, { amount: payAmt, method: payMethod }),
    onSuccess: () => { setPayAmt(''); done('Payment recorded'); },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });
  const d = q.data;
  return (
    <Sheet open={!!id} onClose={onClose} side size="lg" title={d?.name ?? 'Household'} subtitle={d ? `${d.flat} · ${d.society_name || d.address}` : undefined}>
      {!d ? <Skeleton className="h-96" /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-2">
            {[[d.wallet.balance < 0 ? 'Due' : 'Credit', rupees(Math.abs(d.wallet.balance))], ['Per day', rupees(d.wallet.burn.daily_average)], ['Bottles out', String(d.bottles.with_you)]].map(([l, v]) => (
              <div key={l} className="rounded-2xl border border-sand p-3"><p className="eyebrow truncate">{l}</p><p className="num mt-1 truncate font-semibold">{v}</p></div>
            ))}
          </div>
          <div>
            <p className="eyebrow mb-2">Last 14 days · next 7</p>
            <div className="grid grid-cols-7 gap-1">
              {d.history.map((h) => (
                <div key={h.date} title={`${h.date}: ${h.status}`} className={clsx('rounded-lg py-1.5 text-center text-2xs', h.status === 'delivered' ? 'bg-sage-soft text-sage-deep' : h.status === 'scheduled' ? 'bg-ink text-ivory' : h.status === 'missed' ? 'bg-danger-soft text-danger' : 'stripes bg-milk text-muted')}>
                  <span className="block opacity-70">{weekday(h.date).slice(0, 2)}</span><span className="num font-semibold">{dayNum(h.date)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-sand p-4">
            <p className="text-sm font-medium">Record a payment</p>
            <p className="text-xs text-muted">Cash or UPI collected directly. Online payments are off for now.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input className="field w-32" inputMode="decimal" placeholder="₹ amount" value={payAmt} onChange={(e) => setPayAmt(e.target.value.replace(/[^\d.]/g, ''))} aria-label="Amount" />
              <Select aria-label="Method" className="w-36" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}><option value="cash">Cash</option><option value="upi to dairy">UPI to dairy</option><option value="bank transfer">Bank transfer</option></Select>
              <Button disabled={!payAmt} loading={pay.isPending} onClick={() => pay.mutate()}>Record</Button>
            </div>
          </div>
          <div>
            <p className="eyebrow mb-2">Daily plan</p>
            <div className="space-y-2">
              {d.subscriptions.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-sand p-3">
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{s.product.name}</p><p className="num text-xs text-muted">{s.product.unit} · {rupees(s.daily_amount)}/day</p></div>
                  <Stepper size="sm" value={s.default_quantity} min={0.5} step={s.product.step || 1} onChange={(v) => sub.mutate({ sid: s.id, b: { default_quantity: v } })} />
                  <Button size="sm" variant="secondary" onClick={() => sub.mutate({ sid: s.id, b: { status: s.status === 'paused' ? 'active' : 'paused' } })}>{s.status === 'paused' ? 'Resume' : 'Pause'}</Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Select aria-label="Add product" className="flex-1" value={addProduct} onChange={(e) => setAddProduct(e.target.value)}><option value="">Add a product…</option>{products.data?.filter((p) => p.is_available && !d.subscriptions.some((s) => s.product.id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.unit}</option>)}</Select>
                <Button disabled={!addProduct} loading={addSub.isPending} onClick={() => addSub.mutate()} icon={<Plus className="size-4" />}>Add</Button>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Route" value={d.route_id ?? ''} onChange={(e) => upd.mutate({ route_id: e.target.value || null })}><option value="">Unassigned</option>{routes.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
            <Input label="Stop number" type="number" defaultValue={d.stop_order} onBlur={(e) => Number(e.target.value) !== d.stop_order && upd.mutate({ stop_order: Number(e.target.value) })} />
          </div>
          <label className="flex items-center justify-between rounded-2xl border border-sand p-4 text-sm"><span><span className="block font-medium">Active household</span><span className="text-xs text-muted">Inactive homes get no deliveries.</span></span><Toggle label="Active" checked={d.is_active} onChange={(v) => upd.mutate({ is_active: v })} /></label>
          <div>
            <p className="eyebrow mb-2">Recent ledger activity</p>
            <ul className="divide-y divide-sand rounded-2xl border border-sand">
              {d.transactions.slice(0, 10).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block truncate">{t.description}</span><span className="text-xs text-muted">{dateTime(t.created_at)}</span></span>
                  <span className={clsx('num shrink-0 font-medium', t.direction === 'credit' && 'text-sage')}>{t.direction === 'credit' ? '+' : '−'}{rupees(t.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Sheet>
  );
}

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [route, setRoute] = useState('');
  const [status, setStatus] = useState('active');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const s = useDebounced(search, 250);
  const routes = useRoutes();
  const q = useQuery({ queryKey: ['dairy', 'customers', s, route, status], queryFn: () => get<Row[]>(`/api/v2/dairy/customers/${qs({ search: s, route_id: route, status })}`), placeholderData: (p) => p });

  return (
    <div className="space-y-6">
      <PageHeader title="Households" sub={q.data ? `${q.data.length} shown` : 'Subscribers on your routes'} actions={<Button icon={<UserPlus className="size-4" strokeWidth={1.5} />} onClick={() => setAdding(true)}>Add household</Button>} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" strokeWidth={1.5} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, society…" className="field pl-10" aria-label="Search" /></div>
        <Select aria-label="Route" className="sm:w-52" value={route} onChange={(e) => setRoute(e.target.value)}><option value="">All routes</option>{routes.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}<option value="none">Unassigned</option></Select>
        <Select aria-label="Status" className="sm:w-36" value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option></Select>
      </div>
      {q.isLoading ? <Skeleton className="h-96" /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? <Card><EmptyState icon={<Users className="size-5" />} title="No households match" /></Card> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-sand bg-ivory text-left text-2xs uppercase tracking-wider text-muted"><th className="px-4 py-2.5 font-medium">Household</th><th className="px-4 py-2.5 font-medium">Route</th><th className="px-4 py-2.5 font-medium">Plan</th><th className="px-4 py-2.5 text-right font-medium">Per day</th><th className="px-4 py-2.5 text-right font-medium">Balance</th></tr></thead>
              <tbody className="divide-y divide-sand">
                {q.data.map((c) => (
                  <tr key={c.id} onClick={() => setOpen(c.id)} className="cursor-pointer transition hover:bg-ivory">
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={c.name} /><div className="min-w-0"><p className="truncate font-medium">{c.name}</p><p className="max-w-[240px] truncate text-xs text-muted">{c.flat} · {c.society_name || c.address}</p></div></div></td>
                    <td className="px-4 py-3 text-xs">{c.route_name ?? <span className="text-muted">Unassigned</span>}<span className="num block text-muted">Stop {c.stop_order}</span></td>
                    <td className="px-4 py-3"><div className="flex max-w-[260px] flex-wrap gap-1">{c.plan.map((p, i) => <Pill key={i} tone={p.status === 'paused' ? 'amber' : 'outline'}>{qty(p.quantity)}× {p.product}</Pill>)}{!c.plan.length && <span className="text-xs text-muted">No plan</span>}</div></td>
                    <td className="num px-4 py-3 text-right">{rupees(c.daily_value)}</td>
                    <td className="px-4 py-3 text-right"><span className={clsx('num font-medium', c.wallet_balance < 0 && 'text-amber')}>{rupees(Math.abs(c.wallet_balance))}</span><span className={clsx('block text-2xs', c.over_limit ? 'text-danger' : 'text-muted')}>{c.over_limit ? 'Over limit' : c.wallet_balance < 0 ? 'Due' : 'Credit'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <AddCustomer open={adding} onClose={() => setAdding(false)} />
      <CustomerDrawer id={open} onClose={() => setOpen(null)} />
    </div>
  );
}
