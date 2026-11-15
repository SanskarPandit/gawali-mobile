import { Croissant, Egg, Milk, Package, Droplets, CakeSlice, Soup } from 'lucide-react';
import clsx from 'clsx';
import type { Category, ProductBrief } from '@/lib/types';

const art: Record<Category, { icon: typeof Milk; bg: string; fg: string }> = {
  milk: { icon: Milk, bg: 'from-[#F7F3EC] to-[#EFE8DC]', fg: 'text-terracotta' },
  curd: { icon: Soup, bg: 'from-[#F4F6EF] to-[#E6ECDD]', fg: 'text-sage' },
  paneer: { icon: CakeSlice, bg: 'from-[#FAF5EA] to-[#F1E6CF]', fg: 'text-[#9A7A3B]' },
  ghee: { icon: Droplets, bg: 'from-[#FBF2E2] to-[#F3DFBC]', fg: 'text-amber' },
  bakery: { icon: Croissant, bg: 'from-[#F8EFE7] to-[#EEDCCB]', fg: 'text-terracotta-deep' },
  eggs: { icon: Egg, bg: 'from-[#F7F5F0] to-[#ECE7DD]', fg: 'text-muted' },
  other: { icon: Package, bg: 'from-[#F3F2EE] to-[#E7E4DD]', fg: 'text-ink/60' },
};

/** Consistent illustrated tile per category; uses the product photo when one is set. */
export function ProductArt({ product, className, iconClass }: { product: Pick<ProductBrief, 'category' | 'image_url' | 'name'>; className?: string; iconClass?: string }) {
  const a = art[product.category] ?? art.other;
  if (product.image_url) {
    return <img src={product.image_url} alt={product.name} loading="lazy" className={clsx('rounded-xl object-cover', className)} />;
  }
  const Icon = a.icon;
  return (
    <div className={clsx('flex items-center justify-center rounded-xl bg-gradient-to-br', a.bg, className)} aria-hidden>
      <Icon className={clsx(a.fg, iconClass ?? 'size-6')} strokeWidth={1.25} />
    </div>
  );
}

export const containerLabel = (c: string) =>
  ({ glass_bottle: 'Glass bottle', pouch: 'Pouch', tub: 'Tub', pack: 'Pack' })[c] ?? c;

export const animalLabel = (a: string) => ({ cow: 'Cow', a2_cow: 'A2 Cow', buffalo: 'Buffalo', none: '' })[a] ?? '';
