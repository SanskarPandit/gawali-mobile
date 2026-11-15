import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import clsx from 'clsx';
import { get } from '@/lib/api';
import type { Txn } from '@/lib/types';
import { dateTime, rupees, shortDate } from '@/lib/format';
import { Card, ErrorState, PageHeader, Segmented, Skeleton, Stat } from '@/components/ui';

interface Due { customer_id: string; name: string; phone: string | null; route_name: string | null; due: number; over_limit: boolean; last_payment: string | null; days_since_payment: number | null }
interface Finance { dues: Due[]; credit_limit: number; collected: number; autopay: number; refunds: number; topups: number; withdrawals: number; wallet_float: number; autopay_customers: number; wallet_customers: number; series: { date: string; collected: number; refunds: number; topups: number }[]; transactions: (Txn & { customer_name: string })[] }

export default function FinancePage() {
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const q = useQuery({ queryKey: ['dairy', 'finance', days], queryFn: () => get<Finance>(`/api/v2/dairy/finance/?days=${days}`) });
  return (
    <div className="space-y-6">
      <PageHeader title="Finance" sub="Collections across wallets and UPI Autopay mandates." actions={<Segmented value={days} onChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />} />
      {q.isLoading ? <Skeleton className="h-96" /> : q.error || !q.data ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label="Collected" value={rupees(q.data.collected)} tone="sage" sub={`${rupees(q.data.autopay)} via autopay`} />
            <Stat label="Customer top-ups" value={rupees(q.data.topups)} sub={`${q.data.wallet_customers} prepaid wallets`} />
            <Stat label="Wallet float" value={rupees(q.data.wallet_float)} sub="Withdrawable by customers" />
            <Stat label="Refunds & withdrawals" value={rupees(q.data.refunds + q.data.withdrawals)} tone="amber" sub={`${q.data.autopay_customers} autopay mandates`} />
          </div>
          <Card className="min-w-0 p-5">
            <h2 className="mb-3 font-semibold">Daily movement</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={q.data.series} margin={{ left: -6, right: 4 }}>
                  <CartesianGrid vertical={false} stroke="#EAE6DF" strokeDasharray="3 4" />
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(8)} tick={{ fontSize: 11, fill: '#716B64' }} axisLine={false} tickLine={false} minTickGap={8} />
                  <YAxis tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} tick={{ fontSize: 11, fill: '#716B64' }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip labelFormatter={(l) => shortDate(String(l))} formatter={(v: number, n) => [rupees(v), n]} contentStyle={{ borderRadius: 12, border: '1px solid #EAE6DF', fontSize: 12 }} cursor={{ fill: '#F3F0EA' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="collected" name="Collected" fill="#191715" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="topups" name="Top-ups" fill="#8B6244" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="refunds" name="Refunds" fill="#D97706" radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-sand p-5">
              <h2 className="font-semibold">Dues to collect</h2>
              <span className="num text-sm text-muted">{rupees(q.data.dues.reduce((s, d) => s + Number(d.due), 0))} from {q.data.dues.length} households · limit {rupees(q.data.credit_limit)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead><tr className="border-b border-sand bg-ivory text-left text-2xs uppercase tracking-wider text-muted">{['Household', 'Route', 'Last payment', 'Due'].map((h, i) => <th key={h} className={clsx('px-4 py-2.5 font-medium', i === 3 && 'text-right')}>{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-sand">
                  {q.data.dues.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">Nobody owes you anything right now.</td></tr>}
                  {q.data.dues.map((d) => (
                    <tr key={d.customer_id}>
                      <td className="px-4 py-2.5"><span className="font-medium">{d.name}</span>{d.phone && <a href={`tel:${d.phone}`} className="ml-2 text-xs text-terracotta hover:underline">{d.phone}</a>}</td>
                      <td className="px-4 py-2.5 text-xs text-muted">{d.route_name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-muted">{d.last_payment ? `${shortDate(d.last_payment)} · ${d.days_since_payment}d ago` : 'Never'}</td>
                      <td className="px-4 py-2.5 text-right"><span className={clsx('num font-semibold', d.over_limit && 'text-danger')}>{rupees(d.due)}</span>{d.over_limit && <span className="block text-2xs text-danger">Over limit · on hold</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="overflow-hidden">
            <h2 className="border-b border-sand p-5 font-semibold">Ledger</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b border-sand bg-ivory text-left text-2xs uppercase tracking-wider text-muted">{['When', 'Household', 'Entry', 'Channel', 'Amount'].map((h, i) => <th key={h} className={clsx('px-4 py-2.5 font-medium', i === 4 && 'text-right')}>{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-sand">
                  {q.data.transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted">{dateTime(t.created_at)}</td>
                      <td className="px-4 py-2.5 font-medium">{t.customer_name}</td>
                      <td className="max-w-[260px] truncate px-4 py-2.5">{t.description}</td>
                      <td className="px-4 py-2.5 text-xs text-muted">{t.channel === 'autopay' ? 'UPI Autopay' : 'Wallet'}</td>
                      <td className={clsx('num px-4 py-2.5 text-right font-medium', t.direction === 'credit' && 'text-sage')}>{t.direction === 'credit' ? '+' : '−'}{rupees(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
