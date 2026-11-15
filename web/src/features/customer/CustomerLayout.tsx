import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CalendarRange, Home as HomeIcon, ShoppingBag, Sparkles, UserRound, Wallet } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth';
import { Logo } from '@/components/Logo';
import { Avatar } from '@/components/ui';
import { NotificationsSheet } from '@/components/NotificationsSheet';
import { AssistantSheet } from './AssistantSheet';
import { useHome } from './api';

const tabs = [
  { to: '/app', label: 'Home', icon: HomeIcon, end: true },
  { to: '/app/shop', label: 'Shop', icon: ShoppingBag },
  { to: '/app/plan', label: 'Plan', icon: CalendarRange },
  { to: '/app/wallet', label: 'Wallet', icon: Wallet },
  { to: '/app/account', label: 'Account', icon: UserRound },
];

export default function CustomerLayout() {
  const { user } = useAuth();
  const home = useHome();
  const loc = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const unread = home.data?.unread_notifications ?? 0;

  return (
    <div className="min-h-dvh pb-24 sm:pb-10">
      <header className="sticky top-0 z-30 border-b border-sand/80 bg-ivory/85 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <NavLink to="/app" className="shrink-0">
            <Logo sub={home.data?.dairy?.name} />
          </NavLink>
          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {tabs.slice(0, 4).map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  clsx('rounded-lg px-3 py-1.5 text-sm font-medium transition', isActive ? 'bg-milk text-ink shadow-card' : 'text-muted hover:text-ink')
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setAskOpen(true)}
              className="hidden items-center gap-1.5 rounded-xl border border-sand bg-milk px-3 py-1.5 text-sm font-medium text-ink shadow-card transition hover:border-sand-deep sm:inline-flex"
            >
              <Sparkles className="size-4 text-terracotta" strokeWidth={1.5} /> Ask Gawali
            </button>
            <button
              onClick={() => setNotifOpen(true)}
              aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
              className="relative inline-flex size-10 items-center justify-center rounded-xl text-ink/80 transition hover:bg-sand-soft"
            >
              <Bell className="size-5" strokeWidth={1.5} />
              {unread > 0 && (
                <span className="num absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-terracotta px-1 text-[10px] font-semibold leading-4 text-ivory">
                  {unread}
                </span>
              )}
            </button>
            <NavLink to="/app/account" className="hidden md:block" aria-label="Account">
              <Avatar name={user?.full_name ?? ''} />
            </NavLink>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-8">
        <AnimatePresence mode="wait">
          <motion.div key={loc.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <button
        onClick={() => setAskOpen(true)}
        aria-label="Ask Gawali assistant"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] right-4 z-30 inline-flex size-12 items-center justify-center rounded-2xl bg-ink text-ivory shadow-lift transition active:scale-95 sm:hidden"
      >
        <Sparkles className="size-5" strokeWidth={1.5} />
      </button>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-sand bg-milk/95 backdrop-blur-lg md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className="relative flex flex-col items-center gap-1 py-2.5">
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="tab-dot" className="absolute top-0 h-0.5 w-8 rounded-full bg-ink" />}
                  <t.icon className={clsx('size-5', isActive ? 'text-ink' : 'text-muted')} strokeWidth={isActive ? 1.75 : 1.5} />
                  <span className={clsx('text-[10px] font-medium', isActive ? 'text-ink' : 'text-muted')}>{t.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <NotificationsSheet open={notifOpen} onClose={() => setNotifOpen(false)} />
      <AssistantSheet open={askOpen} onClose={() => setAskOpen(false)} />
    </div>
  );
}
