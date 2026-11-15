import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/lib/api';
import type { DayPlan, Home } from '@/lib/types';
import { useToast } from '@/components/Toast';

export const keys = {
  home: ['customer', 'home'] as const,
  shop: ['customer', 'shop'] as const,
  wallet: ['customer', 'wallet'] as const,
  subs: ['customer', 'subscriptions'] as const,
  vacations: ['customer', 'vacations'] as const,
  orders: ['customer', 'orders'] as const,
  bottles: ['customer', 'bottles'] as const,
  profile: ['customer', 'profile'] as const,
  refunds: ['customer', 'refunds'] as const,
  notifications: ['notifications'] as const,
};

export const useHome = () => useQuery({ queryKey: keys.home, queryFn: () => get<Home>('/api/v2/customer/home/'), refetchInterval: 60_000 });

/** Anything that changes a delivery day can move the wallet projection, the plan and the shop's buy-again. */
export function useInvalidateCustomer() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.home }),
      qc.invalidateQueries({ queryKey: keys.wallet }),
      qc.invalidateQueries({ queryKey: keys.subs }),
      qc.invalidateQueries({ queryKey: keys.orders }),
    ]);
}

/** Replace one day in the cached home payload with the server's fresh version of it. */
export function usePatchDay() {
  const qc = useQueryClient();
  return (day: DayPlan) =>
    qc.setQueryData<Home>(keys.home, (h) => {
      if (!h) return h;
      const week = h.week.map((d) => (d.date === day.date ? { ...d, ...day } : d));
      return {
        ...h,
        week,
        tomorrow: h.tomorrow.date === day.date ? { ...h.tomorrow, ...day } : h.tomorrow,
        today: h.today.date === day.date ? { ...h.today, ...day } : h.today,
      };
    });
}

export function useSkipDay() {
  const qc = useQueryClient();
  const patchDay = usePatchDay();
  const invalidate = useInvalidateCustomer();
  const toast = useToast();
  const m = useMutation({
    mutationFn: ({ date, skip }: { date: string; skip: boolean }) => post<DayPlan>(`/api/v2/customer/day/${date}/skip/`, { skip }),
    onMutate: async ({ date, skip }) => {
      await qc.cancelQueries({ queryKey: keys.home });
      const prev = qc.getQueryData<Home>(keys.home);
      if (prev) {
        const flip = (d: DayPlan): DayPlan =>
          d.date !== date
            ? d
            : {
                ...d,
                status: skip ? 'skipped' : 'scheduled',
                amount: skip ? 0 : d.items.reduce((s, i) => s + i.default_quantity * i.product.price, 0),
                items: d.items.map((i) => ({ ...i, quantity: skip ? 0 : i.default_quantity, is_override: skip })),
                orders: skip ? d.orders.filter((o) => o.is_express) : d.orders,
              };
        qc.setQueryData<Home>(keys.home, { ...prev, week: prev.week.map(flip), tomorrow: flip(prev.tomorrow) });
      }
      return { prev };
    },
    onError: (err: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.home, ctx.prev);
      toast.show(err.message, { kind: 'error' });
    },
    onSuccess: (day) => patchDay(day),
    onSettled: () => invalidate(),
  });
  return m;
}
