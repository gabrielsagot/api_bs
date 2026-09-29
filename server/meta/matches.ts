import { parseBattleTime } from '../stats/normalize';
import type { ApiBattle, ApiBattlePlayer } from '../brawlstars/types';
import type { Db } from '../db';

// Parties classées « de la communauté » : une ligne par manche de Ranked (3 contre 3),
// quel que soit le joueur dont on a lu le journal. Base des statistiques du Draft.

export interface MetaMatch {
  key: string;
  battleTime: string;
  type: string;
  mode: string;
  map: string;
  eventId: number | null;
  /** Brawlers de chaque équipe, triés par identifiant. */
  teamA: number[];
  teamB: number[];
  /** 0 = équipe A, 1 = équipe B, null = égalité ou inconnu. */
  winner: 0 | 1 | null;
  minTier: number | null;
  avgTier: number | null;
  duration: number | null;
}

export interface MetaParticipant {
  tag: string;
  tier: number | null;
}

/** Le mode Ranked apparaît en « soloRanked » / « teamRanked » (« ranked » = trophées). */
export function isRankedType(type: string | undefined): boolean {
  return !!type && type !== 'ranked' && /ranked/i.test(type);
}

function brawlerId(player: ApiBattlePlayer): number | null {
  return player.brawler?.id ?? player.brawlers?.[0]?.id ?? null;
}

/** En Ranked, le champ « trophies » du brawler contient le rang du joueur (1 = Bronze I … 22 = Pro). */
function tierOf(player: ApiBattlePlayer): number | null {
  const value = player.brawler?.trophies;
  return typeof value === 'number' && value >= 1 && value <= 22 ? value : null;
}

/**
 * Transforme un combat du journal de `ownerTag` en manche classée normalisée.
 * L'ordre des équipes est fixé par les tags (et non par le point de vue du joueur),
 * pour que la même manche lue dans deux journaux donne la même clé.
 */
export function toMetaMatch(ownerTag: string, item: ApiBattle): { match: MetaMatch; participants: MetaParticipant[] } | null {
  const battle = item.battle;
  if (!isRankedType(battle?.type)) return null;
  const teams = battle.teams;
  if (!teams || teams.length !== 2 || teams.some((team) => team.length !== 3)) return null;
  const map = item.event?.map;
  const mode = battle.mode ?? item.event?.mode;
  if (!map || !mode) return null;
  const brawlers = teams.map((team) => team.map(brawlerId));
  if (brawlers.flat().some((id) => id === null)) return null;

  const tagsOf = (team: ApiBattlePlayer[]) => team.map((p) => p.tag.toUpperCase()).sort();
  const [tags0, tags1] = teams.map(tagsOf);
  const swap = tags0.join() > tags1.join();
  const [a, b] = swap ? [1, 0] : [0, 1];

  const ownerTeam = teams.findIndex((team) => team.some((p) => p.tag.toUpperCase() === ownerTag.toUpperCase()));
  let winner: 0 | 1 | null = null;
  if (ownerTeam !== -1 && (battle.result === 'victory' || battle.result === 'defeat')) {
    const winningTeam = battle.result === 'victory' ? ownerTeam : 1 - ownerTeam;
    winner = winningTeam === a ? 0 : 1;
  }

  const participants = teams.flat().map((p) => ({ tag: p.tag.toUpperCase(), tier: tierOf(p) }));
  const tiers = participants.map((p) => p.tier).filter((t): t is number => t !== null);
  const battleTime = parseBattleTime(item.battleTime);
  return {
    match: {
      key: `${battleTime}|${[...tags0, ...tags1].sort().join(',')}`,
      battleTime,
      type: battle.type as string,
      mode,
      map,
      eventId: item.event?.id ?? null,
      teamA: (brawlers[a] as number[]).slice().sort((x, y) => x - y),
      teamB: (brawlers[b] as number[]).slice().sort((x, y) => x - y),
      winner,
      minTier: tiers.length ? Math.min(...tiers) : null,
      avgTier: tiers.length ? tiers.reduce((sum, t) => sum + t, 0) / tiers.length : null,
      duration: typeof battle.duration === 'number' ? battle.duration : null,
    },
    participants,
  };
}

/** Enregistre les manches classées d'un journal ; renvoie les nouvelles manches et les joueurs croisés. */
export function recordMetaMatches(db: Db, ownerTag: string, items: readonly ApiBattle[]): { inserted: number; participants: MetaParticipant[] } {
  let inserted = 0;
  const participants: MetaParticipant[] = [];
  for (const item of items) {
    const parsed = toMetaMatch(ownerTag, item);
    if (!parsed) continue;
    const { match } = parsed;
    participants.push(...parsed.participants);
    const result = db.run(
      `INSERT OR IGNORE INTO meta_matches
         (match_key, battle_time, type, mode, map, event_id, team_a, team_b, winner, min_tier, avg_tier, duration)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        match.key,
        match.battleTime,
        match.type,
        match.mode,
        match.map,
        match.eventId,
        JSON.stringify(match.teamA),
        JSON.stringify(match.teamB),
        match.winner,
        match.minTier,
        match.avgTier,
        match.duration,
      ],
    );
    inserted += result.changes;
  }
  return { inserted, participants };
}

interface MetaMatchRow {
  battle_time: string;
  mode: string;
  map: string;
  event_id: number | null;
  team_a: string;
  team_b: string;
  winner: number | null;
  min_tier: number | null;
}

export interface StoredMetaMatch {
  battleTime: string;
  mode: string;
  map: string;
  eventId: number | null;
  teamA: number[];
  teamB: number[];
  winner: 0 | 1;
  minTier: number | null;
}

/** Manches décidées d'un mode depuis `since` (les égalités n'apportent rien au calcul). */
export function loadMetaMatches(db: Db, mode: string, since: string): StoredMetaMatch[] {
  return db
    .all<MetaMatchRow>(
      `SELECT battle_time, mode, map, event_id, team_a, team_b, winner, min_tier FROM meta_matches
       WHERE mode = ? AND battle_time >= ? AND winner IS NOT NULL`,
      [mode, since],
    )
    .map((row) => ({
      battleTime: row.battle_time,
      mode: row.mode,
      map: row.map,
      eventId: row.event_id,
      teamA: JSON.parse(row.team_a) as number[],
      teamB: JSON.parse(row.team_b) as number[],
      winner: row.winner as 0 | 1,
      minTier: row.min_tier,
    }));
}

/**
 * Reprend les manches classées déjà enregistrées pour les joueurs suivis (combats
 * collectés avant l'arrivée du Draft). Sans effet si elles y sont déjà.
 */
export function backfillFromBattles(db: Db): number {
  const rows = db.all<{ tag: string; raw_json: string }>(
    `SELECT tag, raw_json FROM battles WHERE type <> 'ranked' AND lower(type) LIKE '%ranked%'`,
  );
  let inserted = 0;
  db.transaction(() => {
    for (const row of rows) {
      try {
        inserted += recordMetaMatches(db, row.tag, [JSON.parse(row.raw_json) as ApiBattle]).inserted;
      } catch {
        // Combat illisible : ignoré.
      }
    }
  });
  return inserted;
}
