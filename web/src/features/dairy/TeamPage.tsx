import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, KeyRound, MapPinned, Plus, Trash2 } from 'lucide-react';
import { del, get, patch, post } from '@/lib/api';
import { Avatar, Button, Card, EmptyState, ErrorState, Input, PageHeader, Pill, SectionTitle, Select, Skeleton, Toggle } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { useRoutes } from './CustomersPage';

interface Partner { id: string; name: string; email: string; phone: string; vehicle_number: string; is_active: boolean; route_id: string | null; route_name: string | null; delivered_today: number; lifetime_drops: number; temporary_password?: string }

function AddPartner({ open, onClose }: { open: boolean; onClose: () => void }) {
  const routes = useRoutes();
  const qc = useQueryClient();
  const [f, setF] = useState<Record<string, string>>({});
  const m = useMutation({ mutationFn: () => post<Partner>('/api/v2/dairy/partners/', f), onSuccess: () => qc.invalidateQueries({ queryKey: ['dairy'] }) });
  useEffect(() => { if (open) { setF({}); m.reset(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const err = (k: string) => (m.error as any)?.fields?.[k]?.[0];
  return (
    <Sheet open={open} onClose={onClose} title="Invite a delivery partner" subtitle="They sign in to the partner app with these details." size="md"
      footer={m.data ? <Button block onClick={onClose}>Done</Button> : <Button block loading={m.isPending} onClick={() => m.mutate()}>Create partner login</Button>}>
      {m.data ? (
        <div className="rounded-2xl bg-sage-soft p-5 text-sm"><p className="font-semibold text-sage-deep">{m.data.name} can now sign in.</p><p className="num mt-3 font-mono">{m.data.email}<br />{m.data.temporary_password}</p><p className="mt-2 text-xs text-ink/70">Shown once — share it securely.</p></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name" value={f.full_name ?? ''} onChange={set('full_name')} error={err('full_name')} />
          <Input label="Mobile" value={f.phone ?? ''} onChange={set('phone')} error={err('phone')} />
          <Input className="sm:col-span-2" label="Email" value={f.email ?? ''} onChange={set('email')} error={err('email')} />
          <Input label="Vehicle number" value={f.vehicle_number ?? ''} onChange={set('vehicle_number')} />
          <Select label="Route" value={f.route_id ?? ''} onChange={set('route_id')}><option value="">All households</option>{routes.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
        </div>
      )}
    </Sheet>
  );
}

export default function TeamPage() {
  const partners = useQuery({ queryKey: ['dairy', 'partners'], queryFn: () => get<Partner[]>('/api/v2/dairy/partners/') });
  const routes = useRoutes();
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [routeName, setRouteName] = useState('');
  const [pw, setPw] = useState<{ name: string; password: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['dairy'] });
  const upd = useMutation({ mutationFn: ({ id, b }: { id: string; b: Record<string, unknown> }) => patch<Partner>(`/api/v2/dairy/partners/${id}/`, b),
    onSuccess: (p) => { refresh(); if (p.temporary_password) setPw({ name: p.name, password: p.temporary_password }); else toast.show('Partner updated'); }, onError: (e: Error) => toast.show(e.message, { kind: 'error' }) });
  const addRoute = useMutation({ mutationFn: () => post('/api/v2/dairy/routes/', { name: routeName }), onSuccess: () => { setRouteName(''); refresh(); toast.show('Route created'); }, onError: (e: Error) => toast.show(e.message, { kind: 'error' }) });
  const delRoute = useMutation({ mutationFn: (id: string) => del(`/api/v2/dairy/routes/${id}/`), onSuccess: () => { refresh(); toast.show('Route deleted'); }, onError: (e: Error) => toast.show(e.message, { kind: 'error' }) });

  return (
    <div className="space-y-8">
      <PageHeader title="Routes & team" sub="Who delivers where." actions={<Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Invite partner</Button>} />
      <section>
        <SectionTitle title="Delivery partners" />
        {partners.isLoading ? <Skeleton className="h-48" /> : partners.error ? <ErrorState error={partners.error} /> : !partners.data?.length ? <Card><EmptyState icon={<Bike className="size-5" />} title="No partners yet" /></Card> : (
          <div className="grid gap-3 md:grid-cols-2">
            {partners.data.map((p) => (
              <Card key={p.id} className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={p.name} />
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{p.name}</p><p className="truncate text-xs text-muted">{p.phone} · {p.vehicle_number || 'No vehicle'}</p></div>
                  {p.is_active ? <Pill tone="sage">Active</Pill> : <Pill tone="danger">Suspended</Pill>}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl bg-ivory py-2"><p className="num font-semibold">{p.delivered_today}</p><p className="text-2xs text-muted">Drops today</p></div>
                  <div className="rounded-xl bg-ivory py-2"><p className="num font-semibold">{p.lifetime_drops}</p><p className="text-2xs text-muted">Lifetime</p></div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Select aria-label="Route" className="min-w-0 flex-1" value={p.route_id ?? ''} onChange={(e) => upd.mutate({ id: p.id, b: { route_id: e.target.value || null } })}><option value="">All households</option>{routes.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
                  <Button size="sm" variant="secondary" icon={<KeyRound className="size-3.5" />} onClick={() => upd.mutate({ id: p.id, b: { reset_password: true } })}>Reset</Button>
                  <Toggle label="Active" checked={p.is_active} onChange={(v) => upd.mutate({ id: p.id, b: { is_active: v } })} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
      <section>
        <SectionTitle title="Routes" sub="Households are ordered by stop number inside each route" />
        <Card className="divide-y divide-sand">
          {routes.data?.map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sand-soft"><MapPinned className="size-4 text-terracotta" strokeWidth={1.5} /></span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{r.name}</p><p className="truncate text-xs text-muted">{r.households} households · {r.partner?.name ?? 'No partner'}</p></div>
              <Button size="sm" variant="ghost" aria-label="Delete route" onClick={() => delRoute.mutate(r.id)}><Trash2 className="size-4" strokeWidth={1.5} /></Button>
            </div>
          ))}
          <div className="flex gap-2 p-4">
            <input className="field flex-1" placeholder="New route name, e.g. Wakad – Hinjewadi" value={routeName} onChange={(e) => setRouteName(e.target.value)} aria-label="New route name" />
            <Button disabled={!routeName.trim()} loading={addRoute.isPending} onClick={() => addRoute.mutate()}>Add</Button>
          </div>
        </Card>
      </section>
      <AddPartner open={adding} onClose={() => setAdding(false)} />
      <Sheet open={!!pw} onClose={() => setPw(null)} title="New password" size="sm"><p className="text-sm text-muted">Share with {pw?.name}. Shown once.</p><p className="num mt-3 rounded-xl bg-sand-soft p-3 font-mono">{pw?.password}</p></Sheet>
    </div>
  );
}
