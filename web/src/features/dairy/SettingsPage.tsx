import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AIBadge, Button, Card, ErrorState, Input, PageHeader, Skeleton, Toggle } from '@/components/ui';
import { useToast } from '@/components/Toast';

export default function SettingsPage() {
  const q = useQuery({ queryKey: ['dairy', 'settings'], queryFn: () => get<Record<string, string>>('/api/v2/dairy/settings/') });
  const ai = useQuery({ queryKey: ['ai-status'], queryFn: () => get<{ configured: boolean; engine: string; failover_key: boolean; tasks: { task: string; label: string; model: string }[] }>('/api/v2/ai/status/') });
  const [f, setF] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const toast = useToast();
  const { refreshUser } = useAuth();
  useEffect(() => { if (q.data) setF(Object.fromEntries(Object.entries(q.data).map(([k, v]) => [k, String(v)]))); }, [q.data]);
  const save = useMutation({ mutationFn: () => patch('/api/v2/dairy/settings/', { ...f, hold_on_dues: f.hold_on_dues === 'true', cutoff_reminders: f.cutoff_reminders === 'true' }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['dairy'] }); refreshUser(); toast.show('Settings saved'); }, onError: (e: Error) => toast.show(e.message, { kind: 'error' }) });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const err = (k: string) => (save.error as any)?.fields?.[k]?.[0];
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" sub="How your dairy appears and operates." actions={<Button loading={save.isPending} onClick={() => save.mutate()}>Save changes</Button>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 font-semibold">Business</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input className="sm:col-span-2" label="Dairy name" value={f.business_name ?? ''} onChange={set('business_name')} error={err('business_name')} />
            <Input label="Phone" value={f.phone ?? ''} onChange={set('phone')} />
            <Input label="Collection hub" value={f.hub_name ?? ''} onChange={set('hub_name')} />
            <Input className="sm:col-span-2" label="Address" value={f.address ?? ''} onChange={set('address')} />
            <Input label="City" value={f.city ?? ''} onChange={set('city')} />
            <Input label="Pincode" value={f.pincode ?? ''} onChange={set('pincode')} />
            <Input className="sm:col-span-2" label="Settlement UPI ID" value={f.bank_upi_id ?? ''} onChange={set('bank_upi_id')} />
          </div>
        </Card>
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 font-semibold">Delivery rules</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="Order cutoff" type="time" value={f.cutoff_time ?? ''} onChange={set('cutoff_time')} error={err('cutoff_time')} />
              <Input label="Slot starts" type="time" value={f.slot_start ?? ''} onChange={set('slot_start')} />
              <Input label="Slot ends" type="time" value={f.slot_end ?? ''} onChange={set('slot_end')} error={err('slot_end')} />
              <Input label="Bottle deposit (₹)" inputMode="decimal" value={String(f.bottle_deposit ?? '')} onChange={set('bottle_deposit')} />
              <Input className="sm:col-span-2" label="Eco-credit per 10 pouches (₹)" inputMode="decimal" value={String(f.pouch_eco_credit ?? '')} onChange={set('pouch_eco_credit')} />
            </div>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="font-semibold">Dues & credit</h2>
            <p className="mt-1 text-sm text-muted">Households pay you directly. Set how much they may owe before add-ons stop and deliveries pause.</p>
            <div className="mt-4 grid gap-4">
              <Input label="Credit limit per household (₹)" inputMode="decimal" value={String(f.credit_limit ?? '')} onChange={set('credit_limit')} error={err('credit_limit')} />
              {([['hold_on_dues', 'Hold next-day deliveries when a household is over the limit'], ['cutoff_reminders', 'Remind customers an hour before cutoff']] as const).map(([k, l]) => (
                <label key={k} className="flex items-center justify-between gap-4 rounded-xl border border-sand px-3.5 py-2.5 text-sm">{l}
                  <Toggle label={l} checked={String(f[k]) === 'true'} onChange={(v) => setF((x) => ({ ...x, [k]: String(v) }))} />
                </label>
              ))}
            </div>
          </Card>
          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between"><h2 className="font-semibold">AI engine</h2>{ai.data && <AIBadge engine={ai.data.engine} />}</div>
            {ai.data?.configured ? (
              <ul className="mt-3 divide-y divide-sand rounded-2xl border border-sand">
                {ai.data.tasks.map((t) => (
                  <li key={t.task} className="flex flex-col gap-0.5 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm">{t.label}</span>
                    <span className="truncate font-mono text-xs text-muted">{t.model}</span>
                  </li>
                ))}
                {ai.data.failover_key && <li className="px-3.5 py-2.5 text-xs text-muted">Backup key configured — used automatically if the main key is rate-limited.</li>}
              </ul>
            ) : null}
            <p className="mt-2 text-sm text-muted">
              {ai.data?.configured ? null
                : <>Running on deterministic rules. Add <span className="font-mono text-ink">NVIDIA_API_KEY</span> (and optionally <span className="font-mono text-ink">NVIDIA_MODEL</span>) to <span className="font-mono text-ink">backend/.env</span> and restart the server to enable Nemotron or Kimi.</>}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
