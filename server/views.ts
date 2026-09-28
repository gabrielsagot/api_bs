import { battleCategory, titleCase, type BattleCategory } from '../shared/labels';
import type {
  BattleDto,
  BreakdownRow,
  BattleFilters,
  BattleListResponse,
  BattleStatsResponse,
  BrawlerDetailResponse,
  LiveSessionResponse,
  CollectionResponse,
  CompareResponse,
  OverviewResponse,
  PrestigeCandidateDto,
  Period,
  RankedProfileDto,
  RankedQueue,
  RankedResponse,
  RankedSetDto,
  RotationResponse,
  SeriesPoint,
  TrophiesResponse,
  WinLoss,
} from '../shared/types';
import type { CatalogService, RotationService } from './catalog';
import type { Db } from './db';
import {
  brawlerHistory,
  brawlerStatesAt,
  firstBrawlerStates,
  firstSnapshot,
  loadBattles,
  loadRankedBattles,
  loadSnapshots,
  playerProfile,
  snapshotAt,
  toProfileDto,
  toListItem,
  type PlayerRow,
} from './repo';
import {
  breakdown,
  buildSessions,
  byBrawlerKey,
  byMapKey,
  byModeKey,
  currentStreak,
  frequentAllies,
  longestWinStreak,
  starPlayerRate,
  vsBrawlerKeys,
  winLoss,
  winRate,
} from './stats/aggregate';
import { buildCard, buildCollection, costLines, upgradePriorities } from './stats/collection';
import type { ApiPlayer } from './brawlstars/types';
import { MAX_POWER_LEVEL } from './stats/costs';
import { listGoals } from './stats/goals';
import type { StoredBattle } from './stats/normalize';
import { displayParticipant, groupRankedSets, mapPicks, matchesQueue, rankedCore, tierTimeline } from './stats/ranked';
import { duoStats } from './stats/duo';
import { attachEloChanges, nextTierInfo, tierThresholds, type EloSample } from './stats/elo';
import { recommendForSlot, type OwnedBrawler } from './stats/recommend';
import { DAY_MS, isoAgo, periodRange } from './stats/time';
import { dailyDeltas, trophySeries } from './stats/trophies';

// Assemblage des réponses de chaque page à partir de la base.

export interface ViewDeps {
  db: Db;
  catalog: CatalogService;
  rotation: RotationService;
}

export function toBattleDto(battle: StoredBattle): BattleDto {
  return {
    ...battle,
    category: battleCategory(battle.type),
    brawlerName: battle.brawlerName ? titleCase(battle.brawlerName) : null,
    participants: battle.participants.map(displayParticipant),
  };
}

function statsByBrawler(battles: readonly StoredBattle[]): Map<number, WinLoss> {
  return new Map(breakdown(battles, byBrawlerKey).map((row) => [row.id!, row]));
}

/**
 * Référence d'un écart : sans au moins une heure d'historique, un écart « 0 sur 30 j »
 * serait trompeur (le suivi vient de commencer) ; on renvoie alors undefined.
 */
function usableReference<T extends { taken_at: string }>(reference: T | undefined, now = Date.now()): T | undefined {
  return reference && now - Date.parse(reference.taken_at) >= 60 * 60 * 1000 ? reference : undefined;
}

/** Relevés de points Ranked (un par instantané de profil). */
function eloSamples(db: Db, tag: string): EloSample[] {
  return loadSnapshots(db, tag)
    .filter((s) => s.ranked_elo !== null)
    .map((s) => ({ t: s.taken_at, elo: s.ranked_elo as number }));
}

/** Points gagnés ou perdus sur chaque set, calculés sur toutes les files (clé = id du set). */
function eloBySet(db: Db, tag: string, ranked: readonly StoredBattle[], now: number): Map<string, number | null> {
  const sets = groupRankedSets(ranked, now);
  attachEloChanges(sets, eloSamples(db, tag));
  return new Map(sets.map((set) => [set.id, set.eloChange]));
}

/**
 * Points (ELO) et records Ranked lus dans le profil, avec leur évolution
 * enregistrée par le dashboard depuis `since`, et le rang suivant.
 */
function rankedProfileView(
  db: Db,
  row: PlayerRow,
  since: string | null,
  now: number,
  setChanges: ReadonlyMap<string, number | null> = new Map(),
): RankedProfileDto {
  const profile = playerProfile(row);
  const samples = loadSnapshots(db, row.tag, since)
    .filter((s) => s.ranked_elo !== null)
    .map((s) => ({ taken_at: s.taken_at, trophies: s.ranked_elo as number }));
  const before = since ? snapshotAt(db, row.tag, since) : undefined;
  const baseline = before?.ranked_elo != null ? { taken_at: before.taken_at, trophies: before.ranked_elo } : undefined;
  const elo = profile?.rankedElo ?? null;
  const reference = usableReference(baseline ?? samples[0], now);
  const observations = loadSnapshots(db, row.tag)
    .filter((s) => s.ranked_elo !== null && s.ranked_rank !== null)
    .map((s) => ({ elo: s.ranked_elo as number, tier: s.ranked_rank as number }));
  const recentChanges = [...setChanges.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, change]) => change)
    .filter((change): change is number => change !== null)
    .slice(0, 20);
  return {
    ...nextTierInfo(elo, profile?.rankedRank ?? null, tierThresholds(observations), recentChanges),
    seasonId: profile?.rankedSeasonId ?? null,
    elo,
    tier: profile?.rankedRank ?? null,
    seasonBestElo: profile?.highestSeasonRankedElo ?? null,
    seasonBestTier: profile?.highestSeasonRankedRank ?? null,
    allTimeBestElo: profile?.highestAllTimeRankedElo ?? null,
    allTimeBestTier: profile?.highestAllTimeRankedRank ?? null,
    eloDelta: elo !== null && reference ? elo - reference.trophies : null,
    eloSeries: trophySeries(samples, baseline, since, new Date(now).toISOString(), 300),
  };
}

/** Variation des trophées depuis `since` (ou depuis le début du suivi s'il est plus récent). */
function trophyDeltaSince(db: Db, tag: string, since: string, current: number | null): number | null {
  if (current === null) return null;
  const baseline = usableReference(snapshotAt(db, tag, since) ?? firstSnapshot(db, tag));
  return baseline ? current - baseline.trophies : null;
}

// ── Accueil ───────────────────────────────────────────────────

export function overviewView({ db, catalog }: ViewDeps, row: PlayerRow, now = Date.now()): OverviewResponse {
  const profile = playerProfile(row);
  const { since, prevSince } = periodRange('30d', now);
  const allRanked = loadRankedBattles(db, row.tag);
  const setChanges = eloBySet(db, row.tag, allRanked, now);
  const core = rankedCore(allRanked, since, prevSince, now, setChanges);
  const { periodBattles, periodSets, ...rankedStats } = core;
  const rankedProfile = rankedProfileView(db, row, since, now, setChanges);

  const since7d = isoAgo(7 * DAY_MS, now);
  const current = profile?.trophies ?? null;
  const recentBattles = loadBattles(db, row.tag, since7d);

  return {
    player: toProfileDto(row),
    ranked: {
      ...rankedStats,
      // Le profil donne le rang exact, même sans partie classée récente.
      currentTier: rankedProfile.tier ?? rankedStats.currentTier,
      profile: rankedProfile,
      recentSets: periodSets.slice(0, 8),
      topBrawlers: breakdown(periodBattles, byBrawlerKey, { limit: 5 }),
      topMaps: breakdown(periodBattles, byMapKey, { limit: 5 }),
    },
    trophies: {
      current,
      highest: profile?.highestTrophies ?? null,
      delta24h: trophyDeltaSince(db, row.tag, isoAgo(DAY_MS, now), current),
      delta7d: trophyDeltaSince(db, row.tag, since7d, current),
      series: trophySeries(
        loadSnapshots(db, row.tag, since7d),
        snapshotAt(db, row.tag, since7d),
        since7d,
        new Date(now).toISOString(),
        120,
      ),
    },
    lastSession: buildSessions(recentBattles)[0] ?? null,
    goals: listGoals(db, row.tag, now)
      .filter((goal) => !goal.achievedAt)
      .slice(0, 3),
    collection: {
      owned: profile?.brawlers.length ?? 0,
      total: catalog.get()?.brawlers.length ?? null,
      power11: profile?.brawlers.filter((b) => b.power >= MAX_POWER_LEVEL).length ?? 0,
    },
  };
}

// ── Ranked ────────────────────────────────────────────────────

export function rankedView(
  { db }: ViewDeps,
  row: PlayerRow,
  period: Period,
  queue: RankedQueue,
  now = Date.now(),
): RankedResponse {
  const allRanked = loadRankedBattles(db, row.tag);
  const setChanges = eloBySet(db, row.tag, allRanked, now);
  const ranked = allRanked.filter((b) => matchesQueue(b, queue));
  const { since, prevSince } = periodRange(period, now);
  const { periodBattles, periodSets, ...core } = rankedCore(ranked, since, prevSince, now, setChanges);
  const profile = rankedProfileView(db, row, since, now, setChanges);
  const withElo = <T extends BreakdownRow>(rows: T[], keyOf: (set: RankedSetDto) => string | null): T[] => {
    const totals = new Map<string, number>();
    for (const set of periodSets) {
      const key = keyOf(set);
      if (key === null || set.eloChange === null) continue;
      totals.set(key, (totals.get(key) ?? 0) + set.eloChange);
    }
    return rows.map((row) => ({ ...row, eloNet: totals.get(row.key) ?? null }));
  };
  return {
    ...core,
    currentTier: profile.tier ?? core.currentTier,
    profile,
    period,
    queue,
    byBrawler: withElo(breakdown(periodBattles, byBrawlerKey), (set) =>
      set.self?.brawlerId ? String(set.self.brawlerId) : null,
    ),
    byMap: withElo(breakdown(periodBattles, byMapKey), (set) => (set.map ? `${set.mode}|${set.map}` : null)),
    byMode: withElo(breakdown(periodBattles, byModeKey), (set) => set.mode),
    vsBrawlers: breakdown(periodBattles, vsBrawlerKeys, { minGames: 2 }),
    allies: frequentAllies(periodBattles),
    duos: duoStats(periodBattles, periodSets),
    recentSets: periodSets.slice(0, 40),
    mapPicks: mapPicks(periodBattles),
  };
}

// ── Trophées ──────────────────────────────────────────────────

export function trophiesView({ db }: ViewDeps, row: PlayerRow, period: Period, now = Date.now()): TrophiesResponse {
  const profile = playerProfile(row);
  const { since } = periodRange(period, now);
  const snapshots = loadSnapshots(db, row.tag, since);
  const baseline = since ? snapshotAt(db, row.tag, since) : undefined;
  const current = profile?.trophies ?? snapshots.at(-1)?.trophies ?? null;
  const reference = usableReference(baseline ?? snapshots[0], now);

  const trophyBattles = loadBattles(db, row.tag, since).filter((b) => battleCategory(b.type) === 'trophies');
  const games = winLoss(trophyBattles);
  const trophyNet = trophyBattles.reduce((sum, b) => sum + (b.trophyChange ?? 0), 0);
  const perBrawler = new Map(breakdown(trophyBattles, byBrawlerKey).map((r) => [r.id, r]));

  const startStates = since ? brawlerStatesAt(db, row.tag, since) : new Map();
  const firstStates = firstBrawlerStates(db, row.tag);

  return {
    period,
    current,
    highest: profile?.highestTrophies ?? null,
    delta: current !== null && reference ? current - reference.trophies : null,
    series: trophySeries(snapshots, baseline, since, new Date(now).toISOString()),
    daily: dailyDeltas(snapshots, baseline),
    trophyGames: { ...games, trophyNet, avgPerGame: trophyBattles.length ? trophyNet / trophyBattles.length : null },
    brawlers: (profile?.brawlers ?? [])
      .map((brawler) => {
        const start = startStates.get(brawler.id) ?? usableReference(firstStates.get(brawler.id), now);
        const stats = perBrawler.get(brawler.id);
        return {
          id: brawler.id,
          name: titleCase(brawler.name),
          power: brawler.power,
          trophies: brawler.trophies,
          highestTrophies: brawler.highestTrophies,
          prestige: typeof brawler.prestigeLevel === 'number' ? brawler.prestigeLevel : null,
          delta: start ? brawler.trophies - start.trophies : null,
          games: stats?.games ?? 0,
          winRate: stats?.winRate ?? null,
          trophyNet: stats?.trophyNet ?? null,
          currentWinStreak: typeof brawler.currentWinStreak === 'number' ? brawler.currentWinStreak : null,
          maxWinStreak: typeof brawler.maxWinStreak === 'number' ? brawler.maxWinStreak : null,
        };
      })
      .sort((a, b) => b.trophies - a.trophies),
    prestige: {
      total: profile?.totalPrestigeLevel ?? null,
      candidates: prestigeCandidates(profile, loadBattles(db, row.tag, isoAgo(30 * DAY_MS, now))),
    },
    streaks: (profile?.brawlers ?? [])
      .filter((b) => typeof b.currentWinStreak === 'number' && b.currentWinStreak >= 2)
      .map((b) => ({
        id: b.id,
        name: titleCase(b.name),
        current: b.currentWinStreak as number,
        max: typeof b.maxWinStreak === 'number' ? b.maxWinStreak : null,
      }))
      .sort((a, b) => b.current - a.current),
  };
}

/**
 * Planificateur de prestige : les brawlers les plus proches de leur prochain palier
 * (tous les 1 000 trophées), avec une estimation du nombre de parties d'après leur
 * gain moyen sur les parties de trophées des 30 derniers jours.
 */
function prestigeCandidates(profile: ApiPlayer | null, recent: readonly StoredBattle[]): PrestigeCandidateDto[] {
  const trophyGames = recent.filter((b) => battleCategory(b.type) === 'trophies');
  const stats = new Map(breakdown(trophyGames, byBrawlerKey).map((r) => [r.id, r]));
  return (profile?.brawlers ?? [])
    .map((brawler) => {
      const nextMilestone = (Math.floor(brawler.trophies / 1000) + 1) * 1000;
      const remaining = nextMilestone - brawler.trophies;
      const row = stats.get(brawler.id);
      const avgPerGame = row && row.trophyNet !== null && row.games ? row.trophyNet / row.games : null;
      return {
        id: brawler.id,
        name: titleCase(brawler.name),
        trophies: brawler.trophies,
        prestige: typeof brawler.prestigeLevel === 'number' ? brawler.prestigeLevel : null,
        nextMilestone,
        remaining,
        games: row?.games ?? 0,
        winRate: row?.winRate ?? null,
        avgPerGame,
        gamesToNext: avgPerGame !== null && avgPerGame > 0 ? Math.ceil(remaining / avgPerGame) : null,
        currentWinStreak: typeof brawler.currentWinStreak === 'number' ? brawler.currentWinStreak : null,
      };
    })
    .sort((a, b) => (a.gamesToNext ?? Infinity) - (b.gamesToNext ?? Infinity) || a.remaining - b.remaining)
    .slice(0, 12);
}

// ── Combats ───────────────────────────────────────────────────

function applyFilters(battles: readonly StoredBattle[], filters: BattleFilters): StoredBattle[] {
  return battles.filter(
    (b) =>
      (filters.category === 'all' || battleCategory(b.type) === filters.category) &&
      (filters.mode === null || b.mode === filters.mode) &&
      (filters.map === null || b.map === filters.map) &&
      (filters.brawlerId === null || b.brawlerId === filters.brawlerId),
  );
}

export function battleStatsView({ db }: ViewDeps, row: PlayerRow, filters: BattleFilters, now = Date.now()): BattleStatsResponse {
  const { since } = periodRange(filters.period, now);
  const inPeriod = loadBattles(db, row.tag, since);
  const battles = applyFilters(inPeriod, filters);
  const outcomes = battles.map((b) => b.outcome);
  const durations = battles.map((b) => b.duration).filter((d): d is number => d !== null && d > 0);
  const withTrophies = battles.filter((b) => b.trophyChange !== null);

  const modes = new Map<string, string>();
  const maps = new Set<string>();
  const brawlers = new Map<number, string>();
  for (const b of inPeriod) {
    modes.set(b.mode, b.mode);
    if (b.map) maps.add(b.map);
    if (b.brawlerId !== null) brawlers.set(b.brawlerId, titleCase(b.brawlerName));
  }

  return {
    filters,
    summary: {
      ...winLoss(battles),
      starPlayerRate: starPlayerRate(battles),
      avgDuration: durations.length ? durations.reduce((a, d) => a + d, 0) / durations.length : null,
      trophyNet: withTrophies.length ? withTrophies.reduce((sum, b) => sum + (b.trophyChange ?? 0), 0) : null,
      longestWinStreak: longestWinStreak(outcomes),
      streak: currentStreak(outcomes),
    },
    byMode: breakdown(battles, byModeKey),
    byMap: breakdown(battles, byMapKey),
    byBrawler: breakdown(battles, byBrawlerKey),
    byCategory: breakdown(battles, (b) => {
      const category: BattleCategory = battleCategory(b.type);
      return { key: category, label: category };
    }),
    allies: frequentAllies(battles),
    vsBrawlers: breakdown(battles, vsBrawlerKeys, { minGames: 3 }),
    sessions: buildSessions(battles).slice(0, 30),
    options: {
      modes: [...modes.keys()].sort().map((key) => ({ key, label: key })),
      maps: [...maps].sort((a, b) => a.localeCompare(b)),
      brawlers: [...brawlers.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
  };
}

export function battleListView(
  { db }: ViewDeps,
  row: PlayerRow,
  filters: BattleFilters,
  limit: number,
  offset: number,
  now = Date.now(),
): BattleListResponse {
  const { since } = periodRange(filters.period, now);
  const battles = applyFilters(loadBattles(db, row.tag, since), filters).reverse();
  return { total: battles.length, items: battles.slice(offset, offset + limit).map(toBattleDto) };
}

// ── Collection ────────────────────────────────────────────────

export function collectionView({ db, catalog }: ViewDeps, row: PlayerRow, now = Date.now()): CollectionResponse {
  const battles = loadBattles(db, row.tag);
  const collection = buildCollection(playerProfile(row), catalog.get()?.brawlers ?? null, statsByBrawler(battles));
  const since = isoAgo(60 * DAY_MS, now);
  const recent = new Map<number, { games: number; ranked: number; wins: number; losses: number }>();
  for (const battle of battles) {
    if (battle.battleTime < since || battle.brawlerId === null) continue;
    const entry = recent.get(battle.brawlerId) ?? { games: 0, ranked: 0, wins: 0, losses: 0 };
    entry.games++;
    if (battleCategory(battle.type) === 'ranked') entry.ranked++;
    if (battle.outcome === 'win') entry.wins++;
    if (battle.outcome === 'loss') entry.losses++;
    recent.set(battle.brawlerId, entry);
  }
  return { ...collection, priorities: upgradePriorities(collection.brawlers, recent) };
}

export function brawlerDetailView(
  { db, catalog }: ViewDeps,
  row: PlayerRow,
  brawlerId: number,
  now = Date.now(),
): BrawlerDetailResponse | null {
  const profile = playerProfile(row);
  const owned = profile?.brawlers.find((b) => b.id === brawlerId);
  const catalogEntry = catalog.get()?.brawlers.find((b) => b.id === brawlerId);
  if (!owned && !catalogEntry) return null;

  const battles = loadBattles(db, row.tag).filter((b) => b.brawlerId === brawlerId);
  const stats = winLoss(battles);
  const card = buildCard(catalogEntry, owned, stats);
  const history: SeriesPoint[] = brawlerHistory(db, row.tag, brawlerId).map((s) => ({ t: s.taken_at, v: s.trophies }));
  const last = history.at(-1);
  if (last) history.push({ t: new Date(now).toISOString(), v: last.v });
  const withTrophies = battles.filter((b) => b.trophyChange !== null);

  return {
    card,
    history,
    stats: {
      ...stats,
      starPlayerRate: starPlayerRate(battles),
      trophyNet: withTrophies.length ? withTrophies.reduce((sum, b) => sum + (b.trophyChange ?? 0), 0) : null,
    },
    byMode: breakdown(battles, byModeKey),
    byMap: breakdown(battles, byMapKey, { limit: 12 }),
    recent: battles.slice(-15).reverse().map(toBattleDto),
    costLines: costLines(card),
  };
}

// ── Rotation ──────────────────────────────────────────────────

export function rotationView({ db, rotation }: ViewDeps, row: PlayerRow, now = Date.now()): RotationResponse {
  const cached = rotation.get();
  const profile = playerProfile(row);
  const owned = new Map<number, OwnedBrawler>(
    (profile?.brawlers ?? []).map((b) => [
      b.id,
      { id: b.id, name: titleCase(b.name), trophies: b.trophies, power: b.power },
    ]),
  );
  const battles = loadBattles(db, row.tag, isoAgo(180 * DAY_MS, now));
  const events = (cached?.slots ?? [])
    .filter((slot) => Date.parse(slot.endTime) > now)
    .map((slot) => ({ ...slot, ...recommendForSlot(slot, battles, owned) }));
  return { fetchedAt: cached?.fetchedAt ?? null, events };
}

// ── Comparaison ───────────────────────────────────────────────

export function compareView({ db }: ViewDeps, rows: PlayerRow[], now = Date.now()): CompareResponse {
  const since30d = isoAgo(30 * DAY_MS, now);
  const since7d = isoAgo(7 * DAY_MS, now);
  const profiles = rows.map((row) => playerProfile(row));

  const players = rows.map((row, index) => {
    const profile = profiles[index];
    const ranked = loadRankedBattles(db, row.tag);
    const trophies = profile?.trophies ?? null;
    return {
      ...toListItem(row),
      highestTrophies: profile?.highestTrophies ?? null,
      expLevel: profile?.expLevel ?? null,
      brawlersOwned: profile?.brawlers.length ?? 0,
      power11: profile?.brawlers.filter((b) => b.power >= MAX_POWER_LEVEL).length ?? 0,
      victories3v3: profile?.['3vs3Victories'] ?? null,
      soloVictories: profile?.soloVictories ?? null,
      duoVictories: profile?.duoVictories ?? null,
      trophies,
      trophyDelta7d: trophyDeltaSince(db, row.tag, since7d, trophies),
      games7d: winLoss(loadBattles(db, row.tag, since7d)),
      rankedTier: profile?.rankedRank ?? tierTimeline(ranked).at(-1)?.tier ?? null,
      rankedElo: profile?.rankedElo ?? null,
      rankedWinRate30d: winLoss(ranked.filter((b) => b.battleTime >= since30d)).winRate,
      series: trophySeries(
        loadSnapshots(db, row.tag, since30d),
        snapshotAt(db, row.tag, since30d),
        since30d,
        new Date(now).toISOString(),
        200,
      ),
    };
  });

  const names = new Map<number, string>();
  for (const profile of profiles) for (const b of profile?.brawlers ?? []) names.set(b.id, titleCase(b.name));
  const brawlers = [...names.entries()]
    .map(([id, name]) => ({
      id,
      name,
      values: profiles.map((profile) => profile?.brawlers.find((b) => b.id === id)?.trophies ?? null),
    }))
    .sort((a, b) => Math.max(...b.values.map((v) => v ?? 0)) - Math.max(...a.values.map((v) => v ?? 0)));

  return { players, brawlers };
}

// ── Session en direct ─────────────────────────────────────────

/** La session en cours (ou la dernière), pensée pour être suivie sur le téléphone pendant qu'on joue. */
export function liveSessionView({ db }: ViewDeps, row: PlayerRow, now = Date.now()): LiveSessionResponse {
  const profile = playerProfile(row);
  const session = buildSessions(loadBattles(db, row.tag, isoAgo(7 * DAY_MS, now)))[0] ?? null;
  const allRanked = loadRankedBattles(db, row.tag);
  const setChanges = eloBySet(db, row.tag, allRanked, now);
  const rankedProfile = rankedProfileView(db, row, null, now, setChanges);
  const next = {
    nextTier: rankedProfile.nextTier,
    nextTierElo: rankedProfile.nextTierElo,
    pointsToNext: rankedProfile.pointsToNext,
    avgEloPerSet: rankedProfile.avgEloPerSet,
    setsToNext: rankedProfile.setsToNext,
  };
  const empty = { games: 0, wins: 0, losses: 0, draws: 0, winRate: null };
  if (!session) {
    return {
      active: false,
      start: null,
      end: null,
      games: empty,
      ranked: empty,
      sets: empty,
      recentSets: [],
      eloStart: null,
      eloNow: profile?.rankedElo ?? null,
      eloDelta: null,
      tier: rankedProfile.tier,
      trophyNet: 0,
      streak: { kind: null, count: 0 },
      next,
      brawlers: [],
      battles: [],
      lastPolledAt: row.last_polled_at,
    };
  }

  const battles = loadBattles(db, row.tag, session.start).filter((b) => b.battleTime <= session.end);
  const rankedBattles = battles.filter((b) => battleCategory(b.type) === 'ranked');
  const sets = groupRankedSets(allRanked, now).filter((set) => set.end >= session.start);
  for (const set of sets) set.eloChange = setChanges.get(set.id) ?? null;
  const decided = sets.filter((s) => s.outcome === 'win' || s.outcome === 'loss' || s.outcome === 'draw');
  const setWins = decided.filter((s) => s.outcome === 'win').length;
  const setLosses = decided.filter((s) => s.outcome === 'loss').length;

  const samples = eloSamples(db, row.tag);
  const startSample = samples.filter((s) => s.t <= session.start).at(-1);
  const eloNow = profile?.rankedElo ?? samples.at(-1)?.elo ?? null;

  const brawlers = new Map<number, { id: number; name: string; games: number; wins: number; losses: number }>();
  for (const battle of battles) {
    if (battle.brawlerId === null) continue;
    const entry = brawlers.get(battle.brawlerId) ?? { id: battle.brawlerId, name: titleCase(battle.brawlerName), games: 0, wins: 0, losses: 0 };
    entry.games++;
    if (battle.outcome === 'win') entry.wins++;
    if (battle.outcome === 'loss') entry.losses++;
    brawlers.set(battle.brawlerId, entry);
  }

  return {
    active: now - Date.parse(session.end) < 30 * 60 * 1000,
    start: session.start,
    end: session.end,
    games: winLoss(battles),
    ranked: winLoss(rankedBattles),
    sets: { games: decided.length, wins: setWins, losses: setLosses, draws: decided.length - setWins - setLosses, winRate: winRate(setWins, setLosses) },
    recentSets: sets,
    eloStart: startSample?.elo ?? null,
    eloNow,
    eloDelta: startSample && eloNow !== null ? eloNow - startSample.elo : null,
    tier: rankedProfile.tier,
    trophyNet: session.trophyNet,
    streak: sets.length
      ? currentStreak([...decided].reverse().map((s) => s.outcome as 'win' | 'loss' | 'draw'))
      : currentStreak(battles.map((b) => b.outcome)),
    next,
    brawlers: [...brawlers.values()].sort((a, b) => b.games - a.games),
    battles: battles.slice(-10).reverse().map(toBattleDto),
    lastPolledAt: row.last_polled_at,
  };
}
