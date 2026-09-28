import { PERIODS, type Period } from '../../shared/types';

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

const PERIOD_MS: Record<Exclude<Period, 'all'>, number> = {
  '24h': DAY_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
  '90d': 90 * DAY_MS,
};

export function parsePeriod(input: unknown, fallback: Period = '30d'): Period {
  return PERIODS.includes(input as Period) ? (input as Period) : fallback;
}

/**
 * Fenêtre de la période et fenêtre précédente de même durée (pour les écarts).
 * `since` vaut null pour « tout ».
 */
export function periodRange(period: Period, now = Date.now()): { since: string | null; prevSince: string | null } {
  if (period === 'all') return { since: null, prevSince: null };
  const duration = PERIOD_MS[period];
  return {
    since: new Date(now - duration).toISOString(),
    prevSince: new Date(now - 2 * duration).toISOString(),
  };
}

export function isoAgo(ms: number, now = Date.now()): string {
  return new Date(now - ms).toISOString();
}

/** Jour local (fuseau de la machine) au format AAAA-MM-JJ. */
export function localDayKey(value: string | number | Date): string {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
