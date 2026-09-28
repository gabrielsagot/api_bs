import type { PlayerListItem, PlayerProfileDto } from '../shared/types';
import { tagSlug } from '../shared/tags';
import type { ApiPlayer } from './brawlstars/types';
import type { Db } from './db';
import type { StoredBattle } from './stats/normalize';

// Accès aux données : requêtes SQL regroupées ici pour garder les routes lisibles.

export interface PlayerRow {
  tag: string;
  name: string;
  name_color: string | null;
  icon_id: number | null;
  club_tag: string | null;
  club_name: string | null;
  is_primary: number;
  color_slot: number;
  added_at: string;
  last_polled_at: string | null;
  last_battle_at: string | null;
  last_error: string | null;
  profile_json: string | null;
}

export interface SnapshotRow {
  taken_at: string;
  trophies: number;
  highest_trophies: number;
  exp_level: number | null;
  exp_points: number | null;
  victories_3v3: number | null;
  solo_victories: number | null;
  duo_victories: number | null;
  brawlers_owned: number | null;
  power11: number | null;
  gadgets: number | null;
  star_powers: number | null;
  hyper_charges: number | null;
  gears: number | null;
  ranked_elo: number | null;
  ranked_rank: number | null;
}

export interface BrawlerSnapshotRow {
  brawler_id: number;
  taken_at: string;
  trophies: number;
  highest_trophies: number;
  power: number;
  rank: number | null;
}

interface BattleRow {
  id: number;
  battle_time: string;
  event_id: number | null;
  mode: string;
  map: string | null;
  type: string;
  outcome: StoredBattle['outcome'];
  rank: number | null;
  trophy_change: number | null;
  duration: number | null;
  star_player: number;
  brawler_id: number | null;
  brawler_name: string | null;
  brawler_power: number | null;
  brawler_trophies: number | null;
  teams_count: number | null;
  participants_json: string;
}

// ── Joueurs ───────────────────────────────────────────────────

export function listPlayers(db: Db): PlayerRow[] {
  return db.all<PlayerRow>('SELECT * FROM players ORDER BY is_primary DESC, added_at ASC');
}

export function findPlayer(db: Db, tag: string): PlayerRow | undefined {
  return db.get<PlayerRow>('SELECT * FROM players WHERE tag = ?', [tag]);
}

export function insertPlayer(db: Db, tag: string, now = new Date().toISOString()): PlayerRow {
  const existing = listPlayers(db);
  const used = new Set(existing.map((p) => p.color_slot));
  let slot = 0;
  while (used.has(slot) && slot < 7) slot++;
  if (used.has(slot)) slot = existing.length % 8;
  db.run('INSERT INTO players (tag, is_primary, color_slot, added_at) VALUES (?, ?, ?, ?)', [
    tag,
    existing.length === 0 ? 1 : 0,
    slot,
    now,
  ]);
  return findPlayer(db, tag)!;
}

export function deletePlayer(db: Db, tag: string): void {
  db.transaction(() => {
    const wasPrimary = findPlayer(db, tag)?.is_primary === 1;
    db.run('DELETE FROM players WHERE tag = ?', [tag]);
    if (wasPrimary) {
      const next = db.get<{ tag: string }>('SELECT tag FROM players ORDER BY added_at ASC LIMIT 1');
      if (next) db.run('UPDATE players SET is_primary = 1 WHERE tag = ?', [next.tag]);
    }
  });
}

export function setPrimaryPlayer(db: Db, tag: string): void {
  db.transaction(() => {
    db.run('UPDATE players SET is_primary = 0');
    db.run('UPDATE players SET is_primary = 1 WHERE tag = ?', [tag]);
  });
}

export function playerProfile(row: PlayerRow | undefined): ApiPlayer | null {
  if (!row?.profile_json) return null;
  try {
    return JSON.parse(row.profile_json) as ApiPlayer;
  } catch {
    return null;
  }
}

export function toListItem(row: PlayerRow): PlayerListItem {
  const profile = playerProfile(row);
  return {
    tag: row.tag,
    slug: tagSlug(row.tag),
    name: row.name || row.tag,
    iconId: row.icon_id,
    isPrimary: row.is_primary === 1,
    colorSlot: row.color_slot,
    trophies: profile?.trophies ?? null,
    clubName: row.club_name,
    lastPolledAt: row.last_polled_at,
    lastBattleAt: row.last_battle_at,
    lastError: row.last_error,
  };
}

export function toProfileDto(row: PlayerRow): PlayerProfileDto {
  const profile = playerProfile(row);
  return {
    ...toListItem(row),
    nameColor: row.name_color,
    clubTag: row.club_tag,
    highestTrophies: profile?.highestTrophies ?? null,
    expLevel: profile?.expLevel ?? null,
    expPoints: profile?.expPoints ?? null,
    victories3v3: profile?.['3vs3Victories'] ?? null,
    soloVictories: profile?.soloVictories ?? null,
    duoVictories: profile?.duoVictories ?? null,
    totalPrestigeLevel: profile?.totalPrestigeLevel ?? null,
    fame: profile?.fame ?? null,
    fameTierName: profile?.fameTierName ?? null,
    trackedSince: row.added_at,
  };
}

// ── Combats ───────────────────────────────────────────────────

function toStoredBattle(row: BattleRow): StoredBattle {
  return {
    id: row.id,
    battleTime: row.battle_time,
    eventId: row.event_id,
    mode: row.mode,
    map: row.map,
    type: row.type,
    outcome: row.outcome,
    rank: row.rank,
    trophyChange: row.trophy_change,
    duration: row.duration,
    starPlayer: row.star_player === 1,
    brawlerId: row.brawler_id,
    brawlerName: row.brawler_name,
    brawlerPower: row.brawler_power,
    brawlerTrophies: row.brawler_trophies,
    teamsCount: row.teams_count,
    participants: JSON.parse(row.participants_json) as StoredBattle['participants'],
  };
}

const BATTLE_COLUMNS = `id, battle_time, event_id, mode, map, type, outcome, rank, trophy_change, duration,
  star_player, brawler_id, brawler_name, brawler_power, brawler_trophies, teams_count, participants_json`;

/** Combats d'un joueur, du plus ancien au plus récent. */
export function loadBattles(db: Db, tag: string, since?: string | null, until?: string | null): StoredBattle[] {
  const rows = db.all<BattleRow>(
    `SELECT ${BATTLE_COLUMNS} FROM battles
     WHERE tag = ? AND battle_time >= ? AND battle_time < ?
     ORDER BY battle_time ASC`,
    [tag, since ?? '', until ?? '9999'],
  );
  return rows.map(toStoredBattle);
}

/** Uniquement les manches du mode Ranked (soloRanked / teamRanked), toutes dates. */
export function loadRankedBattles(db: Db, tag: string): StoredBattle[] {
  const rows = db.all<BattleRow>(
    `SELECT ${BATTLE_COLUMNS} FROM battles
     WHERE tag = ? AND type <> 'ranked' AND lower(type) LIKE '%ranked%'
     ORDER BY battle_time ASC`,
    [tag],
  );
  return rows.map(toStoredBattle);
}

export function countBattles(db: Db, tag?: string): number {
  const row = tag
    ? db.get<{ n: number }>('SELECT COUNT(*) AS n FROM battles WHERE tag = ?', [tag])
    : db.get<{ n: number }>('SELECT COUNT(*) AS n FROM battles');
  return row?.n ?? 0;
}

// ── Instantanés ───────────────────────────────────────────────

export function loadSnapshots(db: Db, tag: string, since?: string | null): SnapshotRow[] {
  return db.all<SnapshotRow>(
    'SELECT * FROM player_snapshots WHERE tag = ? AND taken_at >= ? ORDER BY taken_at ASC, id ASC',
    [tag, since ?? ''],
  );
}

/** Dernier instantané pris avant (ou à) la date donnée. */
export function snapshotAt(db: Db, tag: string, iso: string): SnapshotRow | undefined {
  return db.get<SnapshotRow>(
    'SELECT * FROM player_snapshots WHERE tag = ? AND taken_at <= ? ORDER BY taken_at DESC, id DESC LIMIT 1',
    [tag, iso],
  );
}

export function latestSnapshot(db: Db, tag: string): SnapshotRow | undefined {
  return db.get<SnapshotRow>('SELECT * FROM player_snapshots WHERE tag = ? ORDER BY taken_at DESC, id DESC LIMIT 1', [
    tag,
  ]);
}

export function firstSnapshot(db: Db, tag: string): SnapshotRow | undefined {
  return db.get<SnapshotRow>('SELECT * FROM player_snapshots WHERE tag = ? ORDER BY taken_at ASC, id ASC LIMIT 1', [tag]);
}

/** Dernier état connu de chaque brawler (éventuellement à une date donnée). */
export function brawlerStatesAt(db: Db, tag: string, iso = '9999'): Map<number, BrawlerSnapshotRow> {
  const rows = db.all<BrawlerSnapshotRow>(
    `SELECT bs.brawler_id, bs.taken_at, bs.trophies, bs.highest_trophies, bs.power, bs.rank
     FROM brawler_snapshots bs
     JOIN (
       SELECT brawler_id, MAX(id) AS id FROM brawler_snapshots
       WHERE tag = ? AND taken_at <= ?
       GROUP BY brawler_id
     ) last ON last.id = bs.id`,
    [tag, iso],
  );
  return new Map(rows.map((row) => [row.brawler_id, row]));
}

/** Premier état enregistré de chaque brawler (début du suivi). */
export function firstBrawlerStates(db: Db, tag: string): Map<number, BrawlerSnapshotRow> {
  const rows = db.all<BrawlerSnapshotRow>(
    `SELECT bs.brawler_id, bs.taken_at, bs.trophies, bs.highest_trophies, bs.power, bs.rank
     FROM brawler_snapshots bs
     JOIN (SELECT brawler_id, MIN(id) AS id FROM brawler_snapshots WHERE tag = ? GROUP BY brawler_id) first
       ON first.id = bs.id`,
    [tag],
  );
  return new Map(rows.map((row) => [row.brawler_id, row]));
}

export function brawlerHistory(db: Db, tag: string, brawlerId: number): BrawlerSnapshotRow[] {
  return db.all<BrawlerSnapshotRow>(
    `SELECT brawler_id, taken_at, trophies, highest_trophies, power, rank FROM brawler_snapshots
     WHERE tag = ? AND brawler_id = ? ORDER BY taken_at ASC, id ASC`,
    [tag, brawlerId],
  );
}
