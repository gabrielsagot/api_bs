import { MAX_RANKED_TIER } from '../../shared/labels';
import type { RankedSetDto } from '../../shared/types';

// Points Ranked (ELO). Le profil ne donne que la valeur actuelle : le dashboard
// la relève à chaque collecte. En recoupant ces relevés avec l'heure des sets, on
// retrouve combien de points chaque set a rapporté ou coûté.

export interface EloSample {
  t: string;
  elo: number;
}

/**
 * Renseigne `eloChange` sur chaque set (liste du plus récent au plus ancien).
 * Un écart n'est attribué que s'il est sans ambiguïté : un relevé après le set et
 * avant le suivant, et un relevé qui reflète l'état juste avant le set.
 */
export function attachEloChanges(sets: RankedSetDto[], samples: readonly EloSample[]): void {
  const chronological = [...sets].reverse();
  const sorted = [...samples].sort((a, b) => a.t.localeCompare(b.t));
  const lastAtOrBefore = (t: string) => {
    let found: EloSample | undefined;
    for (const sample of sorted) {
      if (sample.t > t) break;
      found = sample;
    }
    return found;
  };
  const lastIn = (from: string, to: string) => {
    let found: EloSample | undefined;
    for (const sample of sorted) {
      if (sample.t > to) break;
      if (sample.t > from) found = sample;
    }
    return found;
  };

  let previousMeasured = false;
  chronological.forEach((set, index) => {
    const nextStart = chronological[index + 1]?.start ?? '9999';
    const after = lastIn(set.end, nextStart);
    const before = index === 0 || previousMeasured ? lastAtOrBefore(set.start) : undefined;
    set.eloChange = after && before ? after.elo - before.elo : null;
    previousMeasured = after !== undefined;
  });
}

/**
 * Seuil (en points) d'un rang. Déduit des données réelles : 500 points par rang à
 * partir d'Argent II (Mythique III = 5 500, Légendaire II = 6 500…). Les tout
 * premiers rangs ne sont pas connus avec certitude : null.
 */
export function defaultTierThreshold(tier: number): number | null {
  if (tier < 5 || tier > MAX_RANKED_TIER) return null;
  return 500 * (tier - 4);
}

/** Seuils corrigés par les observations (un rang vu avec moins de points que prévu abaisse son seuil). */
export function tierThresholds(observations: readonly { elo: number; tier: number }[]): Map<number, number> {
  const thresholds = new Map<number, number>();
  for (let tier = 1; tier <= MAX_RANKED_TIER; tier++) {
    const value = defaultTierThreshold(tier);
    if (value !== null) thresholds.set(tier, value);
  }
  for (const { elo, tier } of observations) {
    const current = thresholds.get(tier);
    if (current !== undefined && elo < current) thresholds.set(tier, elo);
  }
  return thresholds;
}

export interface NextTierInfo {
  nextTier: number | null;
  nextTierElo: number | null;
  pointsToNext: number | null;
  avgEloPerSet: number | null;
  setsToNext: number | null;
}

/** Points restants avant le rang suivant et estimation en nombre de sets. */
export function nextTierInfo(
  elo: number | null,
  tier: number | null,
  thresholds: ReadonlyMap<number, number>,
  recentSetChanges: readonly number[],
): NextTierInfo {
  const empty: NextTierInfo = { nextTier: null, nextTierElo: null, pointsToNext: null, avgEloPerSet: null, setsToNext: null };
  if (elo === null || tier === null || tier >= MAX_RANKED_TIER) return empty;
  const nextTier = tier + 1;
  const nextTierElo = thresholds.get(nextTier) ?? null;
  const pointsToNext = nextTierElo !== null ? Math.max(0, nextTierElo - elo) : null;
  const avgEloPerSet = recentSetChanges.length
    ? recentSetChanges.reduce((sum, change) => sum + change, 0) / recentSetChanges.length
    : null;
  const setsToNext =
    pointsToNext !== null && avgEloPerSet !== null && avgEloPerSet > 0 ? Math.ceil(pointsToNext / avgEloPerSet) : null;
  return { nextTier, nextTierElo, pointsToNext, avgEloPerSet, setsToNext };
}
