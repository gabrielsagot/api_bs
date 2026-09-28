import { battleCategory, isKnownTier, titleCase } from '../../shared/labels';
import type {
  MapPicksDto,
  Outcome,
  ParticipantDto,
  RankedCore,
  RankedQueue,
  RankedSetDto,
  SetOutcome,
  TierPoint,
  WinLoss,
} from '../../shared/types';
import {
  breakdown,
  byBrawlerKey,
  byMapKey,
  currentStreak,
  shrunkWinRate,
  starPlayerRate,
  winLoss,
  winRate,
} from './aggregate';
import type { StoredBattle } from './normalize';

// Mode Ranked : les matchs se jouent en BO3 et l'API liste chaque manche
// séparément. On reconstitue les « sets » en regroupant les manches consécutives
// contre les mêmes adversaires, sur la même map.

const SET_GAP_MS = 12 * 60 * 1000;
const ONGOING_MS = 15 * 60 * 1000;

export function isRankedBattle(battle: { type: string }): boolean {
  return battleCategory(battle.type) === 'ranked';
}

export function matchesQueue(battle: { type: string }, queue: RankedQueue): boolean {
  if (queue === 'all') return true;
  return queue === 'team' ? battle.type === 'teamRanked' : battle.type !== 'teamRanked';
}

export function displayParticipant(p: ParticipantDto): ParticipantDto {
  return { ...p, brawlerName: p.brawlerName ? titleCase(p.brawlerName) : null };
}

function opponentsKey(battle: StoredBattle): string {
  return battle.participants
    .filter((p) => p.side === 'enemy')
    .map((p) => p.tag.toUpperCase())
    .sort()
    .join(',');
}

interface SetAccumulator {
  key: string;
  games: StoredBattle[];
  wins: number;
  losses: number;
  draws: number;
}

/** Regroupe les manches classées (ordre chronologique) en sets. Renvoie les plus récents d'abord. */
export function groupRankedSets(battles: readonly StoredBattle[], now = Date.now()): RankedSetDto[] {
  const sets: SetAccumulator[] = [];
  for (const battle of battles) {
    const key = `${battle.type}|${battle.map ?? ''}|${opponentsKey(battle)}`;
    let current = sets[sets.length - 1];
    const previous = current?.games[current.games.length - 1];
    const continues =
      current !== undefined &&
      previous !== undefined &&
      current.key === key &&
      current.wins < 2 &&
      current.losses < 2 &&
      Date.parse(battle.battleTime) - Date.parse(previous.battleTime) <= SET_GAP_MS;
    if (!continues) {
      current = { key, games: [], wins: 0, losses: 0, draws: 0 };
      sets.push(current);
    }
    current.games.push(battle);
    if (battle.outcome === 'win') current.wins++;
    else if (battle.outcome === 'loss') current.losses++;
    else if (battle.outcome === 'draw') current.draws++;
  }
  // Si aucune manche n'a jamais été regroupée, l'API renvoie sans doute un combat par match :
  // chaque « set » d'une manche est alors décidé par cette manche.
  const bestOfDetected = sets.some((set) => set.games.length >= 2);
  return sets.map((set) => toSetDto(set, now, bestOfDetected)).reverse();
}

function toSetDto(set: SetAccumulator, now: number, bestOfDetected: boolean): RankedSetDto {
  const first = set.games[0];
  const last = set.games[set.games.length - 1];
  let outcome: SetOutcome;
  if (set.wins >= 2) outcome = 'win';
  else if (set.losses >= 2) outcome = 'loss';
  else if (!bestOfDetected && last.outcome) outcome = last.outcome;
  else if (now - Date.parse(last.battleTime) < ONGOING_MS) outcome = 'ongoing';
  else outcome = 'partial';
  const self = last.participants.find((p) => p.side === 'self') ?? null;
  return {
    id: first.battleTime,
    start: first.battleTime,
    end: last.battleTime,
    type: first.type,
    mode: first.mode,
    map: first.map,
    wins: set.wins,
    losses: set.losses,
    draws: set.draws,
    outcome,
    tier: isKnownTier(self?.trophies) ? self.trophies : null,
    games: set.games.map((game) => ({
      battleTime: game.battleTime,
      outcome: game.outcome,
      brawlerId: game.brawlerId,
      brawlerName: game.brawlerName ? titleCase(game.brawlerName) : null,
      starPlayer: game.starPlayer,
      duration: game.duration,
    })),
    self: self ? displayParticipant(self) : null,
    allies: last.participants.filter((p) => p.side === 'ally').map(displayParticipant),
    enemies: last.participants.filter((p) => p.side === 'enemy').map(displayParticipant),
  };
}

const isDecided = (set: RankedSetDto) => set.outcome === 'win' || set.outcome === 'loss' || set.outcome === 'draw';

function setWinLoss(sets: readonly RankedSetDto[]): WinLoss {
  const decided = sets.filter(isDecided);
  const wins = decided.filter((s) => s.outcome === 'win').length;
  const losses = decided.filter((s) => s.outcome === 'loss').length;
  return { games: decided.length, wins, losses, draws: decided.length - wins - losses, winRate: winRate(wins, losses) };
}

/** Évolution du rang : un point à chaque changement, plus le dernier combat. */
export function tierTimeline(battles: readonly StoredBattle[]): TierPoint[] {
  const points: TierPoint[] = [];
  let lastKnown: TierPoint | null = null;
  for (const battle of battles) {
    const tier = battle.brawlerTrophies;
    if (!isKnownTier(tier)) continue;
    lastKnown = { t: battle.battleTime, tier };
    if (points[points.length - 1]?.tier !== tier) points.push(lastKnown);
  }
  if (lastKnown && points[points.length - 1] !== lastKnown) points.push(lastKnown);
  return points;
}

export interface RankedCoreResult extends RankedCore {
  periodBattles: StoredBattle[];
  periodSets: RankedSetDto[];
}

/**
 * Indicateurs Ranked d'une période.
 * @param ranked toutes les manches classées du joueur (ordre chronologique), file déjà filtrée
 */
export function rankedCore(
  ranked: readonly StoredBattle[],
  since: string | null,
  prevSince: string | null,
  now = Date.now(),
): RankedCoreResult {
  const periodBattles = since ? ranked.filter((b) => b.battleTime >= since) : [...ranked];
  const previousBattles =
    since && prevSince ? ranked.filter((b) => b.battleTime >= prevSince && b.battleTime < since) : [];

  const allSets = groupRankedSets(ranked, now);
  const periodSets = since ? allSets.filter((s) => s.end >= since) : allSets;
  const detected = allSets.some((s) => s.games.length >= 2);

  const fullTimeline = tierTimeline(ranked);
  const before = since ? fullTimeline.filter((p) => p.t < since).at(-1) : undefined;
  const inPeriod = since ? fullTimeline.filter((p) => p.t >= since) : fullTimeline;
  const timeline = before && since ? [{ t: since, tier: before.tier }, ...inPeriod] : inPeriod;

  const periodTiers = periodBattles.map((b) => b.brawlerTrophies).filter(isKnownTier);
  const decidedChronological = allSets.filter(isDecided).reverse();

  return {
    games: winLoss(periodBattles),
    previous: winLoss(previousBattles),
    sets: { ...setWinLoss(periodSets), detected },
    starPlayerRate: starPlayerRate(periodBattles),
    currentTier: fullTimeline.at(-1)?.tier ?? null,
    bestTier: periodTiers.length ? Math.max(...periodTiers) : null,
    startTier: before?.tier ?? inPeriod[0]?.tier ?? null,
    // Série en cours : en sets quand le BO3 est détecté, sinon en manches.
    streak: detected
      ? currentStreak(decidedChronological.map((s) => s.outcome as Outcome))
      : currentStreak(ranked.map((b) => b.outcome)),
    timeline,
    periodBattles,
    periodSets,
  };
}

/**
 * Pour chaque map jouée en Ranked : tes meilleurs brawlers. Winrate fortement lissé
 * vers ton winrate sur la map, pour qu'un 2–0 ne passe pas devant un 13–7.
 */
export function mapPicks(battles: readonly StoredBattle[], minGames = 2): MapPicksDto[] {
  return breakdown(battles, byMapKey, { minGames }).map((mapRow) => {
    const onMap = battles.filter((b) => b.map === mapRow.label && b.mode === mapRow.sub);
    const prior = mapRow.winRate ?? 0.5;
    const best = breakdown(onMap, byBrawlerKey)
      .filter((row) => row.wins + row.losses >= 2)
      .sort((a, b) => shrunkWinRate(b, prior, 8) - shrunkWinRate(a, prior, 8) || b.games - a.games)
      .slice(0, 3);
    return { map: mapRow.label, mode: mapRow.sub ?? '', games: mapRow.games, winRate: mapRow.winRate, best };
  }).filter((pick) => pick.best.length > 0);
}
