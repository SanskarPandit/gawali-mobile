import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Leaf, ShieldCheck, Timer, Wallet } from 'lucide-react';
import { Logo } from '@/components/Logo';

const promises = [
  { icon: Timer, title: 'No cutoff anxiety', body: 'A live countdown and one-tap edits until the last minute.' },
  { icon: ShieldCheck, title: 'Problems fixed in seconds', body: 'Photo a leaked pouch and the credit is on your account before breakfast.' },
  { icon: Wallet, title: 'A ledger you can read', body: 'Every delivery, refund and bottle credit, line by line. No locked deposits.' },
  { icon: Leaf, title: 'Circular by default', body: 'Returnable glass bottles credited straight back to your account.' },
];

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex min-w-0 flex-col px-5 py-6 sm:px-10 lg:px-16">
        <Logo sub="Fresh at your door by 6 AM" />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</div>
        <p className="text-center text-2xs text-muted lg:text-left">© {new Date().getFullYear()} Gawali · Made for Indian mornings</p>
      </div>
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(#FBF9F5 1px, transparent 1px)', backgroundSize: '22px 22px' }} />
        <div className="absolute -right-24 -top-24 size-[28rem] rounded-full bg-terracotta/25 blur-3xl" />
        <div className="absolute -bottom-32 left-10 size-[26rem] rounded-full bg-sage/20 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-14 text-ivory">
          <div>
            <p className="eyebrow !text-ivory/50">Gawali</p>
            <h2 className="mt-4 max-w-md text-[2.4rem] font-semibold leading-[1.1] tracking-tight">
              The calm way to get milk at your door every morning.
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {promises.map((p, i) => (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.07 }}
                className="rounded-2xl border border-ivory/10 bg-ivory/[0.04] p-5 backdrop-blur"
              >
                <p.icon className="size-5 text-[#E9C9A9]" strokeWidth={1.5} />
                <p className="mt-3 text-sm font-medium">{p.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-ivory/60">{p.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
