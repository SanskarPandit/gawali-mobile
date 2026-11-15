import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { ArrowUp, Check, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { post } from '@/lib/api';
import { shortDate } from '@/lib/format';
import { Sheet } from '@/components/Sheet';
import { AIBadge, Button } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useInvalidateCustomer } from './api';
import { useShop } from './shopApi';

interface Action {
  type: 'skip_day' | 'unskip_day' | 'set_quantity' | 'add_order' | 'vacation';
  date?: string;
  start_date?: string;
  end_date?: string;
  subscription_id?: string;
  product_id?: string;
  quantity?: number;
}
interface Msg {
  role: 'user' | 'assistant';
  content: string;
  actions?: Action[];
  engine?: string;
  applied?: number[];
}

const SUGGESTIONS = ['Skip tomorrow', 'Why was I charged yesterday?', 'Add paneer to my next delivery', 'Plan a 5-day vacation', 'When is the cutoff?'];

export function AssistantSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'assistant', content: 'Hi! I can change tomorrow’s order, add essentials, plan a vacation or explain your bill. नमस्ते · नमस्कार — ask in any language.' },
  ]);
  const [text, setText] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const invalidate = useInvalidateCustomer();
  const shop = useShop(open);
  const productName = (id?: string) => shop.data?.all.find((p) => p.id === id)?.name ?? 'item';

  useEffect(() => {
    scroller.current?.scrollTo({ top: 1e6, behavior: 'smooth' });
  }, [msgs]);

  const ask = useMutation({
    mutationFn: (history: Msg[]) =>
      post<{ reply: string; actions: Action[]; engine: string }>('/api/v2/customer/assistant/', {
        messages: history.map(({ role, content }) => ({ role, content })),
      }),
    onSuccess: (r) => setMsgs((m) => [...m, { role: 'assistant', content: r.reply, actions: r.actions, engine: r.engine }]),
    onError: (e: Error) => setMsgs((m) => [...m, { role: 'assistant', content: `Sorry — ${e.message}` }]),
  });
  const apply = useMutation({
    mutationFn: ({ action }: { action: Action; msg: number; idx: number }) => post<{ message: string }>('/api/v2/customer/assistant/apply/', { action }),
    onSuccess: (r, v) => {
      setMsgs((m) => m.map((x, i) => (i === v.msg ? { ...x, applied: [...(x.applied ?? []), v.idx] } : x)));
      invalidate();
      toast.show(r.message);
    },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });

  const send = (content: string) => {
    const c = content.trim();
    if (!c || ask.isPending) return;
    const history = [...msgs, { role: 'user' as const, content: c }];
    setMsgs(history);
    setText('');
    ask.mutate(history.slice(1));
  };

  const label = (a: Action) => {
    switch (a.type) {
      case 'skip_day': return `Skip ${shortDate(a.date!)}`;
      case 'unskip_day': return `Restore ${shortDate(a.date!)}`;
      case 'set_quantity': return `Set ${a.quantity} on ${shortDate(a.date!)}`;
      case 'add_order': return `Add ${a.quantity ?? 1} × ${productName(a.product_id)} · ${shortDate(a.date!)}`;
      case 'vacation': return `Pause ${shortDate(a.start_date!)} – ${shortDate(a.end_date!)}`;
    }
  };

  return (
    <Sheet open={open} onClose={onClose} side size="md" title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-terracotta" strokeWidth={1.75} /> Ask Gawali</span>}
      subtitle="Changes only happen when you tap to confirm."
      footer={
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); send(text); }} className="flex items-center gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about deliveries, wallet, bottles…" className="field flex-1" aria-label="Message" />
          <Button type="submit" aria-label="Send" className="!px-3" disabled={!text.trim()} loading={ask.isPending} icon={!ask.isPending ? <ArrowUp className="size-4" strokeWidth={2} /> : undefined} />
        </form>
      }>
      <div ref={scroller} className="space-y-3">
        <AnimatePresence initial={false}>
          {msgs.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={clsx('max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed', m.role === 'user' ? 'rounded-br-md bg-ink text-ivory' : 'rounded-bl-md bg-sand-soft text-ink')}>
                <p className="whitespace-pre-line">{m.content}</p>
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {m.actions.map((a, j) => {
                      const done = m.applied?.includes(j);
                      return (
                        <button key={j} disabled={done || apply.isPending} onClick={() => apply.mutate({ action: a, msg: i, idx: j })}
                          className={clsx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition',
                            done ? 'bg-sage text-ivory' : 'bg-milk text-ink shadow-card hover:bg-ink hover:text-ivory')}>
                          {done && <Check className="size-3.5" strokeWidth={2.5} />}
                          {done ? 'Done · ' : 'Confirm · '}{label(a)}
                        </button>
                      );
                    })}
                  </div>
                )}
                {m.engine && <div className="mt-2"><AIBadge engine={m.engine} /></div>}
              </div>
            </motion.div>
          ))}
          {ask.isPending && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-1 px-2 py-2">
              {[0, 1, 2].map((d) => <motion.span key={d} className="size-1.5 rounded-full bg-muted" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: d * 0.15 }} />)}
            </motion.div>
          )}
        </AnimatePresence>
        {msgs.length === 1 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} className="rounded-full border border-sand px-3 py-1.5 text-xs text-ink/80 transition hover:border-ink">{s}</button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
