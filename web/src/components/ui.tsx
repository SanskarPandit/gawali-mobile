import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Minus, Plus } from 'lucide-react';
import clsx from 'clsx';
import { initials } from '@/lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'sage' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-ivory hover:bg-ink-soft shadow-sm',
  secondary: 'bg-sand-soft text-ink hover:bg-sand',
  outline: 'border border-sand bg-milk text-ink hover:border-sand-deep hover:bg-sand-soft/60',
  ghost: 'text-ink hover:bg-sand-soft',
  accent: 'bg-terracotta text-ivory hover:bg-terracotta-deep shadow-sm',
  sage: 'bg-sage text-ivory hover:bg-sage-deep shadow-sm',
  danger: 'bg-danger-soft text-danger hover:bg-danger hover:text-ivory',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[0.9375rem] gap-2 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" strokeWidth={1.75} /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-ink/80 transition hover:bg-sand-soft hover:text-ink active:scale-95 disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, as: As = 'div', ...rest }: { className?: string; children: ReactNode; as?: any; [k: string]: any }) {
  return (
    <As className={clsx('card', className)} {...rest}>
      {children}
    </As>
  );
}

type Tone = 'neutral' | 'sage' | 'amber' | 'terracotta' | 'ink' | 'danger' | 'outline';
const tones: Record<Tone, string> = {
  neutral: 'bg-sand-soft text-ink/80',
  sage: 'bg-sage-soft text-sage-deep',
  amber: 'bg-amber-soft text-amber',
  terracotta: 'bg-terracotta-soft text-terracotta-deep',
  ink: 'bg-ink text-ivory',
  danger: 'bg-danger-soft text-danger',
  outline: 'border border-sand bg-milk text-ink/80',
};

export function Pill({ tone = 'neutral', icon, className, children }: { tone?: Tone; icon?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-2xs font-medium', tones[tone], className)}>
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50',
        checked ? 'bg-sage' : 'bg-sand-deep',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 600, damping: 34 }}
        className={clsx('absolute size-5 rounded-full bg-milk shadow-sm', checked ? 'right-0.5' : 'left-0.5')}
      />
    </button>
  );
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 20,
  disabled,
  size = 'md',
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  size?: 'sm' | 'md';
  suffix?: string;
}) {
  const btn = size === 'sm' ? 'size-7' : 'size-9';
  const round = (v: number) => Math.round(v * 100) / 100;
  return (
    <div className={clsx('inline-flex items-center rounded-xl border border-sand bg-milk', disabled && 'opacity-50')}>
      <button
        type="button"
        aria-label="Decrease"
        disabled={disabled || value <= min}
        onClick={() => onChange(round(Math.max(min, value - step)))}
        className={clsx(btn, 'inline-flex items-center justify-center rounded-l-xl text-ink transition hover:bg-sand-soft active:scale-90 disabled:text-muted/50')}
      >
        <Minus className="size-4" strokeWidth={1.75} />
      </button>
      <span className={clsx('num min-w-[2.25rem] px-1 text-center font-semibold', size === 'sm' ? 'text-xs' : 'text-sm')}>
        <motion.span key={value} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="inline-block">
          {Number.isInteger(value) ? value : value.toFixed(1)}
        </motion.span>
        {suffix && <span className="ml-0.5 text-2xs font-normal text-muted">{suffix}</span>}
      </span>
      <button
        type="button"
        aria-label="Increase"
        disabled={disabled || value >= max}
        onClick={() => onChange(round(Math.min(max, value + step)))}
        className={clsx(btn, 'inline-flex items-center justify-center rounded-r-xl text-ink transition hover:bg-sand-soft active:scale-90 disabled:text-muted/50')}
      >
        <Plus className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}

export function Field({ label, hint, error, children, className }: { label?: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('min-w-0', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {error ? <p className="mt-1.5 text-xs text-danger">{error}</p> : hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string }>(
  function Input({ label, hint, error, className, id, ...rest }, ref) {
    const auto = useId();
    return (
      <Field label={undefined} hint={hint} error={error} className={className}>
        {label && (
          <label htmlFor={id ?? auto} className="label">
            {label}
          </label>
        )}
        <input ref={ref} id={id ?? auto} className={clsx('field', error && 'border-danger/60')} {...rest} />
      </Field>
    );
  },
);

export function Textarea({ label, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  const id = useId();
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}
      <textarea id={id} className="field min-h-[84px] resize-y" {...rest} />
    </div>
  );
}

export function Select({ label, error, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string }) {
  const id = useId();
  return (
    <div className={clsx('min-w-0', className)}>
      {label && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}
      <select id={id} className={clsx('field appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9', error && 'border-danger/60')}
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23716B64' stroke-width='1.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
        {...rest}>
        {children}
      </select>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  const id = useId();
  return (
    <div className={clsx('inline-flex max-w-full rounded-xl bg-sand-soft p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'relative min-w-0 flex-1 whitespace-nowrap rounded-lg font-medium transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
            value === o.value ? 'text-ink' : 'text-muted hover:text-ink',
          )}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-lg bg-milk shadow-card" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
          )}
          <span className="relative flex items-center justify-center gap-1.5">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx('relative overflow-hidden rounded-xl bg-sand-soft', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-milk/70 to-transparent" />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('size-5 animate-spin text-muted', className)} strokeWidth={1.5} />;
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-sand-soft text-muted">{icon}</div>
      <p className="font-medium">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <p className="font-medium">We couldn’t load this</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{error instanceof Error ? error.message : 'Please try again.'}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={clsx('inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-terracotta-soft text-xs font-semibold text-terracotta-deep', className)}>
      {initials(name)}
    </span>
  );
}

export function Stat({ label, value, sub, icon, tone }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: 'sage' | 'amber' | 'terracotta' }) {
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow truncate">{label}</p>
        {icon && (
          <span
            className={clsx(
              'flex size-8 shrink-0 items-center justify-center rounded-lg',
              tone === 'sage' ? 'bg-sage-soft text-sage' : tone === 'amber' ? 'bg-amber-soft text-amber' : tone === 'terracotta' ? 'bg-terracotta-soft text-terracotta' : 'bg-sand-soft text-ink/70',
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="num mt-2 truncate text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <div className="mt-1 truncate text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export function SectionTitle({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
        {sub && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function AIBadge({ engine }: { engine?: string }) {
  const live = engine && engine !== 'rules';
  const label = !live ? 'Smart rules' : engine!.includes('kimi') ? 'Kimi AI' : engine!.includes('nemotron') ? 'Nemotron AI' : 'NVIDIA AI';
  return (
    <span
      title={live ? `Generated by ${engine}` : 'AI offline — deterministic rules. Add NVIDIA_API_KEY to enable models.'}
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium',
        live ? 'bg-gradient-to-r from-terracotta-soft to-sage-soft text-ink' : 'bg-sand-soft text-muted',
      )}
    >
      <span className={clsx('size-1.5 rounded-full', live ? 'bg-sage' : 'bg-muted/60')} />
      {label}
    </span>
  );
}
