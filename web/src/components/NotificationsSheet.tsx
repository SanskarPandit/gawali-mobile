import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { BellOff, BellRing } from 'lucide-react';
import { enablePush, pushConfig, pushSupported } from '@/lib/push';
import clsx from 'clsx';
import { get, post } from '@/lib/api';
import { relative } from '@/lib/format';
import type { Notification } from '@/lib/types';
import { Sheet } from './Sheet';
import { Button, EmptyState, Skeleton } from './ui';

export function NotificationsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => get<{ results: Notification[] }>('/api/v1/notifications/?page_size=40'),
    enabled: open,
  });
  const readAll = useMutation({
    mutationFn: () => post('/api/v1/notifications/read-all/'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['customer', 'home'] });
    },
  });
  const items = q.data?.results ?? [];
  const [push, setPush] = useState<'hidden' | 'offer' | 'on' | 'denied' | 'busy'>('hidden');
  useEffect(() => {
    if (!open || !pushSupported()) return;
    pushConfig().then((c) => {
      if (!c.enabled) return setPush('hidden');
      setPush(Notification.permission === 'granted' ? 'on' : Notification.permission === 'denied' ? 'denied' : 'offer');
    });
  }, [open]);
  const unread = items.some((n) => !n.is_read);

  return (
    <Sheet open={open} onClose={onClose} title="Notifications" side size="sm"
      footer={unread ? <Button variant="outline" block loading={readAll.isPending} onClick={() => readAll.mutate()}>Mark all as read</Button> : undefined}>
      {push !== 'hidden' && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-sand bg-ivory p-3.5">
          <BellRing className="size-5 shrink-0 text-terracotta" strokeWidth={1.5} />
          <p className="min-w-0 flex-1 text-sm">
            {push === 'on' ? 'Push notifications are on for this device.' : push === 'denied' ? 'Notifications are blocked in your browser settings.' : 'Get delivery and payment alerts even when the app is closed.'}
          </p>
          {(push === 'offer' || push === 'busy') && (
            <Button size="sm" loading={push === 'busy'} onClick={async () => { setPush('busy'); const r = await enablePush().catch(() => 'unavailable' as const); setPush(r === 'enabled' ? 'on' : r === 'denied' ? 'denied' : 'offer'); }}>
              Turn on
            </Button>
          )}
        </div>
      )}
      {q.isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={<BellOff className="size-5" strokeWidth={1.5} />} title="You’re all caught up" body="Delivery confirmations and refunds will appear here." />
      ) : (
        <ul className="-mx-2 space-y-1">
          {items.map((n) => (
            <li key={n.id} className={clsx('rounded-2xl px-3 py-3', !n.is_read && 'bg-terracotta-soft/50')}>
              <div className="flex items-start gap-3">
                <span className={clsx('mt-1.5 size-2 shrink-0 rounded-full', n.is_read ? 'bg-sand-deep' : 'bg-terracotta')} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">{n.title}</p>
                    <span className="shrink-0 text-2xs text-muted">{relative(n.created_at)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{n.body}</p>
                  {n.data?.photo && (
                    <img src={n.data.photo} alt="Delivery proof" className="mt-2.5 aspect-[4/3] w-full max-w-[220px] rounded-xl border border-sand object-cover" loading="lazy" />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
