import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { get, post, qs } from '@/lib/api';
import type { RefundClaim } from '@/lib/types';
import { dateTime, rupees } from '@/lib/format';
import { AIBadge, Button, Card, EmptyState, ErrorState, PageHeader, Pill, Segmented, Skeleton, Stat } from '@/components/ui';
import { useToast } from '@/components/Toast';

interface Payload { claims: RefundClaim[]; stats: { credited_total: number; claims: number; auto_resolved: number; avg_seconds: number | null } }

export default function RefundsPage() {
  const [status, setStatus] = useState<'' | 'under_review' | 'credited' | 'rejected'>('');
  const q = useQuery({ queryKey: ['dairy', 'refunds', status], queryFn: () => get<Payload>(`/api/v2/dairy/refunds/${qs({ status })}`) });
  const qc = useQueryClient();
  const toast = useToast();
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => post<RefundClaim>(`/api/v2/dairy/refunds/${id}/decision/`, { approve }),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ['dairy'] }); toast.show(c.status === 'credited' ? `${rupees(c.amount)} credited to ${c.customer_name}` : 'Claim declined'); },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });
  const s = q.data?.stats;
  return (
    <div className="space-y-6">
      <PageHeader title="Instant refunds" sub="Vision AI resolves most claims in seconds. Flagged ones land here." />
      {s && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat label="Claims" value={s.claims} />
          <Stat label="Auto-resolved" value={s.auto_resolved} tone="sage" icon={<ShieldCheck className="size-4" />} />
          <Stat label="Credited" value={rupees(s.credited_total)} />
          <Stat label="Avg. resolution" value={s.avg_seconds != null ? `${s.avg_seconds}s` : '—'} sub="Target under 5 s" />
        </div>
      )}
      <Segmented value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'under_review', label: 'Needs review' }, { value: 'credited', label: 'Credited' }, { value: 'rejected', label: 'Declined' }]} />
      {q.isLoading ? <Skeleton className="h-80" /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.claims.length ? <Card><EmptyState icon={<ShieldCheck className="size-5" />} title="No claims here" /></Card> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {q.data.claims.map((c) => (
            <Card key={c.id} className="flex gap-4 p-4">
              {c.photo ? <a href={c.photo} target="_blank" rel="noreferrer" className="shrink-0"><img src={c.photo} alt="Evidence" className="size-24 rounded-xl border border-sand object-cover" /></a> : <div className="size-24 shrink-0 rounded-xl bg-sand-soft" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate font-medium">{c.customer_name}</p>
                  <Pill tone={c.status === 'credited' ? 'sage' : c.status === 'rejected' ? 'danger' : 'amber'}>{c.status.replace('_', ' ')}</Pill>
                </div>
                <p className="truncate text-xs text-muted">{c.issue_label} · {c.product_name} · {dateTime(c.created_at)}</p>
                <p className="mt-1.5 line-clamp-2 text-sm text-ink/80">{c.ai_observation}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="num text-sm font-semibold">{rupees(c.amount)}</span>
                  <AIBadge engine={c.ai_engine} />
                  <span className="num text-2xs text-muted">{Math.round(c.ai_confidence * 100)}% · {(c.processing_ms / 1000).toFixed(1)}s</span>
                </div>
                {c.status === 'under_review' && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="sage" loading={decide.isPending && decide.variables?.id === c.id && decide.variables.approve} onClick={() => decide.mutate({ id: c.id, approve: true })}>Approve & credit</Button>
                    <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: c.id, approve: false })}>Decline</Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
