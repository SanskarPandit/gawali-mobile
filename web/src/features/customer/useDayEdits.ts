import { useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { post } from '@/lib/api';
import type { DayPlan, Home } from '@/lib/types';
import { useToast } from '@/components/Toast';
import { keys, useInvalidateCustomer, usePatchDay } from './api';

function recompute(day: DayPlan): DayPlan {
  const itemsTotal = day.items.reduce((s, i) => s + i.quantity * i.product.price, 0);
  const ordersTotal = day.orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + Number(o.amount), 0);
  const anyQty = day.items.some((i) => i.quantity > 0) || day.orders.some((o) => o.status === 'pending');
  return {
    ...day,
    amount: itemsTotal + ordersTotal,
    status: day.status === 'vacation' || day.status === 'delivered' ? day.status : anyQty ? 'scheduled' : 'skipped',
    bottles: day.items.filter((i) => i.product.container === 'glass_bottle').reduce((s, i) => s + Math.ceil(i.quantity), 0),
  };
}

/**
 * Quantity edits feel instant: the cached day (hero card, ribbon, burn-rate) updates on every tap,
 * and only the settled value is sent once the customer pauses.
 */
export function useDayQuantity() {
  const qc = useQueryClient();
  const toast = useToast();
  const patchDay = usePatchDay();
  const invalidate = useInvalidateCustomer();
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const snapshot = useRef<Home | undefined>();

  return (date: string, subscriptionId: string, quantity: number) => {
    const home = qc.getQueryData<Home>(keys.home);
    if (!home) return;
    const key = `${date}:${subscriptionId}`;
    if (!timers.current.has(key)) snapshot.current = home;

    const edit = (d: DayPlan): DayPlan =>
      d.date !== date
        ? d
        : recompute({
            ...d,
            items: d.items.map((i) =>
              i.subscription_id === subscriptionId
                ? { ...i, quantity, line_amount: quantity * i.product.price, is_override: quantity !== i.default_quantity }
                : i,
            ),
          });
    const before = home.week.find((d) => d.date === date)?.amount ?? 0;
    const week = home.week.map(edit);
    const delta = (week.find((d) => d.date === date)?.amount ?? 0) - before;
    qc.setQueryData<Home>(keys.home, {
      ...home,
      week,
      tomorrow: edit(home.tomorrow),
      wallet: {
        ...home.wallet,
        burn: { ...home.wallet.burn, daily_average: Math.max(0, home.wallet.burn.daily_average + delta / 7), next_7_days: home.wallet.burn.next_7_days + delta },
      },
    });

    clearTimeout(timers.current.get(key));
    timers.current.set(
      key,
      setTimeout(async () => {
        timers.current.delete(key);
        try {
          patchDay(await post<DayPlan>(`/api/v2/customer/day/${date}/quantity/`, { subscription_id: subscriptionId, quantity }));
        } catch (err) {
          if (snapshot.current) qc.setQueryData(keys.home, snapshot.current);
          toast.show(err instanceof Error ? err.message : 'Could not update the quantity.', { kind: 'error' });
        } finally {
          invalidate();
        }
      }, 450),
    );
  };
}
