import type { ApiBattle, ApiBattlePlayer } from '../server/brawlstars/types';
import { normalizeBattle, type StoredBattle } from '../server/stats/normalize';

export const ME = '#2PP';

export function player(tag: string, brawlerId = 16000000, trophies = 500): ApiBattlePlayer {
  return { tag, name: tag.slice(1), brawler: { id: brawlerId, name: 'SHELLY', power: 11, trophies } };
}

/** Manche 3v3 au format de l'API. */
export function teamBattle(options: {
  time: string;
  result: 'victory' | 'defeat' | 'draw';
  type?: string;
  map?: string;
  mode?: string;
  enemies?: string[];
  tier?: number;
  trophyChange?: number;
  star?: boolean;
}): ApiBattle {
  const tier = options.tier ?? 500;
  const enemies = (options.enemies ?? ['#E1', '#E2', '#E3']).map((tag) => player(tag, 16000001, tier));
  const me = player(ME, 16000000, tier);
  return {
    battleTime: options.time,
    event: { id: 15000007, mode: options.mode ?? 'gemGrab', map: options.map ?? 'Hard Rock Mine' },
    battle: {
      mode: options.mode ?? 'gemGrab',
      type: options.type ?? 'soloRanked',
      result: options.result,
      duration: 120,
      trophyChange: options.trophyChange,
      starPlayer: options.star ? me : enemies[0],
      teams: [[me, player('#A1', 16000002, tier), player('#A2', 16000003, tier)], enemies],
    },
  };
}

let nextId = 1;
export function stored(raw: ApiBattle, tag = ME): StoredBattle {
  return { id: nextId++, ...normalizeBattle(raw, tag) };
}

/** '2026-09-01T10:00:00Z' + minutes → format API '20260901T100000.000Z'. */
export function apiTime(base: string, minutes = 0): string {
  const iso = new Date(Date.parse(base) + minutes * 60_000).toISOString();
  return iso.replace(/[-:]/g, '').replace(/\.(\d{3})Z$/, '.$1Z');
}
