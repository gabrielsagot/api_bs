import { battleCategory, titleCase } from '../../shared/labels';
import type { BreakdownRow, Outcome, SessionDto, StreakDto, WinLoss } from '../../shared/types';
import type { StoredBattle } from './normalize';

// Briques d'agrégation communes à toutes les pages.

export function winRate(wins: number, losses: number): number | null {
  return wins + losses > 0 ? wins / (wins + losses) : null;
}

/**
 * Winrate « lissé » (moyenne bayésienne) : avec peu de parties, on reste proche
 * de `prior`. Évite qu'un 2/2 passe devant un 30/45.
 */
export function shrunkWinRate(stats: { wins: number; losses: number }, prior = 0.5, strength = 3): number {
  return (stats.wins + prior * strength) / (stats.wins + stats.losses + strength);
}

export function winLoss(battles: readonly { outcome: Outcome | null }[]): WinLoss {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const battle of battles) {
    if (battle.outcome === 'win') wins++;
    else if (battle.outcome === 'loss') losses++;
    else if (battle.outcome === 'draw') draws++;
  }
  return { games: battles.length, wins, losses, draws, winRate: winRate(wins, losses) };
}

export interface GroupKey {
  key: string;
  label: string;
  id?: number | null;
  sub?: string | null;
}

interface Accumulator {
  row: BreakdownRow;
  trophyGames: number;
}

/**
 * Regroupe les combats par clé (mode, map, brawler…). Un combat peut compter
 * pour plusieurs clés (ex. les brawlers adverses) : `keysOf` renvoie alors une liste.
 */
export function breakdown(
  battles: readonly StoredBattle[],
  keysOf: (battle: StoredBattle) => GroupKey | GroupKey[] | null,
  options: { minGames?: number; limit?: number } = {},
): BreakdownRow[] {
  const groups = new Map<string, Accumulator>();
  for (const battle of battles) {
    const keys = keysOf(battle);
    if (!keys) continue;
    for (const group of Array.isArray(keys) ? keys : [keys]) {
      let acc = groups.get(group.key);
      if (!acc) {
        acc = {
          row: {
            key: group.key,
            label: group.label,
            id: group.id ?? null,
            sub: group.sub ?? null,
            games: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            winRate: null,
            starPlayers: 0,
            trophyNet: null,
          },
          trophyGames: 0,
        };
        groups.set(group.key, acc);
      }
      const row = acc.row;
      row.games++;
      if (battle.outcome === 'win') row.wins++;
      else if (battle.outcome === 'loss') row.losses++;
      else if (battle.outcome === 'draw') row.draws++;
      if (battle.starPlayer) row.starPlayers++;
      if (battle.trophyChange !== null) {
        row.trophyNet = (row.trophyNet ?? 0) + battle.trophyChange;
        acc.trophyGames++;
      }
    }
  }
  const rows = [...groups.values()]
    .map(({ row }) => ({ ...row, winRate: winRate(row.wins, row.losses) }))
    .filter((row) => row.games >= (options.minGames ?? 1))
    .sort((a, b) => b.games - a.games || (b.winRate ?? -1) - (a.winRate ?? -1) || a.label.localeCompare(b.label));
  return options.limit ? rows.slice(0, options.limit) : rows;
}

export const byBrawlerKey = (battle: StoredBattle): GroupKey | null =>
  battle.brawlerId === null
    ? null
    : { key: String(battle.brawlerId), label: titleCase(battle.brawlerName), id: battle.brawlerId };

export const byMapKey = (battle: StoredBattle): GroupKey | null =>
  battle.map ? { key: `${battle.mode}|${battle.map}`, label: battle.map, sub: battle.mode } : null;

export const byModeKey = (battle: StoredBattle): GroupKey => ({ key: battle.mode, label: battle.mode });

export const vsBrawlerKeys = (battle: StoredBattle): GroupKey[] => {
  const seen = new Set<number>();
  const keys: GroupKey[] = [];
  for (const p of battle.participants) {
    if (p.side !== 'enemy' || p.brawlerId === null || seen.has(p.brawlerId)) continue;
    seen.add(p.brawlerId);
    keys.push({ key: String(p.brawlerId), label: titleCase(p.brawlerName), id: p.brawlerId });
  }
  return keys;
};

export const allyKeys = (battle: StoredBattle): GroupKey[] =>
  battle.participants
    .filter((p) => p.side === 'ally')
    .map((p) => ({ key: p.tag, label: p.name, sub: p.tag }));

/**
 * Coéquipiers retrouvés à plusieurs occasions. Un inconnu croisé sur les 3 manches
 * d'un même set n'est pas un « coéquipier régulier » : on exige un écart d'au moins
 * `minSpanMs` entre la première et la dernière partie ensemble.
 */
export function frequentAllies(
  battles: readonly StoredBattle[],
  minGames = 3,
  minSpanMs = 30 * 60 * 1000,
): BreakdownRow[] {
  const spans = new Map<string, { first: number; last: number }>();
  for (const battle of battles) {
    const time = Date.parse(battle.battleTime);
    for (const p of battle.participants) {
      if (p.side !== 'ally') continue;
      const span = spans.get(p.tag);
      if (span) {
        span.first = Math.min(span.first, time);
        span.last = Math.max(span.last, time);
      } else {
        spans.set(p.tag, { first: time, last: time });
      }
    }
  }
  return breakdown(battles, allyKeys, { minGames }).filter((row) => {
    const span = spans.get(row.key);
    return span !== undefined && span.last - span.first >= minSpanMs;
  });
}

/** Série en cours (la plus récente), en ignorant les combats sans résultat. */
export function currentStreak(outcomes: readonly (Outcome | null)[]): StreakDto {
  let kind: Outcome | null = null;
  let count = 0;
  for (let i = outcomes.length - 1; i >= 0; i--) {
    const outcome = outcomes[i];
    if (outcome === null) continue;
    if (kind === null) kind = outcome;
    if (outcome !== kind) break;
    count++;
  }
  return { kind, count };
}

export function longestWinStreak(outcomes: readonly (Outcome | null)[]): number {
  let best = 0;
  let run = 0;
  for (const outcome of outcomes) {
    if (outcome === null) continue;
    run = outcome === 'win' ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Taux de star player, calculé sur les modes en équipe (où le titre existe). */
export function starPlayerRate(battles: readonly StoredBattle[]): number | null {
  const eligible = battles.filter((b) => b.teamsCount === 2 && b.outcome !== null);
  if (!eligible.length) return null;
  return eligible.filter((b) => b.starPlayer).length / eligible.length;
}

/** Découpe l'historique en sessions (pause de plus de `gapMs` = nouvelle session). Plus récente d'abord. */
export function buildSessions(battles: readonly StoredBattle[], gapMs = 30 * 60 * 1000): SessionDto[] {
  const groups: StoredBattle[][] = [];
  let lastTime = -Infinity;
  for (const battle of battles) {
    const time = Date.parse(battle.battleTime);
    if (time - lastTime > gapMs) groups.push([]);
    groups[groups.length - 1].push(battle);
    lastTime = time;
  }
  return groups.map(toSession).reverse();
}

function toSession(battles: StoredBattle[]): SessionDto {
  const stats = winLoss(battles);
  const brawlers = new Map<number, { id: number; name: string; games: number }>();
  for (const battle of battles) {
    if (battle.brawlerId === null) continue;
    const entry = brawlers.get(battle.brawlerId) ?? { id: battle.brawlerId, name: titleCase(battle.brawlerName), games: 0 };
    entry.games++;
    brawlers.set(battle.brawlerId, entry);
  }
  return {
    start: battles[0]?.battleTime ?? '',
    end: battles[battles.length - 1]?.battleTime ?? '',
    games: stats.games,
    wins: stats.wins,
    losses: stats.losses,
    draws: stats.draws,
    trophyNet: battles.reduce((sum, b) => sum + (b.trophyChange ?? 0), 0),
    rankedGames: battles.filter((b) => battleCategory(b.type) === 'ranked').length,
    brawlers: [...brawlers.values()].sort((a, b) => b.games - a.games),
  };
}
