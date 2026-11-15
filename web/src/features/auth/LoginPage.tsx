import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Bike, ShieldCheck, Store, User as UserIcon } from 'lucide-react';
import { homePathFor, useAuth } from '@/lib/auth';
import { Button, Input } from '@/components/ui';
import { AuthShell } from './AuthShell';

const DEMO_PASSWORD = 'Gawali@2026';
const demos = [
  { email: 'customer@gawali.demo', label: 'Customer', who: 'Ananya Kulkarni · Baner', icon: UserIcon },
  { email: 'gawali@gawali.demo', label: 'Gawali (Dairy)', who: 'Sangamner Valley Dairy', icon: Store },
  { email: 'delivery@gawali.demo', label: 'Delivery partner', who: 'Ravi Jadhav · Baner route', icon: Bike },
  { email: 'admin@gawali.demo', label: 'Platform admin', who: 'Approvals, users & system health', icon: ShieldCheck },
];

export default function LoginPage() {
  const { user, ready, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  if (ready && user) return <Navigate to={homePathFor(user.role)} replace />;

  const go = async (e: string, p: string, key: string) => {
    setError('');
    setBusy(key);
    try {
      const u = await login(e, p);
      const from = loc.state?.from;
      nav(from && from.startsWith(homePathFor(u.role)) ? from : homePathFor(u.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return setError('Enter your email and password.');
    go(email, password, 'form');
  };

  return (
    <AuthShell>
      <h1 className="text-[1.75rem] font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1.5 text-sm text-muted">Sign in to manage tomorrow’s delivery, your dairy, or your route.</p>

      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        {error && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger" role="alert">{error}</p>}
        <Button type="submit" size="lg" block loading={busy === 'form'}>
          Sign in
        </Button>
      </form>

      <div className="my-8 flex items-center gap-3">
        <div className="h-px flex-1 bg-sand" />
        <span className="eyebrow">Explore a demo role</span>
        <div className="h-px flex-1 bg-sand" />
      </div>

      <div className="space-y-2.5">
        {demos.map((d) => (
          <button
            key={d.email}
            onClick={() => go(d.email, DEMO_PASSWORD, d.email)}
            disabled={!!busy}
            className="group flex w-full items-center gap-3.5 rounded-2xl border border-sand bg-milk p-3.5 text-left transition hover:border-sand-deep hover:shadow-card disabled:opacity-60"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sand-soft text-ink/80 transition group-hover:bg-ink group-hover:text-ivory">
              <d.icon className="size-[18px]" strokeWidth={1.5} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{d.label}</span>
              <span className="block truncate text-xs text-muted">{d.who}</span>
            </span>
            {busy === d.email ? (
              <span className="text-xs text-muted">Signing in…</span>
            ) : (
              <ArrowRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" strokeWidth={1.5} />
            )}
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-2xs text-muted">
        Demo password <span className="num rounded bg-sand-soft px-1.5 py-0.5 font-mono text-ink/80">{DEMO_PASSWORD}</span>
      </p>

      <p className="mt-8 text-center text-sm text-muted">
        New to Gawali?{' '}
        <Link to="/signup" className="font-medium text-terracotta hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
