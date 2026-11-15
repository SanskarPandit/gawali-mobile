import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Store, User as UserIcon } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { homePathFor, useAuth } from '@/lib/auth';
import { Button, Input, Segmented, Select } from '@/components/ui';
import { AuthShell } from './AuthShell';

type Role = 'customer' | 'dairy';
interface PublicDairy {
  id: string;
  name: string;
  city: string;
  hub_name: string;
  cutoff_time: string;
}

export default function SignupPage() {
  const { user, ready, acceptSession } = useAuth();
  const nav = useNavigate();
  const [role, setRole] = useState<Role>('customer');
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const dairies = useQuery({ queryKey: ['public-dairies'], queryFn: () => api<PublicDairy[]>('/api/v2/auth/dairies/', { auth: false }) });

  if (ready && user) return <Navigate to={homePathFor(user.role)} replace />;

  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      const body = { ...form, role, dairy_id: role === 'customer' ? form.dairy_id || dairies.data?.[0]?.id : undefined };
      const data = await api<{ access: string; refresh: string }>('/api/v2/auth/signup/', { method: 'POST', body, auth: false });
      const u = await acceptSession(data.access, data.refresh);
      nav(homePathFor(u.role), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.fields)) fe[k] = v[0];
        setErrors(Object.keys(fe).length ? fe : { form: err.message });
      } else setErrors({ form: 'Sign-up failed. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="text-[1.75rem] font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-sm text-muted">Delivery partners are invited by their dairy and receive their sign-in from it.</p>

      <Segmented
        className="mt-6 w-full"
        value={role}
        onChange={(v) => {
          setRole(v);
          setErrors({});
        }}
        options={[
          { value: 'customer', label: <><UserIcon className="size-4" strokeWidth={1.5} /> I want milk delivered</> },
          { value: 'dairy', label: <><Store className="size-4" strokeWidth={1.5} /> I run a dairy</> },
        ]}
      />

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name" autoComplete="name" value={form.full_name ?? ''} onChange={set('full_name')} error={errors.full_name} />
          <Input label="Mobile number" type="tel" autoComplete="tel" placeholder="+91 98xxx xxxxx" value={form.phone ?? ''} onChange={set('phone')} error={errors.phone} />
        </div>
        <Input label="Email" type="email" autoComplete="email" value={form.email ?? ''} onChange={set('email')} error={errors.email} />
        <Input label="Password" type="password" autoComplete="new-password" hint="At least 8 characters, not only numbers." value={form.password ?? ''} onChange={set('password')} error={errors.password} />

        {role === 'customer' ? (
          <>
            <Select label="Your dairy" value={form.dairy_id ?? dairies.data?.[0]?.id ?? ''} onChange={set('dairy_id')} error={errors.dairy_id}>
              {dairies.isLoading && <option>Loading dairies…</option>}
              {dairies.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.city}
                </option>
              ))}
            </Select>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,0.6fr)_minmax(0,1fr)]">
              <Input label="Flat / house" placeholder="B-702" value={form.flat_or_house_number ?? ''} onChange={set('flat_or_house_number')} />
              <Input label="Society (optional)" placeholder="Kumar Primrose" hint="Enables a gate pass for security." value={form.society_name ?? ''} onChange={set('society_name')} />
            </div>
            <Input label="Delivery address" placeholder="Street, area, city" value={form.address ?? ''} onChange={set('address')} error={errors.address} />
          </>
        ) : (
          <>
            <Input label="Dairy name" placeholder="Sangamner Valley Dairy" value={form.business_name ?? ''} onChange={set('business_name')} error={errors.business_name} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="City" placeholder="Pune" value={form.city ?? ''} onChange={set('city')} />
              <Input label="Collection hub" placeholder="Hub #1" value={form.hub_name ?? ''} onChange={set('hub_name')} />
            </div>
            <Input label="Business address" value={form.address ?? ''} onChange={set('address')} error={errors.address} />
          </>
        )}

        {errors.form && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger" role="alert">{errors.form}</p>}
        <Button type="submit" size="lg" block loading={busy}>
          {role === 'customer' ? 'Start my deliveries' : 'Open my dairy console'}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-terracotta hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
