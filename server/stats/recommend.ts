import type { RecommendationDto, WinLoss } from '../../shared/types';
import type { RotationSlot } from '../catalog';
import { breakdown, byBrawlerKey, shrunkWinRate, winLoss } from './aggregate';
import type { StoredBattle } from './normalize';

export interface OwnedBrawler {
  id: number;
  name: string;
  trophies: number;
  power: number;
}

const decided = (row: { wins: number; losses: number }) => row.wins + row.losses;

/**
 * Brawlers conseillés pour un événement, d'après TON historique.
 * Lissage en cascade : ton winrate global sur le mode → celui du brawler sur le mode
 * → celui du brawler sur la map. Ainsi une seule victoire (« 100 % ») ne passe pas
 * devant un brawler solide sur des dizaines de parties.
 */
export function recommendForSlot(
  slot: RotationSlot,
  battles: readonly StoredBattle[],
  owned: ReadonlyMap<number, OwnedBrawler>,
  limit = 4,
): { history: WinLoss; recommendations: RecommendationDto[] } {
  const inMode = battles.filter((b) => b.mode === slot.mode);
  const onMap = slot.map ? inMode.filter((b) => b.map === slot.map) : [];
  const modeRate = winLoss(inMode).winRate ?? 0.5;
  const mapRows = new Map(breakdown(onMap, byBrawlerKey).map((row) => [row.id, row]));
  const modeRows = new Map(breakdown(inMode, byBrawlerKey).map((row) => [row.id, row]));

  const recommendations: RecommendationDto[] = [];
  for (const brawler of owned.values()) {
    const mapRow = mapRows.get(brawler.id);
    const modeRow = modeRows.get(brawler.id);
    const modePrior = modeRow ? shrunkWinRate(modeRow, modeRate, 6) : modeRate;
    let pick: { row: NonNullable<typeof mapRow>; score: number; basis: 'map' | 'mode' } | null = null;
    if (mapRow && decided(mapRow) >= 2) {
      pick = { row: mapRow, score: shrunkWinRate(mapRow, modePrior, 6), basis: 'map' };
    } else if (modeRow && decided(modeRow) >= 2) {
      pick = { row: modeRow, score: modePrior * 0.98, basis: 'mode' };
    }
    // On ne conseille que des brawlers au moins aussi efficaces que ta moyenne sur le mode.
    if (!pick || pick.score < modeRate - 0.02) continue;
    recommendations.push({
      brawlerId: brawler.id,
      brawlerName: brawler.name,
      games: pick.row.games,
      wins: pick.row.wins,
      winRate: pick.row.winRate,
      score: pick.score,
      basis: pick.basis,
      trophies: brawler.trophies,
      power: brawler.power,
    });
  }
  recommendations.sort((a, b) => b.score - a.score || b.games - a.games);
  return { history: winLoss(onMap), recommendations: recommendations.slice(0, limit) };
}
