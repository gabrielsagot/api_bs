import type { Outcome, ParticipantDto } from '../../shared/types';
import { sameTag } from '../../shared/tags';
import type { ApiBattle, ApiBattlePlayer } from '../brawlstars/types';

/** Combat mis à plat, prêt à être stocké et agrégé. */
export interface NormalizedBattle {
  battleTime: string;
  eventId: number | null;
  mode: string;
  map: string | null;
  type: string;
  outcome: Outcome | null;
  rank: number | null;
  trophyChange: number | null;
  duration: number | null;
  starPlayer: boolean;
  brawlerId: number | null;
  brawlerName: string | null;
  brawlerPower: number | null;
  brawlerTrophies: number | null;
  teamsCount: number | null;
  participants: ParticipantDto[];
}

/** Combat tel que relu depuis la base. */
export interface StoredBattle extends NormalizedBattle {
  id: number;
}

/** '20240115T123456.000Z' → '2024-01-15T12:34:56.000Z' */
export function parseBattleTime(raw: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.(\d{1,3}))?Z$/.exec(raw);
  if (match) {
    const [, y, mo, d, h, mi, s, ms] = match;
    return `${y}-${mo}-${d}T${h}:${mi}:${s}.${(ms ?? '000').padEnd(3, '0')}Z`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new Error(`battleTime illisible : ${raw}`);
  return parsed.toISOString();
}

function toParticipant(
  player: ApiBattlePlayer,
  team: number,
  side: ParticipantDto['side'],
): ParticipantDto {
  // En Duels, le joueur aligne plusieurs brawlers : on retient le premier.
  const brawler = player.brawler ?? player.brawlers?.[0];
  return {
    side,
    team,
    tag: player.tag,
    name: player.name,
    brawlerId: brawler?.id ?? null,
    brawlerName: brawler?.name ?? null,
    power: brawler?.power ?? null,
    trophies: brawler?.trophies ?? null,
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeBattle(raw: ApiBattle, selfTag: string): NormalizedBattle {
  const battle = raw.battle ?? {};
  const participants: ParticipantDto[] = [];
  let teamsCount: number | null = null;
  let selfPlayer: ApiBattlePlayer | undefined;

  if (Array.isArray(battle.teams) && battle.teams.length > 0) {
    teamsCount = battle.teams.length;
    const selfTeam = battle.teams.findIndex((team) => team.some((p) => sameTag(p.tag, selfTag)));
    battle.teams.forEach((team, index) => {
      for (const player of team) {
        const isSelf = sameTag(player.tag, selfTag);
        if (isSelf) selfPlayer = player;
        participants.push(toParticipant(player, index, isSelf ? 'self' : index === selfTeam ? 'ally' : 'enemy'));
      }
    });
  } else if (Array.isArray(battle.players)) {
    teamsCount = battle.players.length;
    battle.players.forEach((player, index) => {
      const isSelf = sameTag(player.tag, selfTag);
      if (isSelf) selfPlayer = player;
      participants.push(toParticipant(player, index, isSelf ? 'self' : 'enemy'));
    });
  }

  const self = participants.find((p) => p.side === 'self') ?? null;
  let trophyChange = numberOrNull(battle.trophyChange);
  if (trophyChange === null && selfPlayer?.brawlers?.length) {
    // Duels : la variation de trophées est portée par chaque brawler.
    const changes = selfPlayer.brawlers.map((b) => numberOrNull(b.trophyChange)).filter((c): c is number => c !== null);
    if (changes.length) trophyChange = changes.reduce((sum, c) => sum + c, 0);
  }
  const rank = numberOrNull(battle.rank);

  return {
    battleTime: parseBattleTime(raw.battleTime),
    eventId: numberOrNull(raw.event?.id) || null,
    mode: battle.mode ?? raw.event?.mode ?? 'unknown',
    map: raw.event?.map ?? null,
    type: battle.type ?? 'unknown',
    outcome: computeOutcome(battle.result, rank, trophyChange, teamsCount),
    rank,
    trophyChange,
    duration: numberOrNull(battle.duration),
    starPlayer: sameTag(battle.starPlayer?.tag, selfTag),
    brawlerId: self?.brawlerId ?? null,
    brawlerName: self?.brawlerName ?? null,
    brawlerPower: self?.power ?? null,
    brawlerTrophies: self?.trophies ?? null,
    teamsCount,
    participants,
  };
}

/**
 * Victoire / défaite / égalité. Pour le Survivant (classement), une variation de
 * trophées non nulle tranche ; sinon la moitié haute du classement compte comme victoire.
 */
export function computeOutcome(
  result: string | undefined,
  rank: number | null,
  trophyChange: number | null,
  teamsCount: number | null,
): Outcome | null {
  if (result === 'victory') return 'win';
  if (result === 'defeat') return 'loss';
  if (result === 'draw') return 'draw';
  if (rank !== null) {
    if (trophyChange !== null && trophyChange !== 0) return trophyChange > 0 ? 'win' : 'loss';
    const places = teamsCount && teamsCount > 1 ? teamsCount : 10;
    return rank <= Math.max(1, Math.floor(places / 2)) ? 'win' : 'loss';
  }
  return null;
}
