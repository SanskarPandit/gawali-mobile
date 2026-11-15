import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Bell, History, Route as RouteIcon, UserRound } from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Logo } from '@/components/Logo';
import { NotificationsSheet } from '@/components/NotificationsSheet';

const tabs = [
  { to: '/route', label: 'Route', icon: RouteIcon, end: true },
  { to: '/route/history', label: 'History', icon: History },
  { to: '/route/profile', label: 'Profile', icon: UserRound },
];

export default function DeliveryLayout() {
  const [notif, setNotif] = useState(false);
  return (
    <div className="min-h-dvh pb-24">
      <header className="sticky top-0 z-30 border-b border-sand bg-ivory/85 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Logo sub="Partner app" />
          <nav className="ml-6 hidden gap-1 sm:flex">
            {tabs.map((t) => <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => clsx('rounded-lg px-3 py-1.5 text-sm font-medium', isActive ? 'bg-milk shadow-card' : 'text-muted hover:text-ink')}>{t.label}</NavLink>)}
          </nav>
          <button onClick={() => setNotif(true)} aria-label="Notifications" className="ml-auto inline-flex size-10 items-center justify-center rounded-xl hover:bg-sand-soft"><Bell className="size-5" strokeWidth={1.5} /></button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-5"><Outlet /></main>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-sand bg-milk/95 backdrop-blur-lg sm:hidden">
        <div className="grid grid-cols-3">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className="relative flex flex-col items-center gap-1 py-2.5">
              {({ isActive }) => (<>
                {isActive && <motion.span layoutId="ptab" className="absolute top-0 h-0.5 w-8 rounded-full bg-ink" />}
                <t.icon className={clsx('size-5', isActive ? 'text-ink' : 'text-muted')} strokeWidth={1.5} />
                <span className={clsx('text-[10px] font-medium', isActive ? 'text-ink' : 'text-muted')}>{t.label}</span>
              </>)}
            </NavLink>
          ))}
        </div>
      </nav>
      <NotificationsSheet open={notif} onClose={() => setNotif(false)} />
    </div>
  );
}
