import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { get, patch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Avatar, Button, Card, ErrorState, Input, PageHeader, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface P { name: string; email: string; phone: string; vehicle_number: string; dairy_name: string; route_name: string | null }

export default function PartnerProfilePage() {
  const q = useQuery({ queryKey: ['delivery', 'profile'], queryFn: () => get<P>('/api/v2/delivery/profile/') });
  const { logout } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ full_name: '', vehicle_number: '' });
  useEffect(() => { if (q.data) setF({ full_name: q.data.name, vehicle_number: q.data.vehicle_number }); }, [q.data]);
  const save = useMutation({ mutationFn: () => patch('/api/v2/delivery/profile/', f), onSuccess: () => { q.refetch(); toast.show('Profile saved'); }, onError: (e: Error) => toast.show(e.message, { kind: 'error' }) });
  if (q.isLoading) return <Skeleton className="h-72" />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-5">
      <PageHeader title="Profile" actions={<Button variant="outline" icon={<LogOut className="size-4" strokeWidth={1.5} />} onClick={logout}>Sign out</Button>} />
      <Card className="p-5">
        <div className="mb-5 flex items-center gap-3"><Avatar name={q.data.name} className="size-12" /><div className="min-w-0"><p className="truncate font-medium">{q.data.name}</p><p className="truncate text-sm text-muted">{q.data.dairy_name} · {q.data.route_name ?? 'All households'}</p></div></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
          <Input label="Vehicle number" value={f.vehicle_number} onChange={(e) => setF({ ...f, vehicle_number: e.target.value })} />
          <Input label="Email" value={q.data.email} disabled />
          <Input label="Mobile" value={q.data.phone ?? ''} disabled />
        </div>
        <Button className="mt-5" loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
      </Card>
    </div>
  );
}
