import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { BadgeCheck, Download, FlaskConical, Snowflake, Timer } from 'lucide-react';
import { download, get, qs } from '@/lib/api';
import type { Passport } from '@/lib/types';
import { shortDate } from '@/lib/format';
import { Sheet } from '@/components/Sheet';
import { TemperatureCurve } from '@/components/TemperatureCurve';
import { Button, ErrorState, Pill, Skeleton } from '@/components/ui';
import { useToast } from '@/components/Toast';

export function PassportBody({ p, internal = false }: { p: Passport; internal?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const screen = [
    ['Water', p.lab.water],
    ['Detergent', p.lab.detergent],
    ['Starch', p.lab.starch],
    ['Urea', p.lab.urea],
  ] as const;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {p.status === 'passed' && p.lab.adulteration_free ? (
          <Pill tone="sage" icon={<BadgeCheck className="size-3.5" strokeWidth={1.75} />}>Certified pure</Pill>
        ) : (
          <Pill tone="danger">Batch {p.status}</Pill>
        )}
        <Pill tone="outline">Batch {p.code}</Pill>
        {p.product_name && <Pill tone="outline">{p.product_name}</Pill>}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-sand bg-ivory p-4 sm:col-span-3">
          <p className="eyebrow flex items-center gap-1.5"><Timer className="size-3.5" strokeWidth={1.75} /> Milking timestamp</p>
          <p className="mt-1 text-sm font-medium">{p.milked_label}</p>
        </div>
        {[
          ['Chilled within', `${p.minutes_to_chill} min`],
          ['Chilled to', p.chill_temp != null ? `${p.chill_temp.toFixed(1)}°C` : '—'],
          ['Held between', p.temp_min != null ? `${p.temp_min.toFixed(1)}–${p.temp_max!.toFixed(1)}°C` : '—'],
        ].map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-sand p-4">
            <p className="eyebrow">{l}</p>
            <p className="num mt-1 text-lg font-semibold">{v}</p>
          </div>
        ))}
      </div>

      {!internal && <div className="rounded-2xl border border-sand p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="eyebrow flex items-center gap-1.5"><Snowflake className="size-3.5" strokeWidth={1.75} /> Cold-chain transit curve</p>
          {p.cold_chain_ok ? <Pill tone="sage">Within safe band throughout</Pill> : <Pill tone="amber">Excursion recorded</Pill>}
        </div>
        <TemperatureCurve passport={p} />
      </div>}

      <div className="rounded-2xl border border-sand p-4">
        <p className="eyebrow mb-3 flex items-center gap-1.5"><FlaskConical className="size-3.5" strokeWidth={1.75} /> Lab quality metrics</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['Fat content', p.lab.fat, 'Unadulterated natural range'],
            ['Solids-not-fat', p.lab.snf, 'FSSAI minimum 8.5%'],
          ].map(([l, v, s]) => (
            <div key={l as string} className="min-w-0">
              <p className="text-xs text-muted">{l}</p>
              <p className="num text-2xl font-semibold tracking-tight">{(v as number).toFixed(1)}%</p>
              <p className="truncate text-2xs text-muted">{s}</p>
            </div>
          ))}
        </div>
        <p className="mb-2 mt-4 text-xs font-medium">Adulteration screen</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {screen.map(([l, v], i) => (
            <motion.div key={l} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.06 }}
              className={v === 0 ? 'rounded-xl bg-sage-soft px-3 py-2' : 'rounded-xl bg-danger-soft px-3 py-2'}>
              <p className="text-2xs text-muted">{l}</p>
              <p className={`num text-sm font-semibold ${v === 0 ? 'text-sage-deep' : 'text-danger'}`}>{v.toFixed(2)}%</p>
            </motion.div>
          ))}
        </div>
        <p className="mt-3 text-2xs text-muted">
          Tested by {p.lab.lab_name}{p.lab.certified_by ? ` · certified by ${p.lab.certified_by}` : ''} · for delivery {shortDate(p.delivery_date)}
        </p>
      </div>

      {!internal && <Button
        block
        size="lg"
        loading={busy}
        icon={<Download className="size-4" strokeWidth={1.75} />}
        onClick={async () => {
          setBusy(true);
          try {
            await download(`/api/v2/batches/${p.id}/pdf/`, `purity-passport-${p.code}.pdf`);
            toast.show('Certificate downloaded');
          } catch (e) {
            toast.show((e as Error).message, { kind: 'error' });
          } finally {
            setBusy(false);
          }
        }}
      >
        Download lab certificate (PDF)
      </Button>}
    </div>
  );
}

export function PurityPassportModal({ open, onClose, deliveryId }: { open: boolean; onClose: () => void; deliveryId?: string }) {
  const q = useQuery({
    queryKey: ['customer', 'passport', deliveryId ?? 'latest'],
    queryFn: () => get<Passport>(`/api/v2/customer/passport/${qs({ delivery_id: deliveryId })}`),
    enabled: open,
  });
  return (
    <Sheet open={open} onClose={onClose} title="Batch Purity Passport" subtitle="Live certificate for the milk at your door" size="lg">
      {q.isLoading ? (
        <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-48" /><Skeleton className="h-40" /></div>
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        q.data && <PassportBody p={q.data} />
      )}
    </Sheet>
  );
}
