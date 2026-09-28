import { tierName, titleCase } from '../../shared/labels';
import type { GoalDto, GoalKind, SeriesPoint } from '../../shared/types';
import type { ApiPlayer } from '../brawlstars/types';
import type { Db } from '../db';
import { brawlerHistory, findPlayer, loadBattles, loadSnapshots, playerProfile } from '../repo';
import { MAX_POWER_LEVEL } from './costs';
import type { StoredBattle } from './normalize';
import { isRankedBattle, tierTimeline } from './ranked';
import { DAY_MS, localDayKey } from './time';

export const GOAL_KINDS: GoalKind[] = [
  'trophies',
  'brawler_trophies',
  'ranked_tier',
  'ranked_elo',
  'power11',
  'brawlers_owned',
  'victories_3v3',
];

interface GoalRow {
  id: number;
  tag: string;
  kind: GoalKind;
  brawler_id: number | null;
  target: number;
  start_value: number;
  created_at: string;
  achieved_at: string | null;
}

export interface GoalContext {
  profile: ApiPlayer | null;
  ranked: StoredBattle[];
}

export function goalLabel(kind: GoalKind, target: number, brawlerName?: string | null): string {
  const n = target.toLocaleString('fr-FR');
  switch (kind) {
    case 'trophies':
      return `Atteindre ${n} trophées`;
    case 'brawler_trophies':
      return `${brawlerName ?? 'Brawler'} à ${n} trophées`;
    case 'ranked_tier':
      return `Atteindre ${tierName(target)} en Ranked`;
    case 'ranked_elo':
      return `${n} points en Ranked`;
    case 'power11':
      return `${n} brawlers niveau ${MAX_POWER_LEVEL}`;
    case 'brawlers_owned':
      return `${n} brawlers débloqués`;
    case 'victories_3v3':
      return `${n} victoires 3v3`;
  }
}

export function goalCurrentValue(kind: GoalKind, brawlerId: number | null, context: GoalContext): number | null {
  const { profile } = context;
  switch (kind) {
    case 'trophies':
      return profile?.trophies ?? null;
    case 'brawler_trophies':
      return profile?.brawlers.find((b) => b.id === brawlerId)?.trophies ?? null;
    case 'ranked_tier':
      return profile?.rankedRank ?? tierTimeline(context.ranked).at(-1)?.tier ?? null;
    case 'ranked_elo':
      return profile?.rankedElo ?? null;
    case 'power11':
      return profile ? profile.brawlers.filter((b) => b.power >= MAX_POWER_LEVEL).length : null;
    case 'brawlers_owned':
      return profile?.brawlers.length ?? null;
    case 'victories_3v3':
      return profile?.['3vs3Victories'] ?? null;
  }
}

/** Historique de la valeur suivie par un objectif (pour estimer le rythme). */
export function goalHistory(db: Db, tag: string, kind: GoalKind, brawlerId: number | null, context: GoalContext): SeriesPoint[] {
  switch (kind) {
    case 'brawler_trophies':
      return brawlerId === null
        ? []
        : brawlerHistory(db, tag, brawlerId).map((row) => ({ t: row.taken_at, v: row.trophies }));
    case 'ranked_tier':
      return tierTimeline(context.ranked).map((p) => ({ t: p.t, v: p.tier }));
    default: {
      const column = {
        ranked_elo: 'ranked_elo',
        trophies: 'trophies',
        power11: 'power11',
        brawlers_owned: 'brawlers_owned',
        victories_3v3: 'victories_3v3',
      } as const;
      const key = column[kind];
      return loadSnapshots(db, tag)
        .filter((row) => row[key] !== null)
        .map((row) => ({ t: row.taken_at, v: row[key] as number }));
    }
  }
}

/**
 * Rythme de progression (par jour) : régression linéaire sur les clôtures
 * quotidiennes des `windowDays` derniers jours. null si l'historique est trop court.
 */
export function progressRatePerDay(points: readonly SeriesPoint[], now = Date.now(), windowDays = 14): number | null {
  const since = now - windowDays * DAY_MS;
  const closes = new Map<string, { x: number; v: number }>();
  const before = points.filter((p) => Date.parse(p.t) < since).at(-1);
  if (before) closes.set('start', { x: since, v: before.v });
  for (const point of points) {
    const time = Date.parse(point.t);
    if (time < since) continue;
    closes.set(localDayKey(time), { x: time, v: point.v });
  }
  const samples = [...closes.values()];
  if (samples.length < 2) return null;
  const spanDays = (samples[samples.length - 1].x - samples[0].x) / DAY_MS;
  if (spanDays < 1) return null;
  const xs = samples.map((s) => (s.x - samples[0].x) / DAY_MS);
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanV = samples.reduce((a, s) => a + s.v, 0) / samples.length;
  let num = 0;
  let den = 0;
  xs.forEach((x, i) => {
    num += (x - meanX) * (samples[i].v - meanV);
    den += (x - meanX) ** 2;
  });
  return den === 0 ? null : num / den;
}

function toGoalDto(db: Db, row: GoalRow, context: GoalContext, now: number): GoalDto {
  const brawler = row.brawler_id !== null ? context.profile?.brawlers.find((b) => b.id === row.brawler_id) : undefined;
  const brawlerName = brawler ? titleCase(brawler.name) : null;
  const current = goalCurrentValue(row.kind, row.brawler_id, context);
  const span = row.target - row.start_value;
  const progress =
    current === null ? 0 : span <= 0 ? (current >= row.target ? 1 : 0) : Math.min(1, Math.max(0, (current - row.start_value) / span));
  const rate = row.achieved_at ? null : progressRatePerDay(goalHistory(db, row.tag, row.kind, row.brawler_id, context), now);
  const remaining = current === null ? null : row.target - current;
  const etaDays = rate && rate > 0 && remaining !== null && remaining > 0 ? remaining / rate : null;
  return {
    id: row.id,
    kind: row.kind,
    label: goalLabel(row.kind, row.target, brawlerName),
    brawlerId: row.brawler_id,
    brawlerName,
    target: row.target,
    startValue: row.start_value,
    current,
    progress,
    createdAt: row.created_at,
    achievedAt: row.achieved_at,
    ratePerDay: rate,
    etaDays,
    etaDate: etaDays !== null ? new Date(now + etaDays * DAY_MS).toISOString() : null,
  };
}

export function goalContext(db: Db, tag: string): GoalContext {
  return {
    profile: playerProfile(findPlayer(db, tag)),
    ranked: loadBattles(db, tag).filter(isRankedBattle),
  };
}

export function listGoals(db: Db, tag: string, now = Date.now()): GoalDto[] {
  const rows = db.all<GoalRow>(
    'SELECT * FROM goals WHERE tag = ? ORDER BY achieved_at IS NOT NULL, created_at DESC',
    [tag],
  );
  if (!rows.length) return [];
  const context = goalContext(db, tag);
  return rows.map((row) => toGoalDto(db, row, context, now));
}

export function createGoal(
  db: Db,
  tag: string,
  input: { kind: GoalKind; target: number; brawlerId: number | null },
  now = new Date().toISOString(),
): GoalDto {
  const context = goalContext(db, tag);
  const start = goalCurrentValue(input.kind, input.brawlerId, context) ?? 0;
  const { lastInsertRowid } = db.run(
    'INSERT INTO goals (tag, kind, brawler_id, target, start_value, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [tag, input.kind, input.brawlerId, input.target, start, now],
  );
  refreshGoalAchievements(db, tag, now);
  const row = db.get<GoalRow>('SELECT * FROM goals WHERE id = ?', [lastInsertRowid])!;
  return toGoalDto(db, row, context, Date.parse(now));
}

/** Marque comme atteints les objectifs dont la valeur actuelle dépasse la cible. */
export function refreshGoalAchievements(db: Db, tag: string, now = new Date().toISOString()): void {
  const open = db.all<GoalRow>('SELECT * FROM goals WHERE tag = ? AND achieved_at IS NULL', [tag]);
  if (!open.length) return;
  const context = goalContext(db, tag);
  for (const goal of open) {
    const current = goalCurrentValue(goal.kind, goal.brawler_id, context);
    if (current !== null && current >= goal.target) {
      db.run('UPDATE goals SET achieved_at = ? WHERE id = ?', [now, goal.id]);
    }
  }
}
