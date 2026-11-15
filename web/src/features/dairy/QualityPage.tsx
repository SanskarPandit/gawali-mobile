import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Plus, ScanLine } from 'lucide-react';
import { get, post, upload } from '@/lib/api';
import { compressImage } from '@/lib/image';
import type { Passport } from '@/lib/types';
import { addDays, isoDay, shortDate } from '@/lib/format';
import { AIBadge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Pill, Select, Skeleton } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { PassportBody } from '@/features/customer/PurityPassportModal';

function NewBatch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tomorrow = addDays(isoDay(new Date()), 1);
  const [f, setF] = useState<Record<string, string>>({ delivery_date: tomorrow, animal: 'a2_cow', fat_percent: '4.2', snf_percent: '8.8', chill_minutes: '42', chill_temp: '3.8', water_percent: '0', detergent_percent: '0', starch_percent: '0', urea_percent: '0' });
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => post<Passport & { deliveries: number }>('/api/v2/dairy/batches/', f),
    onSuccess: (b) => { qc.invalidateQueries({ queryKey: ['dairy', 'batches'] }); toast.show(b.status === 'passed' ? `${b.code} passed · linked to ${b.deliveries} deliveries` : `${b.code} failed the lab screen and was not released`, { kind: b.status === 'passed' ? 'success' : 'error' }); onClose(); },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const [scan, setScan] = useState<{ engine: string; count: number } | null>(null);
  const read = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('report', await compressImage(file, 1800, 0.9), 'report.jpg');
      return upload<{ engine: string; fields: Record<string, number | string> }>('/api/v2/dairy/batches/parse-report/', form);
    },
    onSuccess: (r) => {
      const entries = Object.entries(r.fields);
      setF((x) => ({ ...x, ...Object.fromEntries(entries.map(([k, v]) => [k, String(v)])) }));
      setScan({ engine: r.engine, count: entries.length });
      toast.show(entries.length ? `Read ${entries.length} values from the report — please check them` : 'No values found on that report', { kind: entries.length ? 'success' : 'info' });
    },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });
  return (
    <Sheet open={open} onClose={onClose} title="Record a batch" subtitle="Lab results for this morning’s milk (internal)." size="lg"
      footer={<Button block size="lg" loading={m.isPending} onClick={() => m.mutate()}>Save batch</Button>}>
      <label className="mb-5 flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-sand-deep bg-ivory p-4 transition hover:border-ink">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-milk text-terracotta shadow-card"><ScanLine className="size-5" strokeWidth={1.5} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{read.isPending ? 'Reading the report…' : 'Scan lab report to fill the form'}</span>
          <span className="block text-xs text-muted">Photo or scan of the certificate. Fat, SNF and adulterant results are read automatically.</span>
        </span>
        {scan && <AIBadge engine={scan.engine} />}
        <input type="file" accept="image/*" capture="environment" className="hidden" disabled={read.isPending} onChange={(e) => { const file = e.target.files?.[0]; if (file) read.mutate(file); e.target.value = ''; }} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Batch code (optional)" value={f.code ?? ''} onChange={set('code')} />
        <Input label="Delivery morning" type="date" value={f.delivery_date} onChange={set('delivery_date')} />
        <Select label="Milk" value={f.animal} onChange={set('animal')}><option value="a2_cow">A2 Cow</option><option value="cow">Cow</option><option value="buffalo">Buffalo</option></Select>
        <Input label="Fat %" inputMode="decimal" value={f.fat_percent} onChange={set('fat_percent')} />
        <Input label="SNF %" inputMode="decimal" value={f.snf_percent} onChange={set('snf_percent')} />
        <Input label="Minutes to chill" inputMode="numeric" value={f.chill_minutes} onChange={set('chill_minutes')} />
        <Input label="Chilled to (°C)" inputMode="decimal" value={f.chill_temp} onChange={set('chill_temp')} />
        <p className="eyebrow sm:col-span-2">Adulteration screen (%)</p>
        {['water', 'detergent', 'starch', 'urea'].map((k) => <Input key={k} label={k[0].toUpperCase() + k.slice(1)} inputMode="decimal" value={f[`${k}_percent`]} onChange={set(`${k}_percent`)} />)}
        <p className="text-xs text-muted sm:col-span-2">Batches with any adulterant, fat below 3% or SNF below 8% are rejected automatically. Hub sensors can stream further readings to <span className="font-mono">/api/v2/dairy/batches/&lt;id&gt;/readings/</span>.</p>
      </div>
    </Sheet>
  );
}

export default function QualityPage() {
  const q = useQuery({ queryKey: ['dairy', 'batches'], queryFn: () => get<(Passport & { deliveries: number })[]>('/api/v2/dairy/batches/') });
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<Passport | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader title="Quality lab" sub="Internal lab records for each batch. Not shown to customers until real sensor and lab data is connected." actions={<Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Record batch</Button>} />
      {q.isLoading ? <Skeleton className="h-96" /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? <Card><EmptyState icon={<FlaskConical className="size-5" />} title="No batches yet" /></Card> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b border-sand bg-ivory text-left text-2xs uppercase tracking-wider text-muted">{['Batch', 'Morning', 'Fat / SNF', 'Adulterants', 'Deliveries', 'Status'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-sand">
                {q.data.map((b) => (
                  <tr key={b.id} onClick={() => setView(b)} className="cursor-pointer hover:bg-ivory">
                    <td className="px-4 py-3"><p className="font-mono text-xs font-medium">{b.code}</p><p className="text-xs capitalize text-muted">{b.animal.replace('_', ' ')}</p></td>
                    <td className="px-4 py-3">{shortDate(b.delivery_date)}</td>
                    <td className="num px-4 py-3">{b.lab.fat.toFixed(1)}% / {b.lab.snf.toFixed(1)}%</td>
                    <td className="px-4 py-3">{b.lab.adulteration_free ? <span className="text-xs text-sage">None detected</span> : <span className="text-xs text-danger">Detected</span>}</td>
                    <td className="num px-4 py-3">{b.deliveries}</td>
                    <td className="px-4 py-3">{b.status === 'passed' ? <Pill tone="sage">Passed</Pill> : <Pill tone="danger">Rejected</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <NewBatch open={adding} onClose={() => setAdding(false)} />
      <Sheet open={!!view} onClose={() => setView(null)} title={view ? `Passport · ${view.code}` : ''} size="lg">{view && <PassportBody p={view} internal />}</Sheet>
    </div>
  );
}
