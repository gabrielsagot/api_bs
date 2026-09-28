import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, ChevronDown, LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Outcome, SetOutcome } from '../../../shared/types';
import { fmtPct } from '../lib/format';

// ── Conteneurs ────────────────────────────────────────────────

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={clsx(
        'min-w-0 rounded-[var(--radius-card)] bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.03)] ring-1 ring-black/[0.05]',
        padded && 'p-5 sm:p-6',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-2">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-ink-2">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}

/** Rangée de filtres, toujours au-dessus du contenu qu'elle filtre. */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-center gap-2">{children}</div>;
}

// ── Contrôles ─────────────────────────────────────────────────

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-[10px] bg-[#e9e9ee] p-[2px] no-scrollbar">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={clsx(
            'whitespace-nowrap rounded-[8px] px-3 py-[5px] text-[13px] font-medium transition-colors',
            option.value === value ? 'bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.1)]' : 'text-ink-2 hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <label className={clsx('relative inline-flex items-center', className)}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[31px] max-w-[220px] appearance-none truncate rounded-[10px] bg-[#e9e9ee] pl-3 pr-8 text-[13px] font-medium text-ink outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-ink-2" strokeWidth={2.2} />
    </label>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  icon,
  loading,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; icon?: ReactNode; loading?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      className={clsx(
        'inline-flex h-[34px] items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[14px] font-medium transition-colors disabled:opacity-50',
        variant === 'primary' && 'bg-accent text-white hover:bg-accent-hover',
        variant === 'secondary' && 'bg-[#e9e9ee] text-ink hover:bg-[#e2e2e7]',
        variant === 'ghost' && 'text-accent hover:bg-accent-soft',
        variant === 'danger' && 'text-bad hover:bg-bad-soft',
        className,
      )}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ── Chiffres ──────────────────────────────────────────────────

/** Écart signé, coloré selon que la hausse est une bonne nouvelle, avec une flèche (jamais la couleur seule). */
export function Delta({
  value,
  children,
  goodWhenUp = true,
  className,
}: {
  value: number | null | undefined;
  children: ReactNode;
  goodWhenUp?: boolean;
  className?: string;
}) {
  if (value === null || value === undefined) return <span className={clsx('text-ink-3', className)}>—</span>;
  const up = value > 0;
  const neutral = Math.abs(value) < 1e-9;
  const good = neutral ? null : up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-0.5 font-medium',
        good === null ? 'text-ink-2' : good ? 'text-good' : 'text-bad',
        className,
      )}
    >
      {!neutral && <Icon className="size-3.5" strokeWidth={2.4} aria-hidden />}
      {children}
    </span>
  );
}

export function StatTile({
  label,
  value,
  sub,
  delta,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  delta?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={clsx('flex flex-col', className)}>
      <div className="text-[13px] font-medium text-ink-2">{label}</div>
      <div className="mt-2 break-words text-[22px] font-semibold leading-tight tracking-[-0.02em] sm:text-[26px] lg:text-[28px]">{value}</div>
      {(sub || delta) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-ink-2">
          {delta}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </Card>
  );
}

// ── Pastilles ─────────────────────────────────────────────────

type Tone = 'neutral' | 'accent' | 'good' | 'bad' | 'warn';

const TONES: Record<Tone, string> = {
  neutral: 'bg-fill text-ink-2',
  accent: 'bg-accent-soft text-accent',
  good: 'bg-good-soft text-good',
  bad: 'bg-bad-soft text-bad',
  warn: 'bg-warn-soft text-warn',
};

export function Pill({ children, tone = 'neutral', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-[1px] text-[12px] font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const OUTCOME: Record<Outcome, { short: string; label: string; tone: Tone }> = {
  win: { short: 'V', label: 'Victoire', tone: 'good' },
  loss: { short: 'D', label: 'Défaite', tone: 'bad' },
  draw: { short: 'N', label: 'Égalité', tone: 'neutral' },
};

/** Résultat d'une partie : lettre + couleur + libellé accessible. */
export function ResultBadge({ outcome, rank }: { outcome: Outcome | null; rank?: number | null }) {
  const info = outcome ? OUTCOME[outcome] : null;
  const text = rank ? `#${rank}` : (info?.short ?? '—');
  return (
    <span
      title={info ? `${info.label}${rank ? ` (${rank}e)` : ''}` : 'Résultat inconnu'}
      className={clsx(
        'inline-flex h-6 min-w-7 items-center justify-center rounded-[7px] px-1.5 text-[12px] font-semibold',
        info ? TONES[info.tone] : TONES.neutral,
      )}
    >
      {text}
      <span className="sr-only">{info?.label}</span>
    </span>
  );
}

const SET_OUTCOME: Record<SetOutcome, { label: string; tone: Tone }> = {
  win: { label: 'Victoire', tone: 'good' },
  loss: { label: 'Défaite', tone: 'bad' },
  draw: { label: 'Égalité', tone: 'neutral' },
  ongoing: { label: 'En cours', tone: 'accent' },
  partial: { label: 'Incomplet', tone: 'neutral' },
};

export function SetBadge({ outcome, wins, losses }: { outcome: SetOutcome; wins: number; losses: number }) {
  const info = SET_OUTCOME[outcome];
  const letter = outcome === 'win' ? 'V' : outcome === 'loss' ? 'D' : outcome === 'draw' ? 'N' : '…';
  return (
    <span
      title={info.label}
      className={clsx(
        'inline-flex h-7 w-[52px] shrink-0 items-center justify-center gap-1 rounded-[8px] text-[12px] font-semibold tnum',
        TONES[info.tone],
      )}
    >
      <span>{letter}</span>
      <span className="font-medium opacity-80">
        {wins}–{losses}
      </span>
      <span className="sr-only">{info.label}</span>
    </span>
  );
}

/** Jauge de winrate : piste claire du même bleu, repère fin à 50 %. */
export function Meter({ value, className }: { value: number | null; className?: string }) {
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <span className="w-[42px] shrink-0 text-right text-[13px] font-medium tnum">{fmtPct(value)}</span>
      <div className="relative h-[6px] min-w-[48px] flex-1 overflow-hidden rounded-full bg-accent-track">
        {value !== null && (
          <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${Math.round(value * 100)}%` }} />
        )}
        <div className="absolute inset-y-0 left-1/2 w-px bg-white" aria-hidden />
      </div>
    </div>
  );
}

export function ProgressBar({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'good' }) {
  return (
    <div className="h-[6px] w-full overflow-hidden rounded-full bg-fill">
      <div
        className={clsx('h-full rounded-full', tone === 'good' ? 'bg-good' : 'bg-accent')}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}

// ── États ─────────────────────────────────────────────────────

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-[13px] text-ink-2">{children}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-[14px] text-ink-2">
      <LoaderCircle className="size-4 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <Card>
      <EmptyState title="Impossible de charger les données">
        {error instanceof Error ? error.message : String(error)}
      </EmptyState>
    </Card>
  );
}

/** Pendant un rechargement, on garde l'affichage précédent en transparence (pas de flash). */
export function Refetching({ active, children }: { active: boolean; children: ReactNode }) {
  return <div className={clsx('transition-opacity duration-200', active && 'opacity-60')}>{children}</div>;
}
