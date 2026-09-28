import type { ApiBattle, ApiPlayer } from './brawlstars/types';
import type { Db } from './db';
import { brawlerStatesAt, latestSnapshot, type SnapshotRow } from './repo';
import { MAX_POWER_LEVEL } from './stats/costs';
import { normalizeBattle } from './stats/normalize';

// Enregistrement des données de l'API. L'API ne garde aucun historique :
// c'est ici que se construit la mémoire du dashboard.

export interface ProfileSummary {
  trophies: number;
  highest_trophies: number;
  exp_level: number | null;
  exp_points: number | null;
  victories_3v3: number | null;
  solo_victories: number | null;
  duo_victories: number | null;
  brawlers_owned: number;
  power11: number;
  gadgets: number;
  star_powers: number;
  hyper_charges: number;
  gears: number;
}

export function summarizeProfile(profile: ApiPlayer): ProfileSummary {
  const brawlers = profile.brawlers ?? [];
  const sum = (pick: (b: ApiPlayer['brawlers'][number]) => unknown[] | undefined) =>
    brawlers.reduce((total, b) => total + (pick(b)?.length ?? 0), 0);
  return {
    trophies: profile.trophies,
    highest_trophies: profile.highestTrophies,
    exp_level: profile.expLevel ?? null,
    exp_points: profile.expPoints ?? null,
    victories_3v3: profile['3vs3Victories'] ?? null,
    solo_victories: profile.soloVictories ?? null,
    duo_victories: profile.duoVictories ?? null,
    brawlers_owned: brawlers.length,
    power11: brawlers.filter((b) => b.power >= MAX_POWER_LEVEL).length,
    gadgets: sum((b) => b.gadgets),
    star_powers: sum((b) => b.starPowers),
    hyper_charges: sum((b) => b.hyperCharges),
    gears: sum((b) => b.gears),
  };
}

const SNAPSHOT_FIELDS = [
  'trophies',
  'highest_trophies',
  'exp_level',
  'exp_points',
  'victories_3v3',
  'solo_victories',
  'duo_victories',
  'brawlers_owned',
  'power11',
  'gadgets',
  'star_powers',
  'hyper_charges',
  'gears',
] as const satisfies readonly (keyof ProfileSummary & keyof SnapshotRow)[];

/** Met à jour le joueur ; n'ajoute un instantané que si quelque chose a changé. */
export function ingestProfile(db: Db, tag: string, profile: ApiPlayer, at = new Date().toISOString()): void {
  db.run(
    `UPDATE players SET name = ?, name_color = ?, icon_id = ?, club_tag = ?, club_name = ?,
       profile_json = ?, last_polled_at = ?, last_error = NULL
     WHERE tag = ?`,
    [
      profile.name,
      profile.nameColor ?? null,
      profile.icon?.id ?? null,
      profile.club?.tag ?? null,
      profile.club?.name ?? null,
      JSON.stringify(profile),
      at,
      tag,
    ],
  );

  const summary = summarizeProfile(profile);
  const last = latestSnapshot(db, tag);
  if (!last || SNAPSHOT_FIELDS.some((field) => last[field] !== summary[field])) {
    db.run(
      `INSERT INTO player_snapshots (tag, taken_at, ${SNAPSHOT_FIELDS.join(', ')})
       VALUES (?, ?, ${SNAPSHOT_FIELDS.map(() => '?').join(', ')})`,
      [tag, at, ...SNAPSHOT_FIELDS.map((field) => summary[field])],
    );
  }

  const previous = brawlerStatesAt(db, tag);
  for (const brawler of profile.brawlers ?? []) {
    const before = previous.get(brawler.id);
    const rank = brawler.rank ?? null;
    if (
      before &&
      before.trophies === brawler.trophies &&
      before.highest_trophies === brawler.highestTrophies &&
      before.power === brawler.power &&
      before.rank === rank
    ) {
      continue;
    }
    db.run(
      `INSERT INTO brawler_snapshots (tag, brawler_id, taken_at, trophies, highest_trophies, power, rank)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tag, brawler.id, at, brawler.trophies, brawler.highestTrophies, brawler.power, rank],
    );
  }
}

/** Ajoute les nouveaux combats (les doublons sont ignorés grâce à UNIQUE(tag, battle_time)). */
export function ingestBattleLog(db: Db, tag: string, items: ApiBattle[]): { inserted: number } {
  let inserted = 0;
  let latest: string | null = null;
  for (const raw of items) {
    let battle;
    try {
      battle = normalizeBattle(raw, tag);
    } catch {
      continue; // combat illisible : on l'ignore plutôt que de bloquer la collecte
    }
    if (!latest || battle.battleTime > latest) latest = battle.battleTime;
    const result = db.run(
      `INSERT OR IGNORE INTO battles (
         tag, battle_time, event_id, mode, map, type, outcome, rank, trophy_change, duration, star_player,
         brawler_id, brawler_name, brawler_power, brawler_trophies, teams_count, participants_json, raw_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tag,
        battle.battleTime,
        battle.eventId,
        battle.mode,
        battle.map,
        battle.type,
        battle.outcome,
        battle.rank,
        battle.trophyChange,
        battle.duration,
        battle.starPlayer ? 1 : 0,
        battle.brawlerId,
        battle.brawlerName,
        battle.brawlerPower,
        battle.brawlerTrophies,
        battle.teamsCount,
        JSON.stringify(battle.participants),
        JSON.stringify(raw),
      ],
    );
    inserted += result.changes;
  }
  if (latest) {
    db.run(
      'UPDATE players SET last_battle_at = ? WHERE tag = ? AND (last_battle_at IS NULL OR last_battle_at < ?)',
      [latest, tag, latest],
    );
  }
  return { inserted };
}
