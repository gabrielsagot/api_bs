import { battleCategory, titleCase, type BattleCategory } from '../shared/labels';
import type {
  BattleDto,
  BattleFilters,
  BattleListResponse,
  BattleStatsResponse,
  BrawlerDetailResponse,
  CollectionResponse,
  CompareResponse,
  OverviewResponse,
  Period,
  RankedQueue,
  RankedResponse,
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
} from './stats/aggregate';
import { buildCard, buildCollection, costLines } from './stats/collection';
import { MAX_POWER_LEVEL } from './stats/costs';
import { listGoals } from './stats/goals';
import type { StoredBattle } from './stats/normalize';
import { displayParticipant, mapPicks, matchesQueue, rankedCore, tierTimeline } from './stats/ranked';
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

/** Variation des trophées depuis `since` (ou depuis le début du suivi s'il est plus récent). */
function trophyDeltaSince(db: Db, tag: string, since: string, current: number | null): number | null {
  if (current === null) return null;
  const baseline = snapshotAt(db, tag, since) ?? firstSnapshot(db, tag);
  return baseline ? current - baseline.trophies : null;
}

// ── Accueil ───────────────────────────────────────────────────

export function overviewView({ db, catalog }: ViewDeps, row: PlayerRow, now = Date.now()): OverviewResponse {
  const profile = playerProfile(row);
  const { since, prevSince } = periodRange('30d', now);
  const core = rankedCore(loadRankedBattles(db, row.tag), since, prevSince, now);
  const { periodBattles, periodSets, ...rankedStats } = core;

  const since7d = isoAgo(7 * DAY_MS, now);
  const current = profile?.trophies ?? null;
  const recentBattles = loadBattles(db, row.tag, since7d);

  return {
    player: toProfileDto(row),
    ranked: {
      ...rankedStats,
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
  const ranked = loadRankedBattles(db, row.tag).filter((b) => matchesQueue(b, queue));
  const { since, prevSince } = periodRange(period, now);
  const { periodBattles, periodSets, ...core } = rankedCore(ranked, since, prevSince, now);
  return {
    ...core,
    period,
    queue,
    byBrawler: breakdown(periodBattles, byBrawlerKey),
    byMap: breakdown(periodBattles, byMapKey),
    byMode: breakdown(periodBattles, byModeKey),
    vsBrawlers: breakdown(periodBattles, vsBrawlerKeys, { minGames: 2 }),
    allies: frequentAllies(periodBattles),
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
  const reference = baseline ?? snapshots[0];

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
        const start = startStates.get(brawler.id) ?? firstStates.get(brawler.id);
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
        };
      })
      .sort((a, b) => b.trophies - a.trophies),
  };
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

export function collectionView({ db, catalog }: ViewDeps, row: PlayerRow): CollectionResponse {
  return buildCollection(
    playerProfile(row),
    catalog.get()?.brawlers ?? null,
    statsByBrawler(loadBattles(db, row.tag)),
  );
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
      rankedTier: tierTimeline(ranked).at(-1)?.tier ?? null,
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
