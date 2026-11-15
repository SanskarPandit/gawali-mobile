import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { BellOff, Camera, Check, ChevronDown, DoorOpen, KeyRound, MapPin, Navigation, Phone, RotateCcw, Sparkles, Undo2, XCircle, Zap } from 'lucide-react';
import clsx from 'clsx';
import { get, post, upload } from '@/lib/api';
import type { LoadLine, Stop } from '@/lib/types';
import { clock, plural, qty, rupees } from '@/lib/format';
import { compressImage } from '@/lib/image';
import { AIBadge, Button, Card, EmptyState, ErrorState, Pill, Segmented, Skeleton, Stepper, Textarea } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { ProductArt } from '@/components/ProductArt';
import { useToast } from '@/components/Toast';

interface RouteData {
  date: string; is_today: boolean;
  partner: { name: string; vehicle_number: string; route_name: string };
  dairy: { name: string; phone: string; hub_name: string; slot: string };
  progress: { total: number; delivered: number; missed: number; pending: number };
  stops: Stop[]; load_sheet: LoadLine[];
}

function CompleteSheet({ stop, onClose }: { stop: Stop | null; onClose: () => void }) {
  const [bottles, setBottles] = useState(0);
  const [pouches, setPouches] = useState(0);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(() => { if (stop) { setBottles(stop.bottles_with_customer); setPouches(0); setNote(''); setPhoto(null); setPreview(''); } }, [stop]);
  const m = useMutation({
    mutationFn: (outcome: 'delivered' | 'missed') => {
      const f = new FormData();
      f.append('outcome', outcome);
      f.append('bottles_returned', String(bottles));
      f.append('pouches_returned', String(pouches));
      if (note) f.append('note', note);
      if (photo && outcome === 'delivered') f.append('photo', photo, 'proof.jpg');
      return upload<{ outcome: string; charged: number; deposit_returned?: number; eco_credit?: number }>(`/api/v2/delivery/stops/${stop!.customer_id}/complete/`, f);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['delivery'] });
      toast.show(r.outcome === 'delivered' ? `Delivered · ${rupees(r.charged)} settled${r.deposit_returned ? ` · ${rupees(r.deposit_returned)} deposit returned` : ''}` : 'Marked as missed · customer notified');
      onClose();
    },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });
  if (!stop) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const needsPhoto = stop.doorstep.photo_proof;
  return (
    <Sheet open={!!stop} onClose={onClose} title={stop.name} subtitle={`${stop.flat} · ${stop.society_name || stop.address}`}
      footer={<div className="flex gap-2">
        <Button variant="outline" icon={<XCircle className="size-4" strokeWidth={1.5} />} loading={m.isPending && m.variables === 'missed'} onClick={() => m.mutate('missed')}>Missed</Button>
        <Button block size="lg" variant="sage" icon={<Check className="size-4" strokeWidth={2} />} disabled={needsPhoto && !photo} loading={m.isPending && m.variables === 'delivered'} onClick={() => m.mutate('delivered')}>
          {needsPhoto && !photo ? 'Add photo to complete' : 'Mark delivered'}
        </Button>
      </div>}>
      <div className="space-y-5">
        <ul className="divide-y divide-sand rounded-2xl border border-sand">
          {[...stop.items.filter((i) => i.quantity > 0).map((i) => ({ k: i.delivery_id, p: i.product, q: i.quantity, x: false })), ...stop.orders.map((o) => ({ k: o.id, p: o.product, q: o.quantity, x: o.is_express }))].map((l) => (
            <li key={l.k} className="flex items-center gap-3 p-3"><ProductArt product={l.p} className="size-10 shrink-0" iconClass="size-5" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{l.p.name} <span className="text-muted">{l.p.unit}</span></span>{l.x && <Pill tone="amber">Express</Pill>}<span className="num text-lg font-semibold">×{qty(l.q)}</span></li>
          ))}
        </ul>
        <div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const b = await compressImage(f); setPhoto(b); setPreview(URL.createObjectURL(b)); }} />
          <button onClick={() => fileRef.current?.click()} className={clsx('relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed', preview ? 'border-transparent' : 'border-sand-deep bg-ivory')}>
            {preview ? <img src={preview} alt="Proof" className="absolute inset-0 size-full object-cover" /> : <span className="flex flex-col items-center text-sm text-muted"><Camera className="mb-2 size-7" strokeWidth={1.25} />Drop-off photo {needsPhoto ? '(required)' : '(optional)'}</span>}
          </button>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-sand p-4">
          <div><p className="text-sm font-medium">Empty bottles collected</p><p className="text-xs text-muted">{plural(stop.bottles_with_customer, 'bottle')} at this home · ₹10 credited each</p></div>
          <Stepper value={bottles} min={0} max={stop.bottles_with_customer} onChange={setBottles} />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-sand p-4">
          <div><p className="text-sm font-medium">Clean pouches collected</p><p className="text-xs text-muted">Every 10 earns the customer an eco-credit</p></div>
          <Stepper value={pouches} min={0} max={100} onChange={setPouches} />
        </div>
        <Textarea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Left with security" />
      </div>
    </Sheet>
  );
}

function StopCard({ s, index, onOpen, onReopen }: { s: Stop; index: number; onOpen: () => void; onReopen: () => void }) {
  const done = s.status === 'delivered';
  const maps = s.latitude && s.longitude ? `https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.flat} ${s.society_name} ${s.address}`)}`;
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 8) * 0.03 }}>
      <Card className={clsx('p-4', done && 'bg-ivory/70', s.is_express && !done && 'border-amber/40')}>
        <div className="flex items-start gap-3">
          <span className={clsx('num flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold', done ? 'bg-sage text-ivory' : s.status === 'missed' ? 'bg-danger-soft text-danger' : 'bg-ink text-ivory')}>
            {done ? <Check className="size-4" strokeWidth={2.5} /> : s.stop_order}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate font-medium">{s.name}</p>
              {s.is_express && !done && <Pill tone="amber" icon={<Zap className="size-3" />}>Express · first</Pill>}
              {s.status === 'missed' && <Pill tone="danger">Missed</Pill>}
              {done && s.delivered_at && <Pill tone="sage">{clock(s.delivered_at)}</Pill>}
            </div>
            <p className="flex items-center gap-1 truncate text-xs text-muted"><MapPin className="size-3 shrink-0" />{s.flat} · {s.society_name || s.address}</p>
          </div>
        </div>
        <p className="mt-3 text-sm">{[...s.items.filter((i) => i.quantity > 0).map((i) => `${qty(i.quantity)}× ${i.product.name}`), ...s.orders.map((o) => `${qty(o.quantity)}× ${o.product.name}`)].join(' · ')}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {s.doorstep.silent_delivery && <Pill tone="ink" icon={<BellOff className="size-3" />}>Don’t ring</Pill>}
          {s.doorstep.use_gate_hook && <Pill icon={<DoorOpen className="size-3" />}>Gate hook bag</Pill>}
          {s.doorstep.photo_proof && <Pill icon={<Camera className="size-3" />}>Photo</Pill>}
          {s.gate_token && <Pill tone="sage" icon={<KeyRound className="size-3" />}><span className="font-mono tracking-wider">Gate {s.gate_token}</span></Pill>}
          {s.bottles_with_customer > 0 && <Pill tone="terracotta" icon={<RotateCcw className="size-3" />}>Collect {s.bottles_with_customer} bottles</Pill>}
        </div>
        {s.instructions && <p className="mt-2 rounded-xl bg-sand-soft px-3 py-2 text-xs text-ink/80">“{s.instructions}”</p>}
        {!done && (
          <div className="mt-4 flex gap-2">
            <a href={maps} target="_blank" rel="noreferrer"><Button variant="outline" size="md" aria-label="Navigate" className="!px-3"><Navigation className="size-4" strokeWidth={1.5} /></Button></a>
            {s.phone && <a href={`tel:${s.phone}`}><Button variant="outline" size="md" aria-label="Call" className="!px-3"><Phone className="size-4" strokeWidth={1.5} /></Button></a>}
            {s.status === 'missed' ? <Button block variant="secondary" icon={<Undo2 className="size-4" />} onClick={onReopen}>Reopen stop</Button> : <Button block onClick={onOpen}>Complete drop</Button>}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

export default function RoutePage() {
  const [when, setWhen] = useState<'today' | 'tomorrow'>('today');
  const date = when === 'today' ? undefined : new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const q = useQuery({ queryKey: ['delivery', 'route', when], queryFn: () => get<RouteData>(`/api/v2/delivery/route/${date ? `?date=${date}` : ''}`), refetchInterval: 45_000 });
  const brief = useQuery({ queryKey: ['delivery', 'brief'], queryFn: () => get<{ engine: string; text: string; pending?: boolean }>('/api/v2/delivery/brief/'), staleTime: 600_000, enabled: when === 'today',
    refetchInterval: (query) => (query.state.data?.pending && query.state.dataUpdateCount < 6 ? 3000 : false) });
  const [active, setActive] = useState<Stop | null>(null);
  const [showLoad, setShowLoad] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const reopen = useMutation({ mutationFn: (id: string) => post(`/api/v2/delivery/stops/${id}/reopen/`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery'] }); toast.show('Stop reopened'); }, onError: (e: Error) => toast.show(e.message, { kind: 'error' }) });

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const pct = d.progress.total ? d.progress.delivered / d.progress.total : 0;
  const pending = d.stops.filter((s) => s.status !== 'delivered');
  const done = d.stops.filter((s) => s.status === 'delivered');

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-ink p-5 text-ivory">
        <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-sage/30 blur-3xl" />
        <div className="relative flex items-center gap-5">
          <svg viewBox="0 0 80 80" className="size-20 shrink-0 -rotate-90">
            <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(251,249,245,.15)" strokeWidth="7" />
            <motion.circle cx="40" cy="40" r="34" fill="none" stroke="#7CC492" strokeWidth="7" strokeLinecap="round" strokeDasharray={213.6} initial={{ strokeDashoffset: 213.6 }} animate={{ strokeDashoffset: 213.6 * (1 - pct) }} transition={{ duration: 0.8 }} />
          </svg>
          <div className="min-w-0">
            <p className="text-xs text-ivory/60">{d.partner.route_name} · {d.dairy.slot}</p>
            <p className="num mt-0.5 text-2xl font-semibold">{d.progress.delivered}/{d.progress.total} drops</p>
            <p className="text-xs text-ivory/60">{d.progress.pending} pending{d.progress.missed ? ` · ${d.progress.missed} missed` : ''} · {d.partner.vehicle_number}</p>
          </div>
        </div>
      </section>

      <Segmented className="w-full" value={when} onChange={setWhen} options={[{ value: 'today', label: 'Today' }, { value: 'tomorrow', label: 'Tomorrow (preview)' }]} />

      {when === 'today' && brief.data && (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between"><p className="flex items-center gap-1.5 text-sm font-medium"><Sparkles className="size-4 text-terracotta" strokeWidth={1.5} />Morning briefing</p><AIBadge engine={brief.data.engine} /></div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink/80">{brief.data.text}</p>
        </Card>
      )}

      <Card>
        <button onClick={() => setShowLoad((x) => !x)} className="flex w-full items-center justify-between p-4 text-left">
          <span><span className="block text-sm font-medium">Load sheet</span><span className="text-xs text-muted">{d.load_sheet.length} products to pick up at {d.dairy.hub_name}</span></span>
          <ChevronDown className={clsx('size-4 text-muted transition', showLoad && 'rotate-180')} />
        </button>
        <AnimatePresence initial={false}>
          {showLoad && (
            <motion.ul initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden border-t border-sand">
              {d.load_sheet.map((l) => <li key={l.product.id} className="flex items-center justify-between px-4 py-2.5 text-sm"><span className="min-w-0 truncate">{l.product.name} <span className="text-muted">{l.product.unit}</span></span><span className="num font-semibold">{qty(l.quantity)}</span></li>)}
            </motion.ul>
          )}
        </AnimatePresence>
      </Card>

      {d.stops.length === 0 ? <Card><EmptyState icon={<MapPin className="size-5" />} title="No stops" body="Nothing is scheduled on your route." /></Card> : (
        <div className="space-y-3">
          {pending.length === 0 && d.is_today && <Card className="bg-sage-soft p-5 text-center"><p className="font-semibold text-sage-deep">Route complete</p><p className="text-sm text-sage-deep/80">Every household has its milk. Thank you!</p></Card>}
          {pending.map((s, i) => <StopCard key={s.customer_id} s={s} index={i} onOpen={() => d.is_today ? setActive(s) : toast.show('Stops open on the morning of delivery.', { kind: 'info' })} onReopen={() => reopen.mutate(s.customer_id)} />)}
          {done.length > 0 && (
            <>
              <button onClick={() => setShowDone((x) => !x)} className="flex w-full items-center justify-between px-1 pt-2 text-sm font-medium text-muted">Completed ({done.length})<ChevronDown className={clsx('size-4 transition', showDone && 'rotate-180')} /></button>
              {showDone && done.map((s, i) => <StopCard key={s.customer_id} s={s} index={i} onOpen={() => undefined} onReopen={() => undefined} />)}
            </>
          )}
        </div>
      )}
      <CompleteSheet stop={active} onClose={() => setActive(null)} />
    </div>
  );
}
