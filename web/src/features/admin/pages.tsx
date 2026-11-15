import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BadgeCheck, Bot, Building2, CircleAlert, Megaphone, Play, Search, ShieldAlert, Users } from 'lucide-react';
import clsx from 'clsx';
import { get, patch, post, qs } from '@/lib/api';
import { dateTime, relative, rupees, shortDate } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { Avatar, Button, Card, EmptyState, ErrorState, Input, PageHeader, Pill, Segmented, Select, Skeleton, Stat, Textarea, Toggle } from '@/components/ui';
import { useToast } from '@/components/Toast';

const tip = { contentStyle: { borderRadius: 12, border: '1px solid #EAE6DF', fontSize: 12 } };

function Table({ head, children, min = 720 }: { head: string[]; children: React.ReactNode; min?: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: min }}>
          <thead><tr className="border-b border-sand bg-ivory text-left text-2xs uppercase tracking-wider text-muted">{head.map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-sand">{children}</tbody>
        </table>
      </div>
    </Card>
  );
}

// --- Overview ----------------------------------------------------------------------------

interface Overview {
  users: { customers: number; dairies: number; partners: number; admins: number };
  dairies: { active: number; pending: number; suspended: number };
  households_active: number; deliveries_today: number; month_billed: number; month_collected: number; outstanding_dues: number;
  refunds: { open: number; credited_month: number };
  ai: { calls_7d: number; labelled: number; configured: boolean; by_task: { task: string; calls: number; avg_ms: number; errors: number }[] };
  push: { server_ready: boolean; devices: number };
  series: { date: string; deliveries: number; signups: number }[];
  jobs: { job: string; period: string; status: string; at: string }[];
}

export function AdminOverviewPage() {
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => get<Overview>('/api/v2/admin/overview/'), refetchInterval: 60_000 });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <PageHeader title="Platform overview" sub="Every dairy, household and partner on Gawali." />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Households (active)" value={d.households_active} sub={`${d.users.customers} customer accounts`} icon={<Users className="size-4" />} />
        <Stat label="Dairies" value={d.dairies.active} sub={`${d.dairies.pending} awaiting approval · ${d.dairies.suspended} suspended`} icon={<Building2 className="size-4" />} tone={d.dairies.pending ? 'amber' : undefined} />
        <Stat label="Drops today" value={d.deliveries_today} sub={`${d.users.partners} delivery partners`} tone="sage" />
        <Stat label="Outstanding dues" value={rupees(d.outstanding_dues)} sub={`${rupees(d.month_collected)} collected this month`} tone="terracotta" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0 p-5">
          <h2 className="mb-3 font-semibold">Deliveries & sign-ups · 14 days</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.series} margin={{ left: -16, right: 4 }}>
                <CartesianGrid vertical={false} stroke="#EAE6DF" strokeDasharray="3 4" />
                <XAxis dataKey="date" tickFormatter={(x) => x.slice(8)} tick={{ fontSize: 11, fill: '#716B64' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#716B64' }} axisLine={false} tickLine={false} />
                <Tooltip {...tip} labelFormatter={(l) => shortDate(String(l))} cursor={{ fill: '#F3F0EA' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="deliveries" name="Households delivered" fill="#2E7D47" radius={[4, 4, 0, 0]} maxBarSize={20} />
                <Bar dataKey="signups" name="Sign-ups" fill="#8B6244" radius={[4, 4, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-semibold">Health</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex justify-between gap-3"><span>AI models</span>{d.ai.configured ? <Pill tone="sage">Live · {d.ai.calls_7d} calls / 7d</Pill> : <Pill tone="amber">Rules only</Pill>}</li>
              <li className="flex justify-between gap-3"><span>Push notifications</span>{d.push.server_ready ? <Pill tone="sage">{d.push.devices} devices</Pill> : <Pill tone="amber">Needs Firebase key</Pill>}</li>
              <li className="flex justify-between gap-3"><span>Refunds to review</span><Pill tone={d.refunds.open ? 'amber' : 'sage'}>{d.refunds.open}</Pill></li>
              <li className="flex justify-between gap-3"><span>Billed this month</span><span className="num font-medium">{rupees(d.month_billed)}</span></li>
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold">Latest scheduled jobs</h2>
            <ul className="mt-3 space-y-1.5 text-xs">
              {d.jobs.length === 0 && <li className="text-muted">The scheduler hasn’t run yet.</li>}
              {d.jobs.map((j, i) => (
                <li key={i} className="flex items-center justify-between gap-2"><span className="truncate font-mono">{j.job}</span>
                  <span className="flex shrink-0 items-center gap-2"><span className="text-muted">{relative(j.at)}</span><Pill tone={j.status === 'ok' ? 'sage' : j.status === 'failed' ? 'danger' : 'amber'}>{j.status}</Pill></span></li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

// --- Dairies -----------------------------------------------------------------------------

interface DairyRow { id: string; name: string; owner: string; email: string; phone: string; city: string; hub_name: string; is_verified: boolean; is_active: boolean; households: number; partners: number; credit_limit: number; created_at: string }

export function AdminDairiesPage() {
  const [status, setStatus] = useState<'' | 'pending' | 'active' | 'suspended'>('');
  const [search, setSearch] = useState('');
  const s = useDebounced(search, 250);
  const q = useQuery({ queryKey: ['admin', 'dairies', status, s], queryFn: () => get<DairyRow[]>(`/api/v2/admin/dairies/${qs({ status, search: s })}`) });
  const qc = useQueryClient();
  const toast = useToast();
  const upd = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<DairyRow> }) => patch<DairyRow>(`/api/v2/admin/dairies/${id}/`, body),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ['admin'] }); toast.show(`${d.name} updated`); },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Dairies" sub="Approve new gawalis and suspend accounts that break the rules." />
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" /><input className="field pl-10" placeholder="Search name, city, email…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search dairies" /></div>
        <Segmented value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }]} />
      </div>
      {q.isLoading ? <Skeleton className="h-72" /> : q.error ? <ErrorState error={q.error} /> : !q.data?.length ? <Card><EmptyState icon={<Building2 className="size-5" />} title="No dairies here" /></Card> : (
        <Table head={['Dairy', 'Owner', 'Households', 'Status', 'Actions']}>
          {q.data.map((d) => (
            <tr key={d.id}>
              <td className="px-4 py-3"><p className="font-medium">{d.name}</p><p className="text-xs text-muted">{d.city} · {d.hub_name || 'no hub'} · joined {shortDate(d.created_at.slice(0, 10))}</p></td>
              <td className="px-4 py-3"><p>{d.owner}</p><p className="text-xs text-muted">{d.email} · {d.phone}</p></td>
              <td className="num px-4 py-3">{d.households} <span className="text-xs text-muted">· {d.partners} partners</span></td>
              <td className="px-4 py-3">{!d.is_active ? <Pill tone="danger">Suspended</Pill> : d.is_verified ? <Pill tone="sage">Live</Pill> : <Pill tone="amber">Pending</Pill>}</td>
              <td className="px-4 py-3"><div className="flex flex-wrap gap-2">
                {!d.is_verified && d.is_active && <Button size="sm" variant="sage" icon={<BadgeCheck className="size-3.5" />} onClick={() => upd.mutate({ id: d.id, body: { is_verified: true } })}>Approve</Button>}
                <Button size="sm" variant={d.is_active ? 'outline' : 'secondary'} onClick={() => upd.mutate({ id: d.id, body: { is_active: !d.is_active } })}>{d.is_active ? 'Suspend' : 'Reactivate'}</Button>
              </div></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// --- Users -------------------------------------------------------------------------------

interface UserRow { id: string; name: string; email: string; phone: string | null; role: string; is_active: boolean; organisation: string | null; joined: string; last_login: string | null }
const ROLE_LABEL: Record<string, string> = { customer: 'Customer', dairy: 'Dairy', delivery_boy: 'Partner', admin: 'Admin' };

export function AdminUsersPage() {
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const s = useDebounced(search, 250);
  const q = useQuery({ queryKey: ['admin', 'users', role, s], queryFn: () => get<{ count: number; results: UserRow[] }>(`/api/v2/admin/users/${qs({ role, search: s })}`) });
  const qc = useQueryClient();
  const toast = useToast();
  const upd = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => patch<UserRow>(`/api/v2/admin/users/${id}/`, { is_active }),
    onSuccess: (u) => { qc.invalidateQueries({ queryKey: ['admin', 'users'] }); toast.show(u.is_active ? `${u.name} reactivated` : `${u.name} suspended and signed out everywhere`); },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Users" sub={q.data ? `${q.data.count} accounts${q.data.count > 200 ? ' · showing the newest 200' : ''}` : 'All accounts'} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" /><input className="field pl-10" placeholder="Search name, email, phone…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search users" /></div>
        <Select aria-label="Role" className="sm:w-44" value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option><option value="customer">Customers</option><option value="dairy">Dairies</option><option value="delivery_boy">Partners</option><option value="admin">Admins</option></Select>
      </div>
      {q.isLoading ? <Skeleton className="h-72" /> : q.error ? <ErrorState error={q.error} /> : (
        <Table head={['User', 'Role', 'Organisation', 'Last sign-in', 'Active']}>
          {q.data!.results.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={u.name} /><div className="min-w-0"><p className="truncate font-medium">{u.name}</p><p className="truncate text-xs text-muted">{u.email}{u.phone ? ` · ${u.phone}` : ''}</p></div></div></td>
              <td className="px-4 py-3"><Pill tone="outline">{ROLE_LABEL[u.role] ?? u.role}</Pill></td>
              <td className="px-4 py-3 text-xs">{u.organisation ?? <span className="text-muted">—</span>}</td>
              <td className="px-4 py-3 text-xs text-muted">{u.last_login ? relative(u.last_login) : 'Never'}</td>
              <td className="px-4 py-3"><Toggle label={`${u.name} active`} checked={u.is_active} disabled={u.role === 'admin'} onChange={(v) => upd.mutate({ id: u.id, is_active: v })} /></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// --- Refunds -------------------------------------------------------------------------------

interface RefundRow { id: string; customer: string; dairy: string | null; issue: string; amount: number; status: string; ai_verdict: string; ai_engine: string; ai_confidence: number; processing_ms: number; photo: string | null; created_at: string }

export function AdminRefundsPage() {
  const [status, setStatus] = useState('');
  const q = useQuery({ queryKey: ['admin', 'refunds', status], queryFn: () => get<RefundRow[]>(`/api/v2/admin/refunds/${qs({ status })}`) });
  return (
    <div className="space-y-6">
      <PageHeader title="Refunds across dairies" sub="Watch for abuse patterns. Each dairy reviews its own flagged claims." />
      <Segmented value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'under_review', label: 'Under review' }, { value: 'credited', label: 'Credited' }, { value: 'rejected', label: 'Declined' }]} />
      {q.isLoading ? <Skeleton className="h-72" /> : q.error ? <ErrorState error={q.error} /> : !q.data?.length ? <Card><EmptyState icon={<ShieldAlert className="size-5" />} title="No claims" /></Card> : (
        <Table head={['Claim', 'Dairy', 'AI check', 'Amount', 'Status']}>
          {q.data.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-3"><div className="flex items-center gap-3">{r.photo ? <a href={r.photo} target="_blank" rel="noreferrer"><img src={r.photo} alt="" className="size-10 rounded-lg border border-sand object-cover" /></a> : <span className="size-10 rounded-lg bg-sand-soft" />}<div><p className="font-medium">{r.customer}</p><p className="text-xs text-muted">{r.issue} · {dateTime(r.created_at)}</p></div></div></td>
              <td className="px-4 py-3 text-xs">{r.dairy}</td>
              <td className="px-4 py-3 text-xs"><span className="capitalize">{r.ai_verdict}</span> · {Math.round(r.ai_confidence * 100)}% · {(r.processing_ms / 1000).toFixed(1)}s<span className="block truncate font-mono text-muted">{r.ai_engine}</span></td>
              <td className="num px-4 py-3 font-medium">{rupees(r.amount)}</td>
              <td className="px-4 py-3"><Pill tone={r.status === 'credited' ? 'sage' : r.status === 'rejected' ? 'danger' : 'amber'}>{r.status.replace('_', ' ')}</Pill></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// --- AI usage ------------------------------------------------------------------------------

interface AIPayload {
  stats: { task: string; model: string; calls: number; avg_ms: number; errors: number; correct: number; wrong: number }[];
  recent: { id: string; task: string; model: string; latency_ms: number; error: string; output: string; label: string; feature: string | null; created_at: string }[];
}

export function AdminAIPage() {
  const [task, setTask] = useState('');
  const q = useQuery({ queryKey: ['admin', 'ai', task], queryFn: () => get<AIPayload>(`/api/v2/admin/ai/${qs({ task })}`) });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  return (
    <div className="space-y-6">
      <PageHeader title="AI usage" sub="Every model call is logged. Human refund decisions label the vision model’s answers." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {q.data.stats.map((s) => (
          <Card key={`${s.task}-${s.model}`} className="p-4">
            <p className="eyebrow">{s.task}</p>
            <p className="mt-1 truncate font-mono text-xs text-muted">{s.model}</p>
            <p className="num mt-2 text-xl font-semibold">{s.calls} <span className="text-sm font-normal text-muted">calls</span></p>
            <p className="num text-xs text-muted">avg {Math.round(s.avg_ms)} ms · {s.errors} errors{s.correct + s.wrong ? ` · ${s.correct}/${s.correct + s.wrong} right` : ''}</p>
          </Card>
        ))}
        {!q.data.stats.length && <Card className="p-5 text-sm text-muted sm:col-span-2 xl:col-span-4">No AI calls yet.</Card>}
      </div>
      <Segmented value={task} onChange={setTask} options={[{ value: '', label: 'All' }, { value: 'chat', label: 'Chat' }, { value: 'vision', label: 'Vision' }, { value: 'insight', label: 'Insights' }, { value: 'parse', label: 'Parse' }]} />
      <Table head={['When', 'Task', 'Latency', 'Output', 'Label']} min={760}>
        {q.data.recent.map((r) => (
          <tr key={r.id}>
            <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted">{relative(r.created_at)}</td>
            <td className="px-4 py-2.5 text-xs"><span className="font-medium">{r.task}</span><span className="block text-muted">{r.feature ?? ''}</span></td>
            <td className={clsx('num px-4 py-2.5 text-xs', r.latency_ms > 5000 && 'text-amber')}>{r.latency_ms} ms</td>
            <td className="max-w-[360px] px-4 py-2.5 text-xs">{r.error ? <span className="flex items-center gap-1 text-danger"><CircleAlert className="size-3.5 shrink-0" />{r.error.slice(0, 120)}</span> : <span className="line-clamp-2 text-ink/80">{r.output}</span>}</td>
            <td className="px-4 py-2.5">{r.label ? <Pill tone={r.label === 'correct' ? 'sage' : 'danger'}>{r.label}</Pill> : <span className="text-xs text-muted">—</span>}</td>
          </tr>
        ))}
      </Table>
      <p className="flex items-center gap-2 text-xs text-muted"><Bot className="size-4" /> Export labelled examples with <span className="font-mono">manage.py export_ai_dataset --labelled</span>.</p>
    </div>
  );
}

// --- Broadcast -------------------------------------------------------------------------------

export function AdminBroadcastPage() {
  const [f, setF] = useState({ audience: 'all', title: '', body: '' });
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => post<{ recipients: number; push: boolean }>('/api/v2/admin/broadcast/', f),
    onSuccess: (r) => { toast.show(`Sent to ${r.recipients} people${r.push ? ' (in-app + push)' : ' (in-app)'}`); setF({ ...f, title: '', body: '' }); },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Broadcast" sub="Send an announcement to everyone in a role. It appears in their inbox and as a push notification." />
      <Card className="space-y-4 p-5 sm:p-6">
        <Select label="Audience" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>
          <option value="all">Everyone</option><option value="customer">All customers</option><option value="dairy">All dairy owners</option><option value="delivery_boy">All delivery partners</option>
        </Select>
        <Input label="Title" maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Holiday schedule" />
        <Textarea label="Message" maxLength={1000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Deliveries on 1 Jan will arrive 30 minutes later than usual." />
        <Button icon={<Megaphone className="size-4" />} loading={m.isPending} disabled={!f.title.trim() || !f.body.trim()} onClick={() => m.mutate()}>Send broadcast</Button>
      </Card>
    </div>
  );
}

// --- Jobs & audit -----------------------------------------------------------------------------

interface JobsPayload {
  jobs: { name: string; description: string; per_dairy: boolean; last_status: string | null; last_run: string | null; last_detail: Record<string, unknown> | null }[];
  recent: { job: string; period: string; status: string; detail: Record<string, unknown>; at: string }[];
}
interface AuditRow { id: string; actor: string; action: string; entity: string; entity_id: string; details: Record<string, unknown>; at: string }

export function AdminSystemPage() {
  const jobs = useQuery({ queryKey: ['admin', 'jobs'], queryFn: () => get<JobsPayload>('/api/v2/admin/jobs/'), refetchInterval: 30_000 });
  const audit = useQuery({ queryKey: ['admin', 'audit'], queryFn: () => get<AuditRow[]>('/api/v2/admin/audit/') });
  const qc = useQueryClient();
  const toast = useToast();
  const run = useMutation({
    mutationFn: (job: string) => post<{ ran: unknown[]; note: string | null }>('/api/v2/admin/jobs/', { job }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['admin'] }); toast.show(r.note ?? `Ran for ${r.ran.length} dairies`, { kind: r.note ? 'info' : 'success' }); },
    onError: (e: Error) => toast.show(e.message, { kind: 'error' }),
  });
  return (
    <div className="space-y-8">
      <PageHeader title="Jobs & audit" sub="The scheduler runs each job once per day (per dairy) at its time. Run one now if needed." />
      {jobs.isLoading ? <Skeleton className="h-64" /> : jobs.error ? <ErrorState error={jobs.error} /> : (
        <Table head={['Job', 'Last run', 'Result', '']}>
          {jobs.data!.jobs.map((j) => (
            <tr key={j.name}>
              <td className="px-4 py-3"><p className="font-mono text-xs font-medium">{j.name}</p><p className="text-xs text-muted">{j.description}</p></td>
              <td className="px-4 py-3 text-xs text-muted">{j.last_run ? relative(j.last_run) : 'Never'}</td>
              <td className="px-4 py-3">{j.last_status ? <Pill tone={j.last_status === 'ok' ? 'sage' : j.last_status === 'failed' ? 'danger' : 'amber'}>{j.last_status}</Pill> : <span className="text-xs text-muted">—</span>}
                {j.last_detail && <span className="mt-1 block max-w-[260px] truncate font-mono text-2xs text-muted">{JSON.stringify(j.last_detail)}</span>}</td>
              <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" icon={<Play className="size-3.5" />} loading={run.isPending && run.variables === j.name} onClick={() => run.mutate(j.name)}>Run if due</Button></td>
            </tr>
          ))}
        </Table>
      )}
      <section>
        <h2 className="mb-3 font-semibold">Audit log</h2>
        {audit.isLoading ? <Skeleton className="h-48" /> : !audit.data?.length ? <Card className="p-5 text-sm text-muted">No admin actions yet.</Card> : (
          <Table head={['When', 'Who', 'Action', 'Details']}>
            {audit.data.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted">{dateTime(a.at)}</td>
                <td className="px-4 py-2.5 text-xs">{a.actor}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{a.action}</td>
                <td className="max-w-[360px] truncate px-4 py-2.5 font-mono text-2xs text-muted">{JSON.stringify(a.details)}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
