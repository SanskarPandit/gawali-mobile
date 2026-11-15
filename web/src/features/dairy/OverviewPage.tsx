import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowRight, Droplets, IndianRupee, Recycle, ShieldAlert, Sparkles, TrendingUp, Users } from 'lucide-react';
import clsx from 'clsx';
import { get } from '@/lib/api';
import { qty, rupees, shortDate } from '@/lib/format';
import { AIBadge, Card, ErrorState, PageHeader, Skeleton, Stat } from '@/components/ui';
import { CutoffBadge } from '@/features/customer/CutoffBadge';
import type { Cutoff } from '@/lib/types';

export interface Overview {
  dairy: { id: string; name: string; hub_name: string };
  cutoff: Cutoff;
  kpis: Record<string, number | null> & { top_product: string | null };
  today_progress: Record<'pending' | 'delivered' | 'missed' | 'skipped', number>;
  demand_tomorrow: { product_id: string; name: string; unit: string; quantity: number; households: number; amount: number }[];
  series: { date: string; revenue: number; litres: number; drops: number }[];
  low_balance: { customer_id: string; name: string; balance: number; daily: number }[];
}

const tip = { contentStyle: { borderRadius: 12, border: '1px solid #EAE6DF', fontSize: 12, boxShadow: '0 8px 24px -12px rgba(25,23,21,.2)' }, labelFormatter: (l: string) => shortDate(l) };

export default function OverviewPage() {
  const q = useQuery({ queryKey: ['dairy', 'overview'], queryFn: () => get<Overview>('/api/v2/dairy/overview/'), refetchInterval: 60_000 });
  const ai = useQuery({ queryKey: ['dairy', 'insights'], queryFn: () => get<{ engine: string; pending?: boolean; items: { title: string; body: string; tone: string }[] }>('/api/v2/dairy/insights/'), staleTime: 300_000,
    refetchInterval: (query) => (query.state.data?.pending && query.state.dataUpdateCount < 6 ? 3000 : false) });
  if (q.isLoading) return <div className="space-y-5"><Skeleton className="h-10 w-72" /><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-80" /></div>;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { kpis: k, today_progress: p } = q.data;
  const totalToday = p.pending + p.delivered + p.missed;
  const change = k.demand_change_pct as number | null;

  return (
    <div className="space-y-6">
      <PageHeader title={`Good ${new Date().getHours() < 12 ? 'morning' : 'day'}, ${q.data.dairy.name}`} sub={q.data.dairy.hub_name}
        actions={<CutoffBadge cutoff={q.data.cutoff} />} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Tomorrow’s milk" value={`${qty(Math.round((k.tomorrow_litres as number) * 10) / 10)} L`} icon={<Droplets className="size-4" strokeWidth={1.5} />} tone="terracotta"
          sub={change != null ? <span className={change >= 0 ? 'text-sage' : 'text-amber'}>{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(0)}% vs 7-day avg</span> : '—'} />
        <Stat label="Active households" value={k.active_households} icon={<Users className="size-4" strokeWidth={1.5} />} sub={`+${k.new_this_month} this month · ${k.skips_tomorrow} paused tomorrow`} />
        <Stat label="Collected this month" value={rupees(k.month_collected)} icon={<IndianRupee className="size-4" strokeWidth={1.5} />} tone="sage" sub={`${rupees(k.month_refunded)} refunded instantly`} />
        <Stat label="Bottles in circulation" value={k.bottles_outstanding} icon={<Recycle className="size-4" strokeWidth={1.5} />} sub={`${rupees(k.deposits_held)} deposits held`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0 p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="font-semibold">Revenue · last 14 days</h2><p className="text-xs text-muted">Delivered milk and add-ons</p></div>
            <p className="num text-sm text-muted">{rupees(q.data.series.reduce((s, d) => s + d.revenue, 0))} total</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={q.data.series} margin={{ left: -12, right: 4, top: 4 }}>
                <defs><linearGradient id="rev" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8B6244" stopOpacity={0.28} /><stop offset="1" stopColor="#8B6244" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="#EAE6DF" strokeDasharray="3 4" />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(8)} tick={{ fontSize: 11, fill: '#716B64' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} tick={{ fontSize: 11, fill: '#716B64' }} axisLine={false} tickLine={false} width={52} />
                <Tooltip {...tip} formatter={(v: number) => [rupees(v), 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="#8B6244" strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="min-w-0 p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-terracotta" strokeWidth={1.5} />AI insights</h2>{ai.data && (ai.data.pending ? <span className="text-2xs text-muted">AI refining…</span> : <AIBadge engine={ai.data.engine} />)}</div>
          {ai.isLoading ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div> : (
            <ul className="space-y-2.5">
              {(ai.data?.items ?? []).map((i, idx) => (
                <li key={idx} className={clsx('rounded-2xl border p-3.5', i.tone === 'warning' ? 'border-amber/25 bg-amber-soft/60' : i.tone === 'positive' ? 'border-sage/20 bg-sage-soft/60' : 'border-sand bg-ivory')}>
                  <p className="text-sm font-medium">{i.title}</p><p className="mt-0.5 text-xs leading-relaxed text-ink/75">{i.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Tomorrow’s demand</h2><Link to="/console/dispatch" className="flex items-center gap-1 text-xs font-medium text-terracotta hover:underline">Dispatch <ArrowRight className="size-3.5" /></Link></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead><tr className="border-b border-sand text-left text-2xs uppercase tracking-wider text-muted"><th className="py-2 font-medium">Product</th><th className="py-2 text-right font-medium">Qty</th><th className="py-2 text-right font-medium">Homes</th><th className="py-2 text-right font-medium">Value</th></tr></thead>
              <tbody className="divide-y divide-sand">
                {q.data.demand_tomorrow.map((d) => (
                  <tr key={d.product_id}><td className="py-2.5 pr-3"><span className="font-medium">{d.name}</span> <span className="text-xs text-muted">{d.unit}</span></td>
                    <td className="num py-2.5 text-right">{qty(d.quantity)}</td><td className="num py-2.5 text-right">{d.households}</td><td className="num py-2.5 text-right font-medium">{rupees(d.amount)}</td></tr>
                ))}
                {!q.data.demand_tomorrow.length && <tr><td colSpan={4} className="py-6 text-center text-muted">No orders for tomorrow yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold">Today’s routes</h2>
            <p className="num mt-2 text-2xl font-semibold">{p.delivered}<span className="text-base text-muted">/{totalToday} drops</span></p>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-sand">
              <div className="bg-sage" style={{ width: `${(p.delivered / Math.max(1, totalToday)) * 100}%` }} />
              <div className="bg-danger" style={{ width: `${(p.missed / Math.max(1, totalToday)) * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">{p.pending} pending · {p.missed} missed · {p.skipped} skipped</p>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Needs attention</h2>{(k.open_refunds as number) > 0 && <Link to="/console/refunds" className="text-xs font-medium text-terracotta hover:underline">Review</Link>}</div>
            <ul className="mt-3 space-y-2 text-sm">
              {(k.open_refunds as number) > 0 && <li className="flex items-center gap-2"><ShieldAlert className="size-4 text-amber" strokeWidth={1.5} />{k.open_refunds} refund claim(s) flagged</li>}
              {q.data.low_balance.slice(0, 4).map((c) => (
                <li key={c.customer_id} className="flex items-center gap-2"><AlertTriangle className="size-4 shrink-0 text-amber" strokeWidth={1.5} /><span className="min-w-0 flex-1 truncate">{c.name}</span><span className="num text-xs text-muted">{rupees(c.balance)}</span></li>
              ))}
              {!q.data.low_balance.length && !(k.open_refunds as number) && <li className="flex items-center gap-2 text-muted"><TrendingUp className="size-4 text-sage" strokeWidth={1.5} />All clear</li>}
            </ul>
          </Card>
        </div>
      </div>

      <Card className="min-w-0 p-5">
        <h2 className="mb-3 font-semibold">Litres delivered · last 14 days</h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={q.data.series} margin={{ left: -18, right: 4 }}>
              <CartesianGrid vertical={false} stroke="#EAE6DF" strokeDasharray="3 4" />
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(8)} tick={{ fontSize: 11, fill: '#716B64' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#716B64' }} axisLine={false} tickLine={false} />
              <Tooltip {...tip} formatter={(v: number) => [`${v} L`, 'Delivered']} cursor={{ fill: '#F3F0EA' }} />
              <Bar dataKey="litres" fill="#2E7D47" radius={[6, 6, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
