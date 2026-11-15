import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BellOff, Camera, DoorOpen, KeyRound, RefreshCw, Zap } from 'lucide-react';
import clsx from 'clsx';
import { get, post, qs } from '@/lib/api';
import type { LoadLine, Stop } from '@/lib/types';
import { addDays, clock, isoDay, qty } from '@/lib/format';
import { Button, Card, EmptyState, ErrorState, PageHeader, Pill, Segmented, Select, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Manifest { date: string; stops: Stop[]; load_sheet: LoadLine[]; routes: { name: string; partner: string | null; total: number; delivered: number; pending: number; missed: number }[] }
interface Route { id: string; name: string }

export const statusTone = { delivered: 'sage', pending: 'amber', missed: 'danger', skipped: 'neutral', partial: 'terracotta' } as const;

export default function DispatchPage() {
  const today = isoDay(new Date());
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const [route, setRoute] = useState('');
  const date = day === 'today' ? today : addDays(today, 1);
  const routes = useQuery({ queryKey: ['dairy', 'routes'], queryFn: () => get<Route[]>('/api/v2/dairy/routes/') });
  const q = useQuery({ queryKey: ['dairy', 'manifest', date, route], queryFn: () => get<Manifest>(`/api/v2/dairy/manifest/${qs({ date, route_id: route })}`), refetchInterval: 30_000 });
  const toast = useToast();
  const gen = useMutation({ mutationFn: () => post<{ created: number; refreshed: number }>('/api/v2/dairy/manifest/generate/', { date }), onSuccess: (r) => { q.refetch(); toast.show(`Manifest synced · ${r.created} new, ${r.refreshed} updated`); }, onError: (e: Error) => toast.show(e.message, { kind: 'error' }) });

  return (
    <div className="space-y-6">
      <PageHeader title="Dispatch" sub="Load sheet and stop-by-stop manifest for every route."
        actions={<>
          <Segmented value={day} onChange={setDay} options={[{ value: 'today', label: 'Today' }, { value: 'tomorrow', label: 'Tomorrow' }]} />
          <Select aria-label="Route" value={route} onChange={(e) => setRoute(e.target.value)} className="w-48">
            <option value="">All routes</option>{routes.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}<option value="none">Unassigned</option>
          </Select>
          <Button variant="outline" icon={<RefreshCw className="size-4" strokeWidth={1.5} />} loading={gen.isPending} onClick={() => gen.mutate()}>Sync manifest</Button>
        </>} />
      {q.isLoading ? <Skeleton className="h-96" /> : q.error || !q.data ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {q.data.routes.map((r) => (
              <Card key={r.name} className="p-4">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="truncate text-xs text-muted">{r.partner ?? 'No partner assigned'}</p>
                <p className="num mt-2 text-xl font-semibold">{r.delivered}<span className="text-sm text-muted">/{r.total}</span></p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand"><div className="h-full bg-sage" style={{ width: `${(r.delivered / Math.max(1, r.total)) * 100}%` }} /></div>
              </Card>
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
            <Card className="h-fit p-5">
              <h2 className="font-semibold">Load sheet</h2>
              <p className="text-xs text-muted">What leaves the hub</p>
              <ul className="mt-3 divide-y divide-sand">
                {q.data.load_sheet.map((l) => (
                  <li key={l.product.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium">{l.product.name}</span><span className="text-xs text-muted">{l.product.unit} · {l.households} homes</span></span>
                    <span className="num shrink-0 text-base font-semibold">{qty(l.quantity)}</span>
                  </li>
                ))}
                {!q.data.load_sheet.length && <li className="py-4 text-sm text-muted">Nothing to load.</li>}
              </ul>
            </Card>
            <Card className="min-w-0 overflow-hidden">
              {q.data.stops.length === 0 ? <EmptyState icon={<RefreshCw className="size-5" strokeWidth={1.5} />} title="No stops" body="Sync the manifest to generate stops for this day." /> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead><tr className="border-b border-sand bg-ivory text-left text-2xs uppercase tracking-wider text-muted">
                      <th className="px-4 py-2.5 font-medium">#</th><th className="px-4 py-2.5 font-medium">Household</th><th className="px-4 py-2.5 font-medium">Order</th><th className="px-4 py-2.5 font-medium">Doorstep</th><th className="px-4 py-2.5 font-medium">Status</th>
                    </tr></thead>
                    <tbody className="divide-y divide-sand">
                      {q.data.stops.map((s) => (
                        <tr key={s.customer_id} className={clsx(s.status === 'skipped' && 'opacity-55')}>
                          <td className="num px-4 py-3 text-muted">{s.stop_order}</td>
                          <td className="px-4 py-3"><p className="font-medium">{s.name}</p><p className="max-w-[220px] truncate text-xs text-muted">{s.flat} · {s.society_name || s.address} · {s.route_name}</p></td>
                          <td className="px-4 py-3"><p className="max-w-[240px] truncate">{[...s.items.filter((i) => i.quantity > 0).map((i) => `${qty(i.quantity)}× ${i.product.name}`), ...s.orders.map((o) => `+${qty(o.quantity)} ${o.product.name}`)].join(', ') || '—'}</p>
                            {s.is_express && <Pill tone="amber" icon={<Zap className="size-3" />} className="mt-1">Express</Pill>}</td>
                          <td className="px-4 py-3"><div className="flex items-center gap-1.5 text-muted">
                            {s.doorstep.silent_delivery && <BellOff className="size-4" strokeWidth={1.5} aria-label="Silent" />}
                            {s.doorstep.use_gate_hook && <DoorOpen className="size-4" strokeWidth={1.5} aria-label="Gate hook" />}
                            {s.doorstep.photo_proof && <Camera className="size-4" strokeWidth={1.5} aria-label="Photo" />}
                            {s.gate_token && <span className="num flex items-center gap-1 font-mono text-2xs"><KeyRound className="size-3.5" strokeWidth={1.5} />{s.gate_token}</span>}
                          </div></td>
                          <td className="px-4 py-3"><Pill tone={statusTone[s.status]}>{s.status}{s.delivered_at ? ` · ${clock(s.delivered_at)}` : ''}</Pill>
                            {s.proof_photo && <a href={s.proof_photo} target="_blank" rel="noreferrer" className="ml-2 text-xs text-terracotta hover:underline">Photo</a>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
