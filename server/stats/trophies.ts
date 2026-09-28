import type { DailyDelta, SeriesPoint } from '../../shared/types';
import { localDayKey } from './time';

export interface TrophySample {
  taken_at: string;
  trophies: number;
}

/** Combat qui a fait varier les trophées. */
export interface TrophyEvent {
  t: string;
  change: number;
}

/** Durée supposée d'une partie : le point « avant » le premier combat reconstitué est placé là. */
const GAME_MS = 2 * 60_000;

/**
 * Complète les relevés du dashboard avec les combats enregistrés. La valeur après
 * chaque combat est déduite en remontant depuis le relevé qui le suit (relevé −
 * variations des combats intermédiaires). Avant le tout premier relevé, cela
 * reconstitue la courbe sur les combats connus (jusqu'à 25 au premier lancement) ;
 * entre deux relevés espacés (app éteinte), cela restitue les étapes intermédiaires.
 *
 * `reconstructedUntil` vaut la date du premier relevé quand des points ont été
 * reconstitués avant lui.
 */
export function withBattleSamples(
  samples: readonly TrophySample[],
  events: readonly TrophyEvent[],
): { samples: TrophySample[]; reconstructedUntil: string | null } {
  if (!samples.length || !events.length) return { samples: [...samples], reconstructedUntil: null };
  const groups = new Map<number, TrophyEvent[]>();
  let next = 0;
  for (const event of [...events].sort((a, b) => a.t.localeCompare(b.t))) {
    while (next < samples.length && samples[next].taken_at < event.t) next++;
    // Combats postérieurs au dernier relevé : leur effet n'est pas encore mesuré.
    if (next === samples.length) break;
    // Un combat pile sur un relevé n'apporte rien de plus que ce relevé.
    if (samples[next].taken_at === event.t) continue;
    const group = groups.get(next) ?? [];
    group.push(event);
    groups.set(next, group);
  }

  const added: TrophySample[] = [];
  for (const [index, group] of groups) {
    let value = samples[index].trophies;
    for (let i = group.length - 1; i >= 0; i--) {
      added.push({ taken_at: group[i].t, trophies: value });
      value -= group[i].change;
    }
    if (index === 0) {
      added.push({ taken_at: new Date(Date.parse(group[0].t) - GAME_MS).toISOString(), trophies: value });
    }
  }
  return {
    samples: [...samples, ...added].sort((a, b) => a.taken_at.localeCompare(b.taken_at)),
    reconstructedUntil: groups.has(0) ? samples[0].taken_at : null,
  };
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
