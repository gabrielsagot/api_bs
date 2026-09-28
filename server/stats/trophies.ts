import type { DailyDelta, SeriesPoint } from '../../shared/types';
import { localDayKey } from './time';

interface TrophySample {
  taken_at: string;
  trophies: number;
}

/**
 * Courbe des trophées : part de la valeur connue au début de la période,
 * puis suit chaque instantané, et se prolonge jusqu'à maintenant.
 */
export function trophySeries(
  samples: readonly TrophySample[],
  baseline: TrophySample | undefined,
  since: string | null,
  now = new Date().toISOString(),
  maxPoints = 400,
): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  if (baseline && since) points.push({ t: since, v: baseline.trophies });
  for (const sample of samples) points.push({ t: sample.taken_at, v: sample.trophies });
  const last = points.at(-1);
  if (last && last.t < now) points.push({ t: now, v: last.v });
  return downsample(points, maxPoints);
}

/** Réduit une série en gardant la dernière valeur de chaque tranche de temps (+ les extrémités). */
export function downsample(points: readonly SeriesPoint[], maxPoints: number): SeriesPoint[] {
  if (points.length <= maxPoints) return [...points];
  const start = Date.parse(points[0].t);
  const end = Date.parse(points[points.length - 1].t);
  const bucket = Math.max(1, (end - start) / (maxPoints - 1));
  const kept = new Map<number, SeriesPoint>();
  for (const point of points) kept.set(Math.floor((Date.parse(point.t) - start) / bucket), point);
  const result = [points[0], ...kept.values()];
  if (result.at(-1) !== points.at(-1)) result.push(points[points.length - 1]);
  return result.filter((point, index) => index === 0 || point !== result[index - 1]);
}

/** Variation quotidienne (jour local) : clôture du jour − clôture précédente. */
export function dailyDeltas(samples: readonly TrophySample[], baseline: TrophySample | undefined): DailyDelta[] {
  const days = new Map<string, { open: number; close: number }>();
  for (const sample of samples) {
    const key = localDayKey(sample.taken_at);
    const day = days.get(key);
    if (day) day.close = sample.trophies;
    else days.set(key, { open: sample.trophies, close: sample.trophies });
  }
  let previousClose = baseline?.trophies ?? null;
  const result: DailyDelta[] = [];
  for (const [day, { open, close }] of [...days.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    result.push({ day, delta: close - (previousClose ?? open), close });
    previousClose = close;
  }
  return result;
}
