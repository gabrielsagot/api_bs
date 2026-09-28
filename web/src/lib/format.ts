// Formatage à la française : espaces fines comme séparateurs, vrai signe moins.

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
const relative = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

const MINUS = '−';

export function fmtInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return integer.format(Math.round(value)).replace('-', MINUS);
}

export function fmtCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return Math.abs(value) < 10_000 ? fmtInt(value) : compact.format(value);
}

export function fmtSigned(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return '0';
  const body = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(
    Math.abs(rounded),
  );
  return `${rounded > 0 ? '+' : MINUS}${body}`;
}

/** 0.5234 → « 52 % » */
export function fmtPct(ratio: number | null | undefined, digits = 0): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return '—';
  return `${(ratio * 100).toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits })} %`;
}

/** Écart en points de pourcentage : 0.052 → « +5,2 pts ». */
export function fmtPts(delta: number | null | undefined): string {
  if (delta === null || delta === undefined) return '—';
  return `${fmtSigned(delta * 100, 1)} pt${Math.abs(delta * 100) >= 2 ? 's' : ''}`;
}

export function fmtRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'jamais';
  const diff = (Date.parse(iso) - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return diff <= 0 ? 'à l’instant' : 'dans un instant';
  if (abs < 3600) return relative.format(Math.round(diff / 60), 'minute');
  if (abs < 86_400) return relative.format(Math.round(diff / 3600), 'hour');
  if (abs < 86_400 * 30) return relative.format(Math.round(diff / 86_400), 'day');
  return relative.format(Math.round(diff / (86_400 * 30)), 'month');
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(iso: string | null | undefined, withYear = false): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Clé de jour 'AAAA-MM-JJ' → « lun. 28 ». */
export function fmtDayKey(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return s % 60 ? `${minutes} min ${String(s % 60).padStart(2, '0')}` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
}

/** Temps restant jusqu'à une date : « 3 h 12 », « 42 min ». */
export function fmtRemaining(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, (Date.parse(iso) - now) / 1000);
  if (seconds >= 86_400) {
    const days = Math.floor(seconds / 86_400);
    return `${days} j ${Math.floor((seconds % 86_400) / 3600)} h`;
  }
  return fmtDuration(seconds - (seconds % 60));
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${fmtInt(count)} ${Math.abs(count) >= 2 ? pluralForm : singular}`;
}
