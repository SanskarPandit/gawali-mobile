import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { BellOff, Camera, DoorOpen, KeyRound } from 'lucide-react';
import { patch } from '@/lib/api';
import type { Doorstep } from '@/lib/types';
import { Sheet } from '@/components/Sheet';
import { Button, Input, Textarea, Toggle } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useInvalidateCustomer } from './api';

const OPTIONS = [
  { key: 'silent_delivery', icon: BellOff, title: 'Silent delivery', body: 'The partner never rings the doorbell — no barking dogs, no sleeping babies woken.' },
  { key: 'use_gate_hook', icon: DoorOpen, title: 'Milk bag on gate hook', body: 'Your order is placed in the insulated milk bag on your door or gate hook.' },
  { key: 'photo_proof', icon: Camera, title: 'Delivery photo verification', body: 'A silent drop-off photo appears in your morning notification.' },
  { key: 'society_gate_pass', icon: KeyRound, title: 'Society gate pass', body: 'An early-morning entry token is generated for security each day.' },
] as const;

export function DoorstepForm({ doorstep, onSaved }: { doorstep: Doorstep; onSaved?: () => void }) {
  const [v, setV] = useState(doorstep);
  useEffect(() => setV(doorstep), [doorstep]);
  const toast = useToast();
  const invalidate = useInvalidateCustomer();
  const save = useMutation({
    mutationFn: (body: Partial<Doorstep>) => patch('/api/v2/customer/profile/', body),
    onSuccess: () => {
      invalidate();
      onSaved?.();
    },
    onError: (e: Error) => {
      setV(doorstep);
      toast.show(e.message, { kind: 'error' });
    },
  });
  const flip = (key: keyof Doorstep, value: boolean) => {
    setV((x) => ({ ...x, [key]: value }));
    save.mutate({ [key]: value }, { onSuccess: () => toast.show('Doorstep preference saved') });
  };

  return (
    <div className="space-y-2">
      {OPTIONS.map((o) => (
        <label key={o.key} className="flex cursor-pointer items-start gap-3.5 rounded-2xl border border-sand p-4 transition hover:border-sand-deep">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sand-soft text-ink/80">
            <o.icon className="size-[18px]" strokeWidth={1.5} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{o.title}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">{o.body}</span>
          </span>
          <Toggle label={o.title} checked={Boolean(v[o.key])} onChange={(x) => flip(o.key, x)} />
        </label>
      ))}
      <div className="grid gap-3 pt-3">
        <Input label="Society name" value={v.society_name} onChange={(e) => setV({ ...v, society_name: e.target.value })} placeholder="Kumar Primrose" />
        <Textarea label="Note for your partner" value={v.delivery_instructions} onChange={(e) => setV({ ...v, delivery_instructions: e.target.value })} placeholder="e.g. Brass hook to the left of the nameplate" />
        <Button
          variant="outline"
          loading={save.isPending}
          onClick={() => save.mutate({ society_name: v.society_name, delivery_instructions: v.delivery_instructions }, { onSuccess: () => toast.show('Instructions saved') })}
        >
          Save instructions
        </Button>
      </div>
    </div>
  );
}

export function DoorstepSheet({ open, onClose, doorstep }: { open: boolean; onClose: () => void; doorstep: Doorstep }) {
  return (
    <Sheet open={open} onClose={onClose} title="Doorstep preferences" subtitle="Your partner sees these on every stop card.">
      <DoorstepForm doorstep={doorstep} />
    </Sheet>
  );
}
