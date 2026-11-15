import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowDownLeft, ArrowUpRight, Banknote, CheckCircle2, Landmark, Plus, Repeat, ShieldCheck, Zap } from 'lucide-react';
import clsx from 'clsx';
import { get, patch, post } from '@/lib/api';
import type { Txn, WalletInfo } from '@/lib/types';
import { dateTime, longDate, rupees } from '@/lib/format';
import { Button, Card, ErrorState, Input, Pill, Segmented, Skeleton, Toggle } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { keys } from './api';

interface WalletPayload extends WalletInfo { month_spent: number; month_credits: number; transactions: Txn[] }

function useWalletMutations() {
  const qc = useQueryClient();
  const done = () => { qc.invalidateQueries({ queryKey: keys.wallet }); qc.invalidateQueries({ queryKey: keys.home }); };
  return done;
}

function TopupSheet({ open, onClose, upi }: { open: boolean; onClose: () => void; upi: string }) {
  const [amount, setAmount] = useState('500');
  const [vpa, setVpa] = useState(upi);
  const [phase, setPhase] = useState<'form' | 'paying' | 'done'>('form');
  const done = useWalletMutations();
  const m = useMutation({
    mutationFn: async () => {
      setPhase('paying');
      const [r] = await Promise.all([post<{ transaction: Txn }>('/api/v2/customer/wallet/topup/', { amount, upi_id: vpa }), new Promise((res) => setTimeout(res, 1100))]);
      return r;
    },
    onSuccess: () => { setPhase('done'); done(); },
    onError: () => setPhase('form'),
  });
  useEffect(() => { if (open) { setPhase('form'); setVpa(upi); m.reset(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet open={open} onClose={onClose} title="Add money" subtitle="Instant UPI collect request · test mode" size="sm"
      footer={phase === 'done' ? <Button block onClick={onClose}>Done</Button> : <Button block size="lg" loading={phase === 'paying'} onClick={() => m.mutate()}>Pay {rupees(amount)} via UPI</Button>}>
      {phase === 'done' ? (
        <div className="py-6 text-center">
          <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="mx-auto flex size-14 items-center justify-center rounded-full bg-sage text-ivory"><CheckCircle2 className="size-7" strokeWidth={1.75} /></motion.div>
          <p className="num mt-4 text-2xl font-semibold">{rupees(amount)} added</p>
          <p className="mt-1 text-sm text-muted">Withdrawable any time — no deposit is locked.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            {['200', '500', '1000', '2000'].map((a) => (
              <button key={a} onClick={() => setAmount(a)} className={clsx('num rounded-xl border py-2.5 text-sm font-medium transition', amount === a ? 'border-ink bg-ink text-ivory' : 'border-sand hover:border-sand-deep')}>₹{a}</button>
            ))}
          </div>
          <Input label="Amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} error={m.error instanceof Error && /amount/i.test(m.error.message) ? m.error.message : undefined} />
          <Input label="UPI ID" value={vpa} onChange={(e) => setVpa(e.target.value)} placeholder="name@okhdfcbank" error={m.error instanceof Error && !/amount/i.test(m.error.message) ? m.error.message : undefined} />
        </div>
      )}
    </Sheet>
  );
}

function WithdrawSheet({ open, onClose, balance, dest }: { open: boolean; onClose: () => void; balance: number; dest: string }) {
  const [amount, setAmount] = useState(String(Math.floor(balance)));
  const [to, setTo] = useState(dest);
  const [ok, setOk] = useState<Txn | null>(null);
  const done = useWalletMutations();
  const m = useMutation({ mutationFn: () => post<{ transaction: Txn }>('/api/v2/customer/wallet/withdraw/', { amount, destination: to }), onSuccess: (r) => { setOk(r.transaction); done(); } });
  useEffect(() => { if (open) { setAmount(String(Math.max(0, Math.floor(balance)))); setTo(dest); setOk(null); m.reset(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet open={open} onClose={onClose} title="Withdraw to bank / UPI" subtitle="Your balance is always yours." size="sm"
      footer={ok ? <Button block onClick={onClose}>Done</Button> : <Button block size="lg" loading={m.isPending} disabled={balance <= 0} onClick={() => m.mutate()}>Withdraw {rupees(amount || 0)}</Button>}>
      {ok ? (
        <div className="py-6 text-center">
          <CheckCircle2 className="mx-auto size-12 text-sage" strokeWidth={1.5} />
          <p className="num mt-3 text-2xl font-semibold">{rupees(ok.amount)} sent</p>
          <p className="mt-1 text-sm text-muted">{ok.description}</p>
          <p className="num mt-2 font-mono text-xs text-muted">UTR {ok.reference}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <Input label={`Amount (available ${rupees(balance)})`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
          <Input label="UPI ID or bank account" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@okicici" />
          {m.error && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{(m.error as Error).message}</p>}
        </div>
      )}
    </Sheet>
  );
}

export function WalletAutopayView() {
  const q = useQuery({ queryKey: keys.wallet, queryFn: () => get<WalletPayload>('/api/v2/customer/wallet/') });
  const [filter, setFilter] = useState<'all' | 'credits' | 'debits'>('all');
  const [topup, setTopup] = useState(false);
  const [withdraw, setWithdraw] = useState(false);
  const [upi, setUpi] = useState('');
  const toast = useToast();
  const done = useWalletMutations();
  const save = useMutation({
    mutationFn: (body: Partial<WalletInfo>) => patch<WalletInfo>('/api/v2/customer/wallet/', body),
    onSuccess: () => { done(); toast.show('Billing preference saved'); },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });
  useEffect(() => { if (q.data) setUpi(q.data.autopay_upi_id || q.data.default_withdraw_upi); }, [q.data]);

  if (q.isLoading) return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const w = q.data;
  const autopay = w.billing_mode === 'autopay';
  const payOn = w.payments_enabled;
  const due = w.balance < 0;
  const txns = w.transactions.filter((t) => filter === 'all' || (filter === 'credits' ? t.direction === 'credit' : t.direction === 'debit'));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-ink p-6 text-ivory sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-terracotta/30 blur-3xl" />
          <div className="relative">
            <p className="eyebrow !text-ivory/50">{due ? 'Amount due to your dairy' : payOn ? 'Available balance' : 'Account balance'}</p>
            <p className="num mt-2 text-[2.6rem] font-semibold leading-none tracking-tight">{rupees(Math.abs(w.balance), { paise: true })}</p>
            <p className="mt-3 max-w-md text-sm text-ivory/70">
              {!payOn ? (due ? 'Deliveries are recorded here and settled with your dairy directly — cash or their UPI. Refunds and bottle credits reduce what you owe.' : 'Refunds and bottle credits are added here and adjusted against your next bills with the dairy.')
                : autopay ? 'UPI Autopay collects the exact amount after each delivery. This balance holds refunds and bottle credits.'
                : w.burn.covers_until ? <>Your balance of {rupees(w.balance)} covers your milk until <span className="font-medium text-ivory">{longDate(w.burn.covers_until)}</span>.</>
                  : 'Add money to keep tomorrow’s delivery running.'}
            </p>
            {payOn && <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="secondary" icon={<Plus className="size-4" strokeWidth={1.75} />} onClick={() => setTopup(true)}>Add money</Button>
              <Button className="border border-ivory/20 bg-transparent text-ivory hover:bg-ivory/10" icon={<Landmark className="size-4" strokeWidth={1.5} />} onClick={() => setWithdraw(true)}>Withdraw balance to bank / UPI</Button>
            </div>}
          </div>
        </section>

        <div className="grid grid-cols-3 gap-3">
          {[['Per day', rupees(w.burn.daily_average)], ['Next 7 days', rupees(w.burn.next_7_days)], ['Credits this month', rupees(w.month_credits)]].map(([l, v]) => (
            <Card key={l} className="min-w-0 p-4"><p className="eyebrow truncate">{l}</p><p className="num mt-1 truncate text-lg font-semibold">{v}</p></Card>
          ))}
        </div>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand p-4 sm:p-5">
            <h2 className="font-semibold">Transactions</h2>
            <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'credits', label: 'Credits' }, { value: 'debits', label: 'Debits' }]} />
          </div>
          <ul className="divide-y divide-sand">
            {txns.length === 0 && <li className="p-6 text-center text-sm text-muted">No transactions yet.</li>}
            {txns.map((t) => {
              const credit = t.direction === 'credit';
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-xl', credit ? 'bg-sage-soft text-sage' : 'bg-sand-soft text-ink/70')}>
                    {credit ? <ArrowDownLeft className="size-4" strokeWidth={1.75} /> : t.channel === 'autopay' ? <Repeat className="size-4" strokeWidth={1.75} /> : <ArrowUpRight className="size-4" strokeWidth={1.75} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.description}</p>
                    <p className="truncate text-xs text-muted">{t.kind_label} · {dateTime(t.created_at)}{t.channel === 'autopay' ? ' · via mandate' : ''}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={clsx('num text-sm font-semibold', credit && 'text-sage')}>{credit ? '+' : '−'}{rupees(t.amount)}</p>
                    {t.channel === 'wallet' && <p className="num text-2xs text-muted">{rupees(t.balance_after)}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <aside className="min-w-0 space-y-6">
        {!payOn ? (
          <Card className="p-5">
            <Pill tone="neutral">Online payments coming soon</Pill>
            <p className="mt-3 text-sm text-ink/80">For now, pay your dairy directly by cash or their UPI. They record it here, so your statement always matches.</p>
            <p className="mt-3 text-sm text-ink/80">Everything else works as usual: instant refunds, bottle-deposit credits and eco-credits all show up in this ledger.</p>
          </Card>
        ) : (<>
        <Card className="p-5">
          <p className="eyebrow">How you pay</p>
          <div className="mt-3 grid gap-2">
            {[
              { mode: 'autopay' as const, icon: Zap, title: 'UPI Autopay · e-NACH', body: 'Exact amount deducted after each delivery. Zero prepaid deposit.' },
              { mode: 'wallet' as const, icon: Banknote, title: 'Prepaid wallet', body: 'Top up when you like; we deduct per delivery.' },
            ].map((o) => (
              <button key={o.mode} onClick={() => o.mode !== w.billing_mode && save.mutate(o.mode === 'autopay' ? { billing_mode: 'autopay', autopay_upi_id: upi } : { billing_mode: 'wallet' })}
                className={clsx('flex items-start gap-3 rounded-2xl border p-4 text-left transition', w.billing_mode === o.mode ? 'border-ink bg-ivory' : 'border-sand hover:border-sand-deep')}>
                <o.icon className={clsx('mt-0.5 size-5 shrink-0', w.billing_mode === o.mode ? 'text-terracotta' : 'text-muted')} strokeWidth={1.5} />
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{o.title}</span><span className="mt-0.5 block text-xs text-muted">{o.body}</span></span>
                <span className={clsx('mt-1 size-4 shrink-0 rounded-full border-2', w.billing_mode === o.mode ? 'border-ink bg-ink shadow-[inset_0_0_0_2px_#FBF9F5]' : 'border-sand-deep')} />
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-end gap-2">
            <Input className="flex-1" label="Autopay UPI ID" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@okhdfcbank" />
            <Button variant="outline" loading={save.isPending} onClick={() => save.mutate({ autopay_upi_id: upi })}>Save</Button>
          </div>
          {autopay && (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-sage-soft px-3.5 py-2.5 text-xs text-sage-deep">
              <span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5" strokeWidth={1.75} /> Mandate {w.autopay_status} · max {rupees(w.autopay_max_daily)}/day</span>
              <button className="font-medium underline" onClick={() => save.mutate({ autopay_status: w.autopay_status === 'active' ? 'paused' : 'active' })}>{w.autopay_status === 'active' ? 'Pause' : 'Resume'}</button>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Smart auto top-up</p>
              <p className="mt-0.5 text-xs text-muted">Recharge {rupees(w.auto_topup_amount)} only when the balance drops below {rupees(w.auto_topup_threshold)}.</p>
            </div>
            <Toggle label="Auto top-up" checked={w.auto_topup_enabled} onChange={(v) => save.mutate({ auto_topup_enabled: v })} />
          </div>
          {w.auto_topup_enabled && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Input label="When below (₹)" defaultValue={String(w.auto_topup_threshold)} inputMode="numeric" onBlur={(e) => Number(e.target.value) !== w.auto_topup_threshold && save.mutate({ auto_topup_threshold: Number(e.target.value) })} />
              <Input label="Add (₹)" defaultValue={String(w.auto_topup_amount)} inputMode="numeric" onBlur={(e) => Number(e.target.value) !== w.auto_topup_amount && save.mutate({ auto_topup_amount: Number(e.target.value) })} />
            </div>
          )}
        </Card>

        </>)}
        <Card className="p-5">
          <Pill tone="sage" icon={<ShieldCheck className="size-3" strokeWidth={2} />}>Zero-lock promise</Pill>
          <p className="mt-2 text-sm text-ink/80">No security deposit is ever locked. Glass-bottle deposits are credited back the moment a bottle is collected.</p>
        </Card>
      </aside>

      {payOn && <><TopupSheet open={topup} onClose={() => setTopup(false)} upi={w.default_withdraw_upi || w.autopay_upi_id} />
      <WithdrawSheet open={withdraw} onClose={() => setWithdraw(false)} balance={w.balance} dest={w.default_withdraw_upi} /></>}
    </div>
  );
}

