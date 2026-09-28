import { titleCase } from '../../shared/labels';
import type { DuoRow, RankedSetDto } from '../../shared/types';
import { frequentAllies, winLoss } from './aggregate';
import type { StoredBattle } from './normalize';

/**
 * Toi avec ou sans un coéquipier régulier : winrate ensemble, winrate sans lui,
 * points Ranked nets des sets joués ensemble et vos meilleures combinaisons.
 */
export function duoStats(battles: readonly StoredBattle[], sets: readonly RankedSetDto[]): DuoRow[] {
  return frequentAllies(battles).map((ally) => {
    const together = battles.filter((b) => b.participants.some((p) => p.side === 'ally' && p.tag === ally.key));
    const without = battles.filter((b) => !b.participants.some((p) => p.side === 'ally' && p.tag === ally.key));
    const withoutStats = winLoss(without);

    const setsTogether = sets.filter((s) => s.allies.some((p) => p.tag === ally.key));
    const measured = setsTogether.filter((s) => s.eloChange !== null);

    const pairs = new Map<string, { myId: number; myName: string; allyId: number; allyName: string; battles: StoredBattle[] }>();
    for (const battle of together) {
      const mate = battle.participants.find((p) => p.side === 'ally' && p.tag === ally.key);
      if (battle.brawlerId === null || !mate?.brawlerId) continue;
      const key = `${battle.brawlerId}|${mate.brawlerId}`;
      const pair = pairs.get(key) ?? {
        myId: battle.brawlerId,
        myName: titleCase(battle.brawlerName),
        allyId: mate.brawlerId,
        allyName: titleCase(mate.brawlerName),
        battles: [],
      };
      pair.battles.push(battle);
      pairs.set(key, pair);
    }

    return {
      tag: ally.key,
      name: ally.label,
      games: ally.games,
      wins: ally.wins,
      losses: ally.losses,
      winRate: ally.winRate,
      withoutGames: withoutStats.games,
      withoutWinRate: withoutStats.winRate,
      sets: setsTogether.length,
      eloNet: measured.length ? measured.reduce((sum, s) => sum + (s.eloChange ?? 0), 0) : null,
      pairs: [...pairs.values()]
        .map(({ battles: pairBattles, ...pair }) => ({ ...pair, ...winLoss(pairBattles) }))
        .filter((pair) => pair.games >= 2)
        .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0) || b.games - a.games)
        .slice(0, 3),
    };
  });
}
