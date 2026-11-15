import { useId, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { Passport } from '@/lib/types';
import { clock } from '@/lib/format';

/** Cold-chain transit curve with the 2.8–4.2 °C safe band shaded. */
export function TemperatureCurve({ passport, height = 180 }: { passport: Passport; height?: number }) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const log = useMemo(() => {
    const chilled = new Date(passport.chilled_at).getTime() - 1000;
    return passport.temperature_log.filter((r) => r.phase !== 'milking' && new Date(r.t).getTime() >= chilled - 60 * 60 * 1000);
  }, [passport]);
  if (log.length < 2) return <p className="text-sm text-muted">Not enough sensor readings yet.</p>;

  const W = 600;
  const H = height;
  const pad = { l: 34, r: 12, t: 12, b: 26 };
  const t0 = new Date(log[0].t).getTime();
  const t1 = new Date(log[log.length - 1].t).getTime();
  const lo = 0;
  const hi = Math.max(8, Math.ceil(Math.max(...log.map((r) => r.c)) + 1));
  const x = (t: string) => pad.l + ((new Date(t).getTime() - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
  const y = (c: number) => pad.t + (1 - (Math.min(hi, Math.max(lo, c)) - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const path = log.map((r, i) => `${i ? 'L' : 'M'}${x(r.t).toFixed(1)},${y(r.c).toFixed(1)}`).join(' ');
  const area = `${path} L${x(log[log.length - 1].t)},${H - pad.b} L${x(log[0].t)},${H - pad.b} Z`;
  const ticks = [0, 4, 8, ...(hi > 8 ? [hi] : [])];
  const phases = log.reduce<{ phase: string; x: number }[]>((acc, r) => {
    if (!acc.length || acc[acc.length - 1].phase !== r.phase) acc.push({ phase: r.phase, x: x(r.t) });
    return acc;
  }, []);
  const h = hover !== null ? log[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={`Temperature held between ${passport.temp_min} and ${passport.temp_max} degrees`}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          let best = 0;
          log.forEach((p, i) => { if (Math.abs(x(p.t) - px) < Math.abs(x(log[best].t) - px)) best = i; });
          setHover(best);
        }}>
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#2E7D47" stopOpacity="0.22" />
            <stop offset="1" stopColor="#2E7D47" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x={pad.l} y={y(passport.safe_max)} width={W - pad.l - pad.r} height={y(passport.safe_min) - y(passport.safe_max)} fill="#E6F1E9" rx="3" />
        <text x={W - pad.r - 4} y={y(passport.safe_max) - 4} textAnchor="end" className="fill-sage text-[10px] font-medium">Safe band {passport.safe_min}–{passport.safe_max}°C</text>
        {ticks.map((c) => (
          <g key={c}>
            <line x1={pad.l} x2={W - pad.r} y1={y(c)} y2={y(c)} stroke="#EAE6DF" strokeDasharray="3 4" />
            <text x={pad.l - 8} y={y(c) + 3} textAnchor="end" className="num fill-muted text-[10px]">{c}°</text>
          </g>
        ))}
        {phases.map((p, i) => (
          <g key={i}>
            <line x1={p.x} x2={p.x} y1={pad.t} y2={H - pad.b} stroke="#EAE6DF" />
            <text x={p.x + 4} y={H - pad.b + 16} className="fill-muted text-[10px] capitalize">{p.phase}</text>
          </g>
        ))}
        <path d={area} fill={`url(#${gid})`} />
        <motion.path d={path} fill="none" stroke="#2E7D47" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: 'easeInOut' }} />
        {h && (
          <g>
            <line x1={x(h.t)} x2={x(h.t)} y1={pad.t} y2={H - pad.b} stroke="#191715" strokeOpacity=".25" />
            <circle cx={x(h.t)} cy={y(h.c)} r="4.5" fill="#fff" stroke="#2E7D47" strokeWidth="2" />
          </g>
        )}
      </svg>
      {h && (
        <div className="num pointer-events-none absolute -top-2 rounded-lg bg-ink px-2 py-1 text-2xs text-ivory shadow-lift"
          style={{ left: `${(x(h.t) / W) * 100}%`, transform: `translateX(${x(h.t) > W * 0.7 ? '-100%' : '0'})` }}>
          {h.c.toFixed(1)}°C · {clock(h.t)} · <span className="capitalize">{h.phase}</span>
        </div>
      )}
    </div>
  );
}
