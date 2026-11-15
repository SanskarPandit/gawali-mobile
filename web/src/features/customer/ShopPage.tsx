import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CalendarPlus, History, Repeat, Search, Sparkles, Star, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import { post } from '@/lib/api';
import type { ShopProduct } from '@/lib/types';
import { addDays, dayLabel, rupees, shortDate, weekday } from '@/lib/format';
import { AIBadge, Button, EmptyState, ErrorState, PageHeader, Pill, SectionTitle, Skeleton, Stepper } from '@/components/ui';
import { ProductArt, animalLabel, containerLabel } from '@/components/ProductArt';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { keys, useInvalidateCustomer } from './api';
import { useShop } from './shopApi';
import { useQueryClient } from '@tanstack/react-query';

function ProductCard({ p, onOpen, wide }: { p: ShopProduct; onOpen: () => void; wide?: boolean }) {
  return (
    <button onClick={onOpen} className={clsx('group flex min-w-0 shrink-0 snap-start flex-col rounded-2xl border border-sand bg-milk p-3 text-left transition hover:-translate-y-0.5 hover:shadow-lift', wide ? 'w-[15.5rem]' : 'w-full')}>
      <div className="relative">
        <ProductArt product={p} className="aspect-[4/3] w-full" iconClass="size-9" />
        <div className="absolute left-2 top-2 flex gap-1">
          {p.is_new && <Pill tone="ink" className="!py-0.5">New</Pill>}
          {p.subscribed && <Pill tone="sage" className="!py-0.5">Daily</Pill>}
        </div>
      </div>
      <p className="mt-3 truncate text-sm font-medium">{p.name}</p>
      <p className="truncate text-xs text-muted">{p.unit} · {containerLabel(p.container)}{animalLabel(p.animal) ? ` · ${animalLabel(p.animal)}` : ''}</p>
      {p.reason && <p className="mt-2 line-clamp-2 min-h-[2rem] text-xs leading-4 text-ink/70">{p.reason}</p>}
      {p.times_ordered ? <p className="mt-2 text-2xs text-muted">Ordered {p.times_ordered}× · last {shortDate(p.last_ordered!)}</p> : null}
      <div className="mt-auto flex items-center justify-between pt-3">
        <span className="num text-sm font-semibold">{rupees(p.price)}</span>
        <span className="rounded-lg bg-sand-soft px-2.5 py-1 text-2xs font-medium transition group-hover:bg-ink group-hover:text-ivory">Add</span>
      </div>
    </button>
  );
}

function Rail({ title, sub, icon, items, onOpen, action }: { title: string; sub?: string; icon: React.ReactNode; items: ShopProduct[]; onOpen: (p: ShopProduct) => void; action?: React.ReactNode }) {
  if (!items.length) return null;
  return (
    <section>
      <SectionTitle title={<span className="flex items-center gap-2">{icon}{title}</span>} sub={sub} action={action} />
      <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        {items.map((p) => <ProductCard key={p.id} p={p} wide onOpen={() => onOpen(p)} />)}
      </div>
    </section>
  );
}

function ProductSheet({ p, from, onClose }: { p: ShopProduct | null; from: string; onClose: () => void }) {
  const [quantity, setQuantity] = useState(1);
  const [date, setDate] = useState(from);
  const toast = useToast();
  const invalidate = useInvalidateCustomer();
  const qc = useQueryClient();
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const today = addDays(from, -1);
  const once = useMutation({
    mutationFn: () => post('/api/v2/customer/orders/', { product_id: p!.id, quantity, date, source: 'shop' }),
    onSuccess: () => { invalidate(); toast.show(`${p!.name} added to ${dayLabel(date, today)}`); onClose(); },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });
  const daily = useMutation({
    mutationFn: () => post('/api/v2/customer/subscriptions/', { product_id: p!.id, quantity, start_date: date }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: keys.shop }); toast.show(`Subscribed · ${p!.name} daily from ${shortDate(date)}`); onClose(); },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });

  return (
    <Sheet open={!!p} onClose={() => { onClose(); setQuantity(1); setDate(from); }} title={p?.name} subtitle={p ? `${p.unit} · ${containerLabel(p.container)}` : ''}
      footer={p && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" block loading={daily.isPending} disabled={p.subscribed} icon={<Repeat className="size-4" strokeWidth={1.75} />} onClick={() => daily.mutate()}>
            {p.subscribed ? 'Already daily' : 'Subscribe daily'}
          </Button>
          <Button block loading={once.isPending} icon={<CalendarPlus className="size-4" strokeWidth={1.75} />} onClick={() => once.mutate()}>
            Add once · {rupees(p.price * quantity)}
          </Button>
        </div>
      )}>
      {p && (
        <div className="space-y-5">
          <ProductArt product={p} className="aspect-[16/9] w-full" iconClass="size-14" />
          {p.description && <p className="text-sm leading-relaxed text-ink/80">{p.description}</p>}
          {p.reason && <p className="flex gap-2 rounded-xl bg-terracotta-soft px-3.5 py-2.5 text-sm text-terracotta-deep"><Sparkles className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />{p.reason}</p>}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="label !mb-0">Quantity</p>
              <p className="num text-xs text-muted">{rupees(p.price)} each{p.fat_percent ? ` · ${p.fat_percent}% fat` : ''}</p>
            </div>
            <Stepper value={quantity} min={p.step || 1} step={p.step || 1} onChange={setQuantity} />
          </div>
          <div>
            <p className="label">Deliver on</p>
            <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {days.map((d) => (
                <button key={d} onClick={() => setDate(d)} className={clsx('flex w-14 shrink-0 flex-col items-center rounded-xl border py-2 transition', d === date ? 'border-ink bg-ink text-ivory' : 'border-sand hover:border-sand-deep')}>
                  <span className="text-2xs opacity-70">{weekday(d)}</span>
                  <span className="num text-base font-semibold">{d.slice(8)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

export default function ShopPage() {
  const shop = useShop();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const [open, setOpen] = useState<ShopProduct | null>(null);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (shop.data?.all ?? []).filter((p) => (cat === 'all' || p.category === cat) && (!s || `${p.name} ${p.description}`.toLowerCase().includes(s)));
  }, [shop.data, search, cat]);

  if (shop.isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;
  if (shop.error || !shop.data) return <ErrorState error={shop.error} onRetry={() => shop.refetch()} />;
  const d = shop.data;
  const browsing = search.trim() || cat !== 'all';

  return (
    <div className="space-y-8">
      <PageHeader title="Shop" sub={`Delivered with your milk · next open day ${shortDate(d.editable_from)}`} />
      <div className="-mt-4 space-y-3">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" strokeWidth={1.5} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search paneer, A2 milk, sourdough…" className="field pl-10" aria-label="Search products" />
        </div>
        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {[{ id: 'all', label: 'All' }, ...d.categories].map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)} className={clsx('shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition', cat === c.id ? 'border-ink bg-ink text-ivory' : 'border-sand bg-milk hover:border-sand-deep')}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {browsing ? (
        filtered.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((p) => <ProductCard key={p.id} p={p} onOpen={() => setOpen(p)} />)}
          </div>
        ) : (
          <EmptyState icon={<Search className="size-5" strokeWidth={1.5} />} title="Nothing matches" body="Try a different word or category." />
        )
      ) : (
        <>
          <Rail title="Recommended for you" sub="Chosen from what your household already loves" icon={<Sparkles className="size-4 text-terracotta" strokeWidth={1.5} />} items={d.recommended.items} onOpen={setOpen} action={<AIBadge engine={d.recommended.engine} />} />
          <Rail title="Buy again" sub="Your regular add-ons, one tap away" icon={<History className="size-4 text-ink/70" strokeWidth={1.5} />} items={d.reorder} onOpen={setOpen} />
          <Rail title="Top buys" sub="Most ordered by your neighbours this month" icon={<TrendingUp className="size-4 text-sage" strokeWidth={1.5} />} items={d.top_buys} onOpen={setOpen} />
          <Rail title="New in" sub="Fresh additions from the dairy" icon={<Star className="size-4 text-amber" strokeWidth={1.5} />} items={d.new_in} onOpen={setOpen} />
          <section>
            <SectionTitle title="Everything" sub={`${d.all.length} products`} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {d.all.map((p) => <ProductCard key={p.id} p={p} onOpen={() => setOpen(p)} />)}
            </div>
          </section>
        </>
      )}
      <ProductSheet p={open} from={d.editable_from} onClose={() => setOpen(null)} />
    </div>
  );
}
