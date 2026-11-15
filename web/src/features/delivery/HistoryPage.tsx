import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { get } from '@/lib/api';
import { relative, shortDate } from '@/lib/format';
import { Card, ErrorState, PageHeader, Skeleton, Stat } from '@/components/ui';

interface H { days: { date: string; drops: number; missed: number; bottle_pickups: number }[]; totals: { drops: number; missed: number; on_time_rate: number }; notifications: { title: string; body: string; created_at: string }[] }

export default function HistoryPage() {
  const q = useQuery({ queryKey: ['delivery', 'history'], queryFn: () => get<H>('/api/v2/delivery/history/') });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-5">
      <PageHeader title="History" sub="Last 14 mornings" />
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Drops" value={q.data.totals.drops} tone="sage" />
        <Stat label="Missed" value={q.data.totals.missed} />
        <Stat label="Success" value={`${q.data.totals.on_time_rate}%`} />
      </div>
      <Card className="p-4">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={q.data.days}>
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(8)} tick={{ fontSize: 11, fill: '#716B64' }} axisLine={false} tickLine={false} />
              <Tooltip labelFormatter={(l) => shortDate(String(l))} contentStyle={{ borderRadius: 12, border: '1px solid #EAE6DF', fontSize: 12 }} cursor={{ fill: '#F3F0EA' }} />
              <Bar dataKey="drops" name="Drops" fill="#2E7D47" radius={[6, 6, 0, 0]} maxBarSize={24} />
              <Bar dataKey="missed" name="Missed" fill="#B4412F" radius={[6, 6, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card className="divide-y divide-sand">
        <p className="p-4 text-sm font-medium">Messages from the dairy</p>
        {q.data.notifications.map((n, i) => <div key={i} className="p-4"><div className="flex justify-between gap-2"><p className="text-sm font-medium">{n.title}</p><span className="shrink-0 text-2xs text-muted">{relative(n.created_at)}</span></div><p className="mt-0.5 text-sm text-muted">{n.body}</p></div>)}
        {!q.data.notifications.length && <p className="p-4 text-sm text-muted">No messages.</p>}
      </Card>
    </div>
  );
}
