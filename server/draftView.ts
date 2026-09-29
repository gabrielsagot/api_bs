import { titleCase } from '../shared/labels';
import type { DraftBrawlerDto, DraftMapDto, DraftOverviewResponse, DraftReasonDto, DraftRecommendResponse } from '../shared/types';
import type { CatalogService } from './catalog';
import type { Db } from './db';
import type { MetaCrawler } from './meta/crawler';
import { loadMetaMatches, type StoredMetaMatch } from './meta/matches';
import { loadBattles, playerProfile, type PlayerRow } from './repo';
import { buildDraftModel, scoreBans, scorePicks, type DraftModel } from './stats/draft';

// Assemblage des réponses de l'onglet Draft.

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;
const CACHE_MS = 5 * 60_000;
/** En dessous de ce nombre de manches de haut rang sur le mode, on prend tous les rangs. */
const MIN_HIGH_TIER_MATCHES = 400;

export interface DraftDeps {
  db: Db;
  catalog: CatalogService;
  crawler: MetaCrawler | null;
  minTier: number;
}

const cache = new Map<string, { at: number; model: DraftModel; minTier: number | null }>();

/** Vide le cache (tests, ou après l'ajout de données de démo). */
export function clearDraftCache(): void {
  cache.clear();
}

function modelFor(deps: DraftDeps, mode: string, now: number): { model: DraftModel; minTier: number | null } {
  const cached = cache.get(mode);
  if (cached && now - cached.at < CACHE_MS) return cached;
  const all = loadMetaMatches(deps.db, mode, new Date(now - WINDOW_DAYS * DAY_MS).toISOString());
  const high = all.filter((m: StoredMetaMatch) => m.minTier !== null && m.minTier >= deps.minTier);
  const useHigh = high.length >= MIN_HIGH_TIER_MATCHES;
  const entry = { at: now, model: buildDraftModel(mode, useHigh ? high : all, now), minTier: useHigh ? deps.minTier : null };
  cache.set(mode, entry);
  return entry;
}

function brawlerList(deps: DraftDeps, player: PlayerRow | undefined): DraftBrawlerDto[] {
  const owned = new Map((playerProfile(player)?.brawlers ?? []).map((b) => [b.id, b.power]));
  return (deps.catalog.get()?.brawlers ?? [])
    .map((b) => ({ id: b.id, name: titleCase(b.name), rarity: b.rarity, owned: owned.has(b.id), power: owned.get(b.id) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export function draftOverview(deps: DraftDeps, player: PlayerRow | undefined, now = Date.now()): DraftOverviewResponse {
  const since = new Date(now - WINDOW_DAYS * DAY_MS).toISOString();
  const maps = deps.db.all<{ map: string; mode: string; event_id: number | null; n: number }>(
    `SELECT map, mode, MAX(event_id) AS event_id, COUNT(*) AS n FROM meta_matches
     WHERE battle_time >= ? GROUP BY map, mode ORDER BY n DESC`,
    [since],
  );
  return {
    maps: maps.map((row): DraftMapDto => ({ map: row.map, mode: row.mode, eventId: row.event_id, matches: row.n })),
    crawler: deps.crawler?.status(now) ?? null,
    brawlers: brawlerList(deps, player),
    minTier: deps.minTier,
  };
}

export interface DraftQuery {
  map: string;
  mode: string;
  bans: number[];
  allies: number[];
  enemies: number[];
  enemyPicksAfter: number;
  onlyOwned: boolean;
  personal: boolean;
}

export function draftRecommend(deps: DraftDeps, player: PlayerRow | undefined, query: DraftQuery, now = Date.now()): DraftRecommendResponse {
  const { model, minTier } = modelFor(deps, query.mode, now);
  const brawlers = brawlerList(deps, player);
  const names = new Map(brawlers.map((b) => [b.id, b.name]));
  const info = new Map(brawlers.map((b) => [b.id, b]));
  // Candidats : le catalogue (ou ta collection), plus les brawlers vus dans les données.
  const known = new Set([...brawlers.map((b) => b.id), ...model.mode_.keys()]);
  const candidates = [...known].filter((id) => !query.onlyOwned || !player || info.get(id)?.owned);

  let mastery: Map<number, { games: number; wins: number }> | undefined;
  if (query.personal && player) {
    mastery = new Map();
    const since = new Date(now - 90 * DAY_MS).toISOString();
    for (const battle of loadBattles(deps.db, player.tag, since)) {
      if (battle.brawlerId === null || !/ranked/i.test(battle.type) || battle.type === 'ranked') continue;
      if (battle.outcome !== 'win' && battle.outcome !== 'loss') continue;
      const entry = mastery.get(battle.brawlerId) ?? { games: 0, wins: 0 };
      entry.games++;
      if (battle.outcome === 'win') entry.wins++;
      mastery.set(battle.brawlerId, entry);
    }
  }

  const picks = scorePicks(model, {
    map: query.map,
    bans: query.bans,
    allies: query.allies,
    enemies: query.enemies,
    enemyPicksAfter: query.enemyPicksAfter,
    candidates,
    mastery,
  });
  const name = (id: number) => names.get(id) ?? `#${id}`;
  return {
    map: query.map,
    mode: query.mode,
    sample: { mapMatches: model.mapMatches.get(query.map) ?? 0, modeMatches: model.matches, minTier, days: WINDOW_DAYS },
    picks: picks.slice(0, 12).map((pick) => ({
      brawlerId: pick.brawlerId,
      name: name(pick.brawlerId),
      estimate: pick.estimate,
      mapWinRate: pick.mapWinRate,
      mapGames: pick.mapGames,
      owned: info.get(pick.brawlerId)?.owned ?? false,
      power: info.get(pick.brawlerId)?.power ?? null,
      reasons: pick.reasons.map(
        (reason): DraftReasonDto => ({ ...reason, brawlerName: reason.brawlerId !== undefined ? name(reason.brawlerId) : undefined }),
      ),
    })),
    bans: scoreBans(model, query.map, [...query.bans, ...query.allies, ...query.enemies])
      .slice(0, 8)
      .map((ban) => ({ brawlerId: ban.brawlerId, name: name(ban.brawlerId), mapWinRate: ban.mapWinRate, presence: ban.presence, mapGames: ban.mapGames })),
  };
}
