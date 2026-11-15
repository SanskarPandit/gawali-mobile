import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronRight, LogOut, Recycle, Wallet } from 'lucide-react';
import { get, patch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Doorstep } from '@/lib/types';
import { Avatar, Button, Card, ErrorState, Input, PageHeader, Select, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { DoorstepForm } from './DoorstepSheet';
import { keys, useInvalidateCustomer } from './api';

interface Profile extends Doorstep {
  full_name: string; email: string; phone: string | null; dairy_name: string | null; route_name: string | null;
  address: string; flat_or_house_number: string; landmark: string; preferred_language: string;
}

export default function AccountPage() {
  const q = useQuery({ queryKey: keys.profile, queryFn: () => get<Profile>('/api/v2/customer/profile/') });
  const { logout, refreshUser } = useAuth();
  const toast = useToast();
  const invalidate = useInvalidateCustomer();
  const [f, setF] = useState<Partial<Profile>>({});
  useEffect(() => { if (q.data) setF(q.data); }, [q.data]);
  const save = useMutation({
    mutationFn: () => patch<Profile>('/api/v2/customer/profile/', {
      full_name: f.full_name, phone: f.phone, address: f.address, flat_or_house_number: f.flat_or_house_number,
      landmark: f.landmark, preferred_language: f.preferred_language,
    }),
    onSuccess: () => { q.refetch(); invalidate(); refreshUser(); toast.show('Profile saved'); },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });

  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const set = (k: keyof Profile) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div>
      <PageHeader title="Account" sub={`${q.data.dairy_name ?? 'No dairy'}${q.data.route_name ? ` · ${q.data.route_name}` : ''}`}
        actions={<Button variant="outline" icon={<LogOut className="size-4" strokeWidth={1.5} />} onClick={logout}>Sign out</Button>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <Avatar name={q.data.full_name} className="size-12 text-sm" />
            <div className="min-w-0"><p className="truncate font-medium">{q.data.full_name}</p><p className="truncate text-sm text-muted">{q.data.email}</p></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Full name" value={f.full_name ?? ''} onChange={set('full_name')} />
            <Input label="Mobile" value={f.phone ?? ''} onChange={set('phone')} />
            <Input label="Flat / house" value={f.flat_or_house_number ?? ''} onChange={set('flat_or_house_number')} />
            <Input label="Landmark" value={f.landmark ?? ''} onChange={set('landmark')} />
            <Input className="sm:col-span-2" label="Delivery address" value={f.address ?? ''} onChange={set('address')} />
            <Select label="Language" value={f.preferred_language ?? 'en'} onChange={set('preferred_language')}>
              <option value="en">English</option><option value="hi">हिन्दी</option><option value="mr">मराठी</option>
            </Select>
          </div>
          <Button className="mt-5" loading={save.isPending} onClick={() => save.mutate()}>Save profile</Button>
        </Card>
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 font-semibold">Doorstep preferences</h2>
            <DoorstepForm doorstep={q.data} onSaved={() => q.refetch()} />
          </Card>
          <Card className="divide-y divide-sand">
            {[{ to: '/app/wallet', icon: Wallet, label: 'Wallet, autopay & withdrawals' }, { to: '/app/bottles', icon: Recycle, label: 'Bottles & recycling ledger' }].map((l) => (
              <Link key={l.to} to={l.to} className="flex items-center gap-3 p-4 text-sm font-medium transition hover:bg-ivory">
                <l.icon className="size-4 text-muted" strokeWidth={1.5} /><span className="flex-1">{l.label}</span><ChevronRight className="size-4 text-muted" strokeWidth={1.5} />
              </Link>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
