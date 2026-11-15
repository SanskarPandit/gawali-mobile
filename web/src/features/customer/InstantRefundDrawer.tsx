import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { Camera, CheckCircle2, Clock, Droplets, FlaskRound, ImagePlus, Loader2, Truck } from 'lucide-react';
import clsx from 'clsx';
import { post, upload } from '@/lib/api';
import type { DayItem, RefundClaim } from '@/lib/types';
import { rupees } from '@/lib/format';
import { compressImage } from '@/lib/image';
import { Sheet } from '@/components/Sheet';
import { AIBadge, Button } from '@/components/ui';
import { ProductArt } from '@/components/ProductArt';
import { useToast } from '@/components/Toast';
import { useInvalidateCustomer } from './api';

type Step = 'issue' | 'photo' | 'verifying' | 'result';
const ISSUES = [
  { id: 'leaked', icon: Droplets, title: 'Leaked / Broken Seal', body: 'Pouch punctured, bottle cracked or cap seal broken.' },
  { id: 'curdled', icon: FlaskRound, title: 'Curdled Upon Boiling', body: 'Milk split, turned grainy or formed lumps when heated.' },
] as const;
const CHECKS = ['Reading photo', 'Checking packaging & texture', 'Matching to this morning’s batch', 'Crediting wallet'];

export function InstantRefundDrawer({ open, onClose, items, claims }: { open: boolean; onClose: () => void; items: DayItem[]; claims: Record<string, string> }) {
  const eligible = items.filter((i) => i.delivery_status === 'delivered' && i.delivery_id && !claims[i.delivery_id]);
  const [step, setStep] = useState<Step>('issue');
  const [issue, setIssue] = useState<'leaked' | 'curdled'>('leaked');
  const [deliveryId, setDeliveryId] = useState<string>('');
  const [file, setFile] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [check, setCheck] = useState(0);
  const [result, setResult] = useState<{ claim: RefundClaim; wallet_balance: number } | null>(null);
  const [backup, setBackup] = useState<{ eta_label: string; amount: number } | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const invalidate = useInvalidateCustomer();
  const started = useRef(0);

  useEffect(() => {
    if (!open) return;
    setStep('issue');
    setFile(null);
    setPreview('');
    setResult(null);
    setBackup(null);
    setError('');
    setDeliveryId(eligible[0]?.delivery_id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  useEffect(() => {
    if (step !== 'verifying') return;
    setCheck(0);
    const id = setInterval(() => setCheck((c) => Math.min(CHECKS.length - 1, c + 1)), 650);
    return () => clearInterval(id);
  }, [step]);

  const pick = async (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return setError('Please choose a photo.');
    if (f.size < 6 * 1024) return setError('That image is too small to verify. Retake it closer.');
    setError('');
    const small = await compressImage(f);
    setFile(small);
    setPreview(URL.createObjectURL(small));
  };

  const submit = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append('delivery_id', deliveryId);
      form.append('issue', issue);
      form.append('photo', file!, 'evidence.jpg');
      started.current = performance.now();
      return upload<{ claim: RefundClaim; wallet_balance: number }>('/api/v2/customer/refunds/', form);
    },
    onMutate: () => setStep('verifying'),
    onSuccess: async (r) => {
      const elapsed = performance.now() - started.current;
      if (elapsed < 1400) await new Promise((res) => setTimeout(res, 1400 - elapsed));
      setResult(r);
      setStep('result');
      invalidate();
    },
    onError: (e: Error) => {
      setError(e.message);
      setStep('photo');
    },
  });

  const rescue = useMutation({
    mutationFn: () => post<{ eta_label: string; amount: number }>(`/api/v2/customer/refunds/${result!.claim.id}/backup/`),
    onSuccess: (r) => {
      setBackup(r);
      invalidate();
      toast.show(`Backup milk arriving by ${r.eta_label}`);
    },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });

  const selected = eligible.find((i) => i.delivery_id === deliveryId);

  return (
    <Sheet open={open} onClose={onClose} title="Issue with today’s milk" subtitle="Photo-verified refunds in seconds. No chatbot, no waiting." size="md">
      {eligible.length === 0 && step === 'issue' ? (
        <div className="rounded-2xl bg-sand-soft p-5 text-sm text-ink/80">
          {items.some((i) => i.delivery_status === 'delivered') ? 'Today’s delivery already has a claim. You can see it in your wallet.' : 'Refunds open once today’s milk has been delivered.'}
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
            {step === 'issue' && (
              <div className="space-y-4">
                {eligible.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {eligible.map((i) => (
                      <button key={i.delivery_id} onClick={() => setDeliveryId(i.delivery_id!)}
                        className={clsx('rounded-full border px-3 py-1.5 text-xs font-medium', deliveryId === i.delivery_id ? 'border-ink bg-ink text-ivory' : 'border-sand')}>
                        {i.product.name}
                      </button>
                    ))}
                  </div>
                )}
                {selected && (
                  <div className="flex items-center gap-3 rounded-2xl bg-ivory p-3">
                    <ProductArt product={selected.product} className="size-11 shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{selected.product.name}</p>
                      <p className="num text-xs text-muted">Refund up to {rupees(selected.quantity * selected.product.price)}</p>
                    </div>
                  </div>
                )}
                {ISSUES.map((o) => (
                  <button key={o.id} onClick={() => { setIssue(o.id); setStep('photo'); }}
                    className="flex w-full items-start gap-3.5 rounded-2xl border border-sand p-4 text-left transition hover:border-ink">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-terracotta-soft text-terracotta"><o.icon className="size-5" strokeWidth={1.5} /></span>
                    <span className="min-w-0">
                      <span className="block font-medium">{o.title}</span>
                      <span className="mt-0.5 block text-sm text-muted">{o.body}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {step === 'photo' && (
              <div className="space-y-4">
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
                <button onClick={() => fileRef.current?.click()}
                  className={clsx('relative flex aspect-[4/3] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition',
                    preview ? 'border-transparent' : 'border-sand-deep bg-ivory hover:border-ink')}>
                  {preview ? (
                    <>
                      <img src={preview} alt="Evidence" className="absolute inset-0 size-full object-cover" />
                      <span className="absolute bottom-3 right-3 rounded-full bg-ink/80 px-3 py-1 text-xs text-ivory">Retake</span>
                    </>
                  ) : (
                    <>
                      <Camera className="size-8 text-muted" strokeWidth={1.25} />
                      <span className="mt-3 text-sm font-medium">Take a photo</span>
                      <span className="mt-1 px-6 text-center text-xs text-muted">
                        {issue === 'leaked' ? 'Show the pouch or bottle and where it leaked.' : 'Show the milk in the vessel so the texture is visible.'}
                      </span>
                    </>
                  )}
                </button>
                <ul className="grid grid-cols-3 gap-2 text-center text-2xs">
                  {[['Good light', !!preview], ['Clear focus', !!preview], ['Issue visible', !!preview]].map(([l, ok]) => (
                    <li key={l as string} className={clsx('rounded-xl px-2 py-2', ok ? 'bg-sage-soft text-sage-deep' : 'bg-sand-soft text-muted')}>
                      {ok ? '✓ ' : ''}{l}
                    </li>
                  ))}
                </ul>
                {error && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep('issue')}>Back</Button>
                  {!preview ? (
                    <Button block icon={<ImagePlus className="size-4" strokeWidth={1.75} />} onClick={() => fileRef.current?.click()}>Add photo</Button>
                  ) : (
                    <Button block variant="sage" onClick={() => submit.mutate()}>Verify & refund</Button>
                  )}
                </div>
              </div>
            )}

            {step === 'verifying' && (
              <div className="space-y-5 py-2">
                <div className="relative mx-auto aspect-[4/3] w-full overflow-hidden rounded-2xl">
                  {preview && <img src={preview} alt="" className="size-full object-cover" />}
                  <div className="absolute inset-0 bg-ink/20" />
                  <div className="absolute inset-x-0 h-16 animate-scan bg-gradient-to-b from-transparent via-sage/45 to-transparent" />
                </div>
                <ul className="space-y-2.5">
                  {CHECKS.map((c, i) => (
                    <li key={c} className={clsx('flex items-center gap-2.5 text-sm transition-colors', i <= check ? 'text-ink' : 'text-muted/60')}>
                      {i < check ? <CheckCircle2 className="size-4 text-sage" strokeWidth={1.75} /> : i === check ? <Loader2 className="size-4 animate-spin" strokeWidth={1.75} /> : <span className="size-4 rounded-full border border-sand-deep" />}
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {step === 'result' && result && (
              <div className="space-y-4">
                {result.claim.status === 'credited' ? (
                  <div className="rounded-3xl bg-sage-soft p-6 text-center">
                    <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                      className="mx-auto flex size-14 items-center justify-center rounded-full bg-sage text-ivory">
                      <CheckCircle2 className="size-7" strokeWidth={1.75} />
                    </motion.div>
                    <p className="num mt-4 text-3xl font-semibold tracking-tight text-sage-deep">{rupees(result.claim.amount)} credited</p>
                    <p className="num mt-1 text-sm text-sage-deep/80">
                      Verified in {(result.claim.processing_ms / 1000).toFixed(1)}s · wallet now {rupees(result.wallet_balance)}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-3xl bg-amber-soft p-6 text-center">
                    <Clock className="mx-auto size-8 text-amber" strokeWidth={1.5} />
                    <p className="mt-3 text-lg font-semibold">Sent to your dairy for a quick look</p>
                    <p className="mt-1 text-sm text-ink/70">The photo wasn’t conclusive. You’ll be notified as soon as it’s reviewed — usually within the hour.</p>
                  </div>
                )}
                <div className="rounded-2xl border border-sand p-4 text-sm">
                  <div className="mb-1.5 flex items-center justify-between"><span className="eyebrow">Vision check</span><AIBadge engine={result.claim.ai_engine} /></div>
                  <p className="text-ink/80">{result.claim.ai_observation}</p>
                </div>
                {backup ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-ink p-4 text-ivory">
                    <Truck className="size-5 shrink-0" strokeWidth={1.5} />
                    <p className="text-sm">Fresh milk is on its way from the nearest dark hub. Arriving by <span className="num font-semibold">{backup.eta_label}</span> · {rupees(backup.amount)} charged on delivery.</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-sand p-4">
                    <p className="font-medium">Need milk for breakfast?</p>
                    <p className="mt-0.5 text-sm text-muted">We can send a fresh replacement from the nearest dark hub in about 15 minutes.</p>
                    <Button className="mt-3" block variant="accent" loading={rescue.isPending} icon={<Truck className="size-4" strokeWidth={1.75} />} onClick={() => rescue.mutate()}>
                      Send emergency backup
                    </Button>
                  </div>
                )}
                <Button variant="outline" block onClick={onClose}>Done</Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </Sheet>
  );
}
