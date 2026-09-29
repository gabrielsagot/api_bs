import type { StoredMetaMatch } from '../meta/matches';

// Moteur du Draft : à partir des manches classées de la communauté, estime pour
// chaque brawler encore disponible ses chances sur la map, compte tenu de ses
// alliés, des ennemis déjà choisis et du risque d'être contré par les picks restants.
//
// Tout est calculé en « log-odds » (logit du taux de victoire), ce qui permet
// d'additionner les effets : force sur la map + synergies + contres − risque.
// Chaque statistique est lissée vers ce qu'on attendrait sans elle, pour que
// quelques parties ne suffisent pas à créer un « 100 % ».

const DAY_MS = 86_400_000;
/** Une manche compte deux fois moins toutes les trois semaines (la méta évolue). */
export const HALF_LIFE_DAYS = 21;
const K_MODE = 30; // lissage du taux de victoire sur le mode, vers 50 %
const K_MAP = 20; // lissage sur la map, vers le taux du mode
const K_PAIR = 25; // lissage des duos et des face-à-face, vers l'attendu
/** Seuil (en log-odds, ≈ 2 points de %) sous lequel un effet n'est pas cité. */
const NOTABLE = 0.08;

export interface Agg {
  /** Parties pondérées par l'ancienneté. */
  g: number;
  w: number;
  /** Parties réelles (non pondérées), pour afficher la taille de l'échantillon. */
  n: number;
}

export interface DraftModel {
  mode: string;
  matches: number;
  mapMatches: Map<string, number>;
  mode_: Map<number, Agg>;
  map: Map<string, Map<number, Agg>>;
  pair: Map<string, Agg>;
  versus: Map<string, Agg>;
}

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clampP = (p: number) => Math.min(0.97, Math.max(0.03, p));

function add(map: Map<string, Agg> | Map<number, Agg>, key: string | number, weight: number, win: boolean): void {
  const store = map as Map<string | number, Agg>;
  const agg = store.get(key) ?? { g: 0, w: 0, n: 0 };
  agg.g += weight;
  agg.w += win ? weight : 0;
  agg.n += 1;
  store.set(key, agg);
}

const pairKey = (a: number, b: number) => (a < b ? `${a}+${b}` : `${b}+${a}`);
const versusKey = (a: number, b: number) => `${a}>${b}`;

/** Agrège les manches d'un mode (toutes maps confondues, avec le détail par map). */
export function buildDraftModel(mode: string, matches: readonly StoredMetaMatch[], now = Date.now()): DraftModel {
  const model: DraftModel = { mode, matches: 0, mapMatches: new Map(), mode_: new Map(), map: new Map(), pair: new Map(), versus: new Map() };
  for (const match of matches) {
    const age = Math.max(0, now - Date.parse(match.battleTime)) / DAY_MS;
    const weight = 0.5 ** (age / HALF_LIFE_DAYS);
    model.matches++;
    model.mapMatches.set(match.map, (model.mapMatches.get(match.map) ?? 0) + 1);
    const byMap = model.map.get(match.map) ?? new Map<number, Agg>();
    model.map.set(match.map, byMap);
    const teams = [match.teamA, match.teamB];
    teams.forEach((team, index) => {
      const won = match.winner === index;
      const enemies = teams[1 - index];
      for (const brawler of team) {
        add(model.mode_, brawler, weight, won);
        add(byMap, brawler, weight, won);
        for (const enemy of enemies) add(model.versus, versusKey(brawler, enemy), weight, won);
      }
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) add(model.pair, pairKey(team[i], team[j]), weight, won);
      }
    });
  }
  return model;
}

/** Taux de victoire lissé sur le mode (vers 50 %). */
export function modeWinRate(model: DraftModel, brawler: number): number {
  const agg = model.mode_.get(brawler);
  return clampP(((agg?.w ?? 0) + 0.5 * K_MODE) / ((agg?.g ?? 0) + K_MODE));
}

/** Taux de victoire lissé sur la map (vers le taux du mode). */
export function mapWinRate(model: DraftModel, map: string, brawler: number): number {
  const agg = model.map.get(map)?.get(brawler);
  const prior = modeWinRate(model, brawler);
  return clampP(((agg?.w ?? 0) + prior * K_MAP) / ((agg?.g ?? 0) + K_MAP));
}

/** Écart (log-odds) entre ce qu'un duo obtient ensemble et ce qu'on attendrait de chacun. */
export function synergy(model: DraftModel, a: number, b: number): number {
  const agg = model.pair.get(pairKey(a, b));
  if (!agg) return 0;
  const expected = clampP(sigmoid(logit(modeWinRate(model, a)) + logit(modeWinRate(model, b))));
  const observed = clampP((agg.w + expected * K_PAIR) / (agg.g + K_PAIR));
  return logit(observed) - logit(expected);
}

/** Avantage (log-odds) de `a` face à `b`, au-delà de leur force respective. Positif : a bat b. */
export function counter(model: DraftModel, a: number, b: number): number {
  const agg = model.versus.get(versusKey(a, b));
  if (!agg) return 0;
  const expected = clampP(sigmoid(logit(modeWinRate(model, a)) - logit(modeWinRate(model, b))));
  const observed = clampP((agg.w + expected * K_PAIR) / (agg.g + K_PAIR));
  return logit(observed) - logit(expected);
}

export interface DraftState {
  map: string;
  bans: number[];
  allies: number[];
  enemies: number[];
  /** Picks adverses encore à venir après le mien (0 à 3) : risque d'être contré. */
  enemyPicksAfter: number;
  /** Brawlers possibles (ta collection, ou tous). */
  candidates: number[];
  /** Ton historique en Ranked par brawler (bonus de maîtrise), si demandé. */
  mastery?: Map<number, { games: number; wins: number }>;
}

export type ReasonKind = 'map' | 'synergy' | 'counter' | 'risk' | 'mastery';

export interface PickReason {
  kind: ReasonKind;
  /** Brawler cité (allié, ennemi ou menace). */
  brawlerId?: number;
  /** Effet sur les chances, en points de pourcentage autour de 50 %. */
  points: number;
  /** Donnée brute : taux de victoire (map, maîtrise) ou nombre de parties. */
  rate?: number;
  games?: number;
}

export interface PickScore {
  brawlerId: number;
  /** Chances estimées (0-1). */
  estimate: number;
  score: number;
  mapWinRate: number;
  mapGames: number;
  reasons: PickReason[];
}

/** Effet d'un terme en log-odds, traduit en points de % autour de 50 %. */
const points = (delta: number) => (sigmoid(delta) - 0.5) * 100;

export function scorePicks(model: DraftModel, state: DraftState): PickScore[] {
  const taken = new Set([...state.bans, ...state.allies, ...state.enemies]);
  const available = state.candidates.filter((id) => !taken.has(id));
  // Brawlers que l'adversaire peut encore choisir (tous, pas seulement les miens).
  const enemyPool = [...model.mode_.keys()].filter((id) => !taken.has(id));

  return available
    .map((brawler) => {
      const reasons: PickReason[] = [];
      const mapRate = mapWinRate(model, state.map, brawler);
      const mapAgg = model.map.get(state.map)?.get(brawler);
      let score = logit(mapRate);
      reasons.push({ kind: 'map', points: points(logit(mapRate)), rate: mapRate, games: mapAgg?.n ?? 0 });

      for (const ally of state.allies) {
        const effect = synergy(model, brawler, ally);
        score += effect;
        if (Math.abs(effect) >= NOTABLE) reasons.push({ kind: 'synergy', brawlerId: ally, points: points(effect) });
      }
      for (const enemy of state.enemies) {
        const effect = counter(model, brawler, enemy);
        score += effect;
        if (Math.abs(effect) >= NOTABLE) reasons.push({ kind: 'counter', brawlerId: enemy, points: points(effect) });
      }

      // Risque : les meilleurs contres encore disponibles pour l'adversaire,
      // pondérés par le nombre de picks qu'il lui reste après le mien.
      if (state.enemyPicksAfter > 0) {
        const threats = enemyPool
          .filter((id) => id !== brawler)
          .map((id) => ({ id, effect: counter(model, id, brawler) }))
          .filter((t) => t.effect > 0)
          .sort((x, y) => y.effect - x.effect)
          .slice(0, 3);
        if (threats.length) {
          // Le meilleur contre compte le plus : c'est lui que l'adversaire choisira.
          const weighted = threats.reduce((sum, t, i) => sum + t.effect * [0.6, 0.25, 0.15][i], 0);
          const risk = weighted * (Math.min(3, state.enemyPicksAfter) / 3);
          score -= risk;
          if (risk >= NOTABLE / 2) reasons.push({ kind: 'risk', brawlerId: threats[0].id, points: -points(risk) });
        }
      }

      const mine = state.mastery?.get(brawler);
      if (mine && mine.games >= 3) {
        // Bonus modeste : ton taux (lissé) sur ce brawler, au plus ± 4 points.
        const rate = clampP((mine.wins + 0.5 * 10) / (mine.games + 10));
        const effect = Math.max(-0.16, Math.min(0.16, 0.5 * logit(rate)));
        score += effect;
        if (Math.abs(effect) >= NOTABLE / 2) reasons.push({ kind: 'mastery', points: points(effect), rate: mine.wins / mine.games, games: mine.games });
      }

      return { brawlerId: brawler, estimate: sigmoid(score), score, mapWinRate: mapRate, mapGames: mapAgg?.n ?? 0, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

export interface BanScore {
  brawlerId: number;
  mapWinRate: number;
  /** Part des équipes qui le choisissent sur cette map. */
  presence: number;
  mapGames: number;
  score: number;
}

/**
 * Bans conseillés : l'API ne dit pas ce qui est banni, donc on estime la menace :
 * surtout le taux de victoire sur la map, un peu la fréquence de pick.
 */
export function scoreBans(model: DraftModel, map: string, exclude: readonly number[] = []): BanScore[] {
  const teams = (model.mapMatches.get(map) ?? 0) * 2;
  const skip = new Set(exclude);
  const rows = [...(model.map.get(map)?.entries() ?? [])]
    .filter(([id]) => !skip.has(id))
    .map(([id, agg]) => ({ brawlerId: id, mapWinRate: mapWinRate(model, map, id), presence: teams ? agg.n / teams : 0, mapGames: agg.n }))
    .filter((row) => row.presence >= 0.02);
  return rows
    .map((row) => ({ ...row, score: 0.85 * logit(row.mapWinRate) + 0.15 * logit(clampP(row.presence)) }))
    .sort((a, b) => b.score - a.score);
}
