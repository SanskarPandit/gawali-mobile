import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import type { ShopProduct } from '@/lib/types';
import { keys } from './api';

export interface Shop {
  editable_from: string;
  recommended: { engine: string; pending?: boolean; items: ShopProduct[] };
  top_buys: ShopProduct[];
  reorder: ShopProduct[];
  new_in: ShopProduct[];
  all: ShopProduct[];
  categories: { id: string; label: string }[];
}

export const useShop = (enabled = true) =>
  useQuery({
    queryKey: keys.shop, queryFn: () => get<Shop>('/api/v2/customer/shop/'), enabled, staleTime: 120_000,
    refetchInterval: (query) => (query.state.data?.recommended.pending && query.state.dataUpdateCount < 6 ? 3000 : false),
  });
