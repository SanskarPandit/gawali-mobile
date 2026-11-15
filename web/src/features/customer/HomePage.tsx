import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, ChevronRight, Milk, Recycle, ShieldCheck, Wallet } from 'lucide-react';
import { useHome } from './api';
import { clock, plural, qty, rupees, shortDate } from '@/lib/format';
import { Button, Card, ErrorState, Pill, Skeleton } from '@/components/ui';
import { TomorrowHeroCard } from './TomorrowHeroCard';
import { CalendarRibbon } from './CalendarRibbon';
import { VacationSheet } from './VacationSheet';
import { DoorstepSheet } from './DoorstepSheet';
import { PurityPassportModal } from './PurityPassportModal';
import { InstantRefundDrawer } from './InstantRefundDrawer';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function HomePage() {
  const q = useHome();
  const [vacation, setVacation] = useState(false);
  const [doorstep, setDoorstep] = useState(false);
  const [passport, setPassport] = useState<{ open: boolean; id?: string }>({ open: false });
  const [refund, setRefund] = useState(false);

  if (q.isLoading) {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5"><Skeleton className="h-[420px]" /><Skeleton className="h-40" /></div>
        <div className="space-y-5"><Skeleton className="h-44" /><Skeleton className="h-44" /></div>
      </div>
    );
  }
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const home = q.data;
  if (home.needs_onboarding) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <p className="text-lg font-semibold">Choose your dairy to begin</p>
        <p className="mt-1 text-sm text-muted">Pick a dairy that delivers to you in Account, then start a daily plan.</p>
        <Link to="/app/account"><Button className="mt-5">Open account</Button></Link>
      </Card>
    );
  }

  const today = home.today;
  const deliveredToday = today.status === 'delivered';
  const w = home.wallet;
  const payOn = home.payments_enabled;
  const lowBalance = payOn && w.billing_mode === 'wallet' && w.burn.daily_average > 0 && w.balance < w.burn.daily_average * 2;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">{greeting()}, {home.first_name}</p>
      </div>
      {(home.dues.over_limit || home.dues.near_limit) && (
        <div className={home.dues.over_limit ? 'rounded-2xl border border-danger/25 bg-danger-soft p-4' : 'rounded-2xl border border-amber/25 bg-amber-soft p-4'}>
          <p className={home.dues.over_limit ? 'font-medium text-danger' : 'font-medium text-amber'}>
            {home.dues.over_limit ? `₹${Math.round(home.dues.due).toLocaleString('en-IN')} is due — new add-ons are paused` : `₹${Math.round(home.dues.due).toLocaleString('en-IN')} due — close to your ₹${Math.round(home.dues.credit_limit).toLocaleString('en-IN')} limit`}
          </p>
          <p className="mt-0.5 text-sm text-ink/75">
            {home.dues.over_limit && home.dues.hold_enabled ? `Your next deliveries will be held after the cutoff until you settle with ${home.dairy.name}.` : `Please settle with ${home.dairy.name} by cash or their UPI. They will record it here.`}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <TomorrowHeroCard home={home} onDoorstep={() => setDoorstep(true)} onRefetch={() => q.refetch()} />
          <CalendarRibbon home={home} onVacation={() => setVacation(true)} onPassport={home.passport_enabled ? (id) => setPassport({ open: true, id }) : undefined} />

          <Card className="overflow-hidden">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              {deliveredToday && today.proof_photo ? (
                <img src={today.proof_photo} alt="This morning’s drop-off" className="aspect-[4/3] w-full shrink-0 rounded-xl border border-sand object-cover sm:w-36" />
              ) : (
                <div className="flex aspect-[4/3] w-full shrink-0 items-center justify-center rounded-xl bg-sand-soft sm:w-36">
                  <Milk className="size-8 text-muted" strokeWidth={1.25} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="eyebrow">This morning</p>
                  {deliveredToday ? <Pill tone="sage" icon={<Check className="size-3" strokeWidth={2.5} />}>Delivered {today.delivered_at ? clock(today.delivered_at) : ''}</Pill>
                    : today.status === 'scheduled' ? <Pill tone="amber">On the way</Pill> : <Pill>No delivery today</Pill>}
                </div>
                <p className="mt-1.5 truncate font-medium">
                  {today.items.filter((i) => i.quantity > 0).map((i) => `${qty(i.quantity)} × ${i.product.name}`).join(', ') || 'Nothing scheduled'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {home.passport_enabled && (
                    <Button size="sm" variant="outline" icon={<ShieldCheck className="size-3.5 text-sage" strokeWidth={1.75} />} onClick={() => setPassport({ open: true, id: today.items[0]?.delivery_id })}>
                      Purity passport
                    </Button>
                  )}
                  {deliveredToday && (
                    <Button size="sm" variant="outline" icon={<AlertTriangle className="size-3.5 text-amber" strokeWidth={1.75} />} onClick={() => setRefund(true)}>
                      Issue with today’s milk
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <aside className="min-w-0 space-y-6">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow flex items-center gap-1.5"><Wallet className="size-3.5" strokeWidth={1.75} /> Wallet</p>
              <Pill tone={!payOn ? 'outline' : w.billing_mode === 'autopay' ? 'sage' : 'outline'}>{!payOn ? (w.balance < 0 ? 'Due to dairy' : 'Credit') : w.billing_mode === 'autopay' ? 'UPI Autopay' : 'Prepaid'}</Pill>
            </div>
            <p className="num mt-2 text-3xl font-semibold tracking-tight">{rupees(Math.abs(w.balance))}</p>
            <p className="mt-1.5 text-sm text-muted">
              {!payOn
                ? `About ${rupees(w.burn.daily_average)} a day · settle with ${home.dairy.name} directly.`
                : w.billing_mode === 'autopay'
                ? `About ${rupees(w.burn.daily_average)} is deducted after each delivery. No deposit held.`
                : w.burn.covers_until
                  ? <>Covers your milk until <span className="font-medium text-ink">{shortDate(w.burn.covers_until)}</span> · {rupees(w.burn.daily_average)}/day</>
                  : 'Add money to keep deliveries running.'}
            </p>
            {lowBalance && <p className="mt-3 rounded-xl bg-amber-soft px-3 py-2 text-xs text-amber">Low balance — less than two days left.</p>}
            <Link to="/app/wallet" className="mt-4 flex items-center justify-between rounded-xl bg-sand-soft px-3.5 py-2.5 text-sm font-medium transition hover:bg-sand">
              {payOn ? 'Top up, autopay & withdraw' : 'View statement'} <ArrowRight className="size-4" strokeWidth={1.5} />
            </Link>
          </Card>

          <Link to="/app/bottles" className="block">
            <Card className="p-5 transition hover:shadow-lift">
              <div className="flex items-center justify-between">
                <p className="eyebrow flex items-center gap-1.5"><Recycle className="size-3.5" strokeWidth={1.75} /> Circular packaging</p>
                <ChevronRight className="size-4 text-muted" strokeWidth={1.5} />
              </div>
              <p className="num mt-2 text-lg font-semibold">{plural(home.bottles.with_you, 'glass bottle')} with you</p>
              <p className="num text-sm text-muted">Deposit {rupees(home.bottles.deposit_held)} · refunded on return</p>
              <div className="mt-3">
                <div className="flex justify-between text-2xs text-muted">
                  <span>Pouch eco-credit</span>
                  <span className="num">{10 - home.bottles.pouches_to_next_credit}/10</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sand">
                  <div className="h-full rounded-full bg-sage transition-all" style={{ width: `${(10 - home.bottles.pouches_to_next_credit) * 10}%` }} />
                </div>
              </div>
            </Card>
          </Link>

          {home.vacations.length > 0 && (
            <Card className="p-5">
              <p className="eyebrow">Upcoming vacation</p>
              {home.vacations.map((v) => (
                <p key={v.id} className="num mt-1.5 text-sm font-medium">{shortDate(v.start_date)} – {shortDate(v.end_date)} · {plural(v.days, 'day')}</p>
              ))}
              <Link to="/app/plan" className="mt-2 inline-block text-xs font-medium text-terracotta hover:underline">Manage</Link>
            </Card>
          )}
        </aside>
      </div>

      <VacationSheet open={vacation} onClose={() => setVacation(false)} from={home.cutoff.governs_date} />
      <DoorstepSheet open={doorstep} onClose={() => setDoorstep(false)} doorstep={home.doorstep} />
      {home.passport_enabled && <PurityPassportModal open={passport.open} deliveryId={passport.id} onClose={() => setPassport({ open: false })} />}
      <InstantRefundDrawer open={refund} onClose={() => setRefund(false)} items={today.items} claims={today.refund_claims ?? {}} />
    </div>
  );
}
