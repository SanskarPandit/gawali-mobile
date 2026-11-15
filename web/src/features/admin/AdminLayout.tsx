import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Bell, Bot, Building2, LayoutDashboard, LogOut, Megaphone, Menu, ShieldAlert, Users, X } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth';
import { Logo } from '@/components/Logo';
import { Avatar } from '@/components/ui';
import { NotificationsSheet } from '@/components/NotificationsSheet';

const nav = [
  { to: '/control', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/control/dairies', label: 'Dairies', icon: Building2 },
  { to: '/control/users', label: 'Users', icon: Users },
  { to: '/control/refunds', label: 'Refunds', icon: ShieldAlert },
  { to: '/control/ai', label: 'AI usage', icon: Bot },
  { to: '/control/broadcast', label: 'Broadcast', icon: Megaphone },
  { to: '/control/system', label: 'Jobs & audit', icon: Activity },
];

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-6 pt-5"><Logo sub="Platform admin" /></div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={onNavigate}
            className={({ isActive }) => clsx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition', isActive ? 'bg-milk text-ink shadow-card' : 'text-muted hover:bg-milk/60 hover:text-ink')}>
            <n.icon className="size-[18px]" strokeWidth={1.5} />{n.label}
          </NavLink>
        ))}
      </nav>
      <div className="m-3 flex items-center gap-3 rounded-2xl border border-sand bg-milk p-3">
        <Avatar name={user?.full_name ?? ''} />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{user?.full_name}</p><p className="truncate text-2xs text-muted">Administrator</p></div>
        <button onClick={logout} aria-label="Sign out" className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-sand-soft hover:text-ink"><LogOut className="size-4" strokeWidth={1.5} /></button>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const [open, setOpen] = useState(false);
  const [notif, setNotif] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-sand bg-sand-soft/60 lg:block"><SideNav /></aside>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-sand bg-ivory/85 px-4 backdrop-blur-lg sm:px-6 lg:h-16">
        <button className="inline-flex size-9 items-center justify-center rounded-xl hover:bg-sand-soft lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" strokeWidth={1.5} /></button>
        <div className="lg:hidden"><Logo /></div>
        <button onClick={() => setNotif(true)} aria-label="Notifications" className="ml-auto inline-flex size-10 items-center justify-center rounded-xl text-ink/80 hover:bg-sand-soft"><Bell className="size-5" strokeWidth={1.5} /></button>
      </header>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="absolute inset-0 bg-ink/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-ivory shadow-lift" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 420, damping: 40 }}>
              <button className="absolute right-3 top-4 inline-flex size-9 items-center justify-center rounded-xl hover:bg-sand-soft" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-5" strokeWidth={1.5} /></button>
              <SideNav onNavigate={() => setOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><Outlet /></main>
      <NotificationsSheet open={notif} onClose={() => setNotif(false)} />
    </div>
  );
}
