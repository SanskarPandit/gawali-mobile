export const n = (v: unknown): number => {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(x) ? x : 0;
};

const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,240 — drops paise when they are zero. */
export function rupees(v: unknown, opts: { paise?: boolean } = {}) {
  const x = n(v);
  const neg = x < 0;
  const abs = Math.abs(x);
  const body = opts.paise || abs % 1 !== 0 ? inr2.format(abs) : inr0.format(abs);
  return `${neg ? '−' : ''}₹${body}`;
}

export function qty(v: unknown) {
  const x = n(v);
  return Number.isInteger(x) ? String(x) : x.toFixed(x * 10 === Math.round(x * 10) ? 1 : 2);
}

export function parseDay(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isoDay(d: Date) {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(iso: string, days: number) {
  const d = parseDay(iso);
  d.setDate(d.getDate() + days);
  return isoDay(d);
}

export const weekday = (iso: string, style: 'short' | 'long' = 'short') =>
  parseDay(iso).toLocaleDateString('en-IN', { weekday: style });
export const dayNum = (iso: string) => parseDay(iso).getDate();
export const shortDate = (iso: string) => parseDay(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const longDate = (iso: string) =>
  parseDay(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
export const dayLabel = (iso: string, today: string) => {
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  if (iso === addDays(today, -1)) return 'Yesterday';
  return parseDay(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};

export const clock = (isoDateTime: string) =>
  new Date(isoDateTime).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', ' ');

export const dateTime = (isoDateTime: string) =>
  new Date(isoDateTime).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

export function relative(isoDateTime: string) {
  const s = (Date.now() - new Date(isoDateTime).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return dateTime(isoDateTime);
}

export function countdownParts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60, total };
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export const plural = (count: number, word: string, pluralWord = `${word}s`) => `${count} ${count === 1 ? word : pluralWord}`;
