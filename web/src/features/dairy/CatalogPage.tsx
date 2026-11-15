import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Pencil, Plus } from 'lucide-react';
import { del, patch, post } from '@/lib/api';
import { rupees } from '@/lib/format';
import { Button, Card, EmptyState, ErrorState, Input, PageHeader, Pill, Select, Skeleton, Textarea, Toggle } from '@/components/ui';
import { ProductArt, animalLabel, containerLabel } from '@/components/ProductArt';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { useProducts } from './CustomersPage';

const CATS = [['milk', 'Milk'], ['curd', 'Curd & Yogurt'], ['paneer', 'Paneer'], ['ghee', 'Ghee & Butter'], ['bakery', 'Bread & Bakery'], ['eggs', 'Eggs'], ['other', 'Other']];
const CONTAINERS = [['glass_bottle', 'Glass bottle'], ['pouch', 'Pouch'], ['tub', 'Tub'], ['pack', 'Pack']];
const ANIMALS = [['none', 'Not applicable'], ['cow', 'Cow'], ['a2_cow', 'A2 Cow'], ['buffalo', 'Buffalo']];
const BLANK = { name: '', unit: '', price: '', category: 'milk', container: 'pouch', animal: 'none', kind: 'subscription', step: '1', description: '', image_url: '', fat_percent: '', is_available: true, is_new: false, is_featured: false };

function Editor({ product, onClose }: { product: Record<string, any> | null; onClose: () => void }) {
  const [f, setF] = useState<Record<string, any>>(BLANK);
  const qc = useQueryClient();
  const toast = useToast();
  const isNew = product && !product.id;
  useEffect(() => { if (product) setF({ ...BLANK, ...product, price: product.price ?? '', step: product.step ?? '1', fat_percent: product.fat_percent ?? '', image_url: product.image_url ?? '' }); }, [product]);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, fat_percent: f.fat_percent === '' ? null : f.fat_percent };
      return isNew ? post('/api/v2/dairy/products/', body) : patch(`/api/v2/dairy/products/${product!.id}/`, body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dairy', 'products'] }); toast.show(isNew ? 'Product added' : 'Product saved'); onClose(); },
  });
  const remove = useMutation({
    mutationFn: () => del<{ detail?: string }>(`/api/v2/dairy/products/${product!.id}/`),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['dairy', 'products'] }); toast.show(r?.detail ?? 'Product removed'); onClose(); },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });
  const set = (k: string) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const err = (k: string) => (save.error as any)?.fields?.[k]?.[0];
  return (
    <Sheet open={!!product} onClose={onClose} title={isNew ? 'New product' : 'Edit product'} size="lg"
      footer={<div className="flex gap-2">{!isNew && <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>Remove</Button>}<Button block loading={save.isPending} onClick={() => save.mutate()}>Save product</Button></div>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input className="sm:col-span-2" label="Name" value={f.name} onChange={set('name')} error={err('name')} />
        <Input label="Unit" placeholder="1 L, 500 ml, 200 g" value={f.unit} onChange={set('unit')} error={err('unit')} />
        <Input label="Price (₹)" inputMode="decimal" value={f.price} onChange={set('price')} error={err('price')} />
        <Select label="Category" value={f.category} onChange={set('category')}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        <Select label="Container" value={f.container} onChange={set('container')}>{CONTAINERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        <Select label="Animal / variant" value={f.animal} onChange={set('animal')}>{ANIMALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        <Select label="Sold as" value={f.kind} onChange={set('kind')}><option value="subscription">Daily subscription</option><option value="one_time">One-time add-on</option></Select>
        <Input label="Stepper increment" inputMode="decimal" value={f.step} onChange={set('step')} error={err('step')} />
        <Input label="Fat % (optional)" inputMode="decimal" value={f.fat_percent} onChange={set('fat_percent')} />
        <Input className="sm:col-span-2" label="Image URL (optional)" value={f.image_url} onChange={set('image_url')} />
        <Textarea className="sm:col-span-2" label="Description" value={f.description} onChange={set('description')} />
        {([['is_available', 'Available in shop'], ['is_new', 'Show in “New in”'], ['is_featured', 'Featured']] as const).map(([k, l]) => (
          <label key={k} className="flex items-center justify-between rounded-xl border border-sand px-3.5 py-2.5 text-sm">{l}<Toggle label={l} checked={!!f[k]} onChange={(v) => setF((x) => ({ ...x, [k]: v }))} /></label>
        ))}
        {save.error && !Object.keys((save.error as any).fields ?? {}).length && <p className="text-sm text-danger sm:col-span-2">{(save.error as Error).message}</p>}
      </div>
    </Sheet>
  );
}

export default function CatalogPage() {
  const q = useProducts();
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  return (
    <div className="space-y-6">
      <PageHeader title="Catalog" sub="Everything customers can subscribe to or add on." actions={<Button icon={<Plus className="size-4" />} onClick={() => setEditing({})}>New product</Button>} />
      {q.isLoading ? <Skeleton className="h-96" /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? <Card><EmptyState icon={<Package className="size-5" />} title="No products yet" action={<Button onClick={() => setEditing({})}>Add your first product</Button>} /></Card> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {q.data.map((p) => (
            <Card key={p.id} className="flex gap-3 p-4">
              <ProductArt product={p as any} className="size-16 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-medium">{p.name}</p>
                  <button onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`} className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-sand-soft hover:text-ink"><Pencil className="size-4" strokeWidth={1.5} /></button>
                </div>
                <p className="truncate text-xs text-muted">{p.unit} · {containerLabel(p.container)}{animalLabel(p.animal) ? ` · ${animalLabel(p.animal)}` : ''}</p>
                <p className="num mt-1 text-sm font-semibold">{rupees(p.price)}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {!p.is_available && <Pill tone="danger">Hidden</Pill>}
                  {p.is_new && <Pill tone="ink">New</Pill>}
                  {p.is_featured && <Pill tone="terracotta">Featured</Pill>}
                  <Pill tone="outline">{p.subscribers} daily</Pill>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Editor product={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
