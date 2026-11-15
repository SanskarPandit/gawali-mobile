import clsx from 'clsx';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={clsx('size-8', className)} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#191715" />
      <path d="M32 13c7.3 9.4 13.5 17.2 13.5 25a13.5 13.5 0 0 1-27 0c0-7.8 6.2-15.6 13.5-25z" fill="#FBF9F5" />
      <path d="M25.5 40a6.5 6.5 0 0 0 6.5 6.5" stroke="#8B6244" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Logo({ sub, className }: { sub?: string; className?: string }) {
  return (
    <div className={clsx('flex items-center gap-2.5', className)}>
      <LogoMark />
      <div className="leading-none">
        <p className="text-[0.95rem] font-semibold tracking-tight">Gawali</p>
        {sub && <p className="mt-1 text-2xs text-muted">{sub}</p>}
      </div>
    </div>
  );
}
