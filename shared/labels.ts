// Libellés français des modes, types de combats, rangs et raretés.
// L'API renvoie des identifiants anglais (camelCase) : tout ce qui n'est pas
// connu ici est simplement « embelli » (brawlBall5V5 → Brawl Ball 5v5).

const MODE_LABELS: Record<string, string> = {
  gemGrab: 'Razzia de gemmes',
  brawlBall: 'Brawlball',
  heist: 'Braquage',
  bounty: 'Prime',
  hotZone: 'Zone réservée',
  knockout: 'Hors-jeu',
  siege: 'Siège',
  wipeout: 'Wipeout',
  payload: 'Payload',
  soloShowdown: 'Survivant solo',
  duoShowdown: 'Survivant duo',
  trioShowdown: 'Survivant trio',
  duels: 'Duels',
  basketBrawl: 'Basket Brawl',
  volleyBrawl: 'Volley Brawl',
  brawlHockey: 'Brawl Hockey',
  bossFight: 'Combat de boss',
  bigGame: 'Big Game',
  roboRumble: 'Robo Rumble',
  presentPlunder: 'Present Plunder',
  holdTheTrophy: 'Hold the Trophy',
  trophyThieves: 'Trophy Thieves',
  hunters: 'Hunters',
  lastStand: 'Last Stand',
  takedown: 'Takedown',
  loneStar: 'Lone Star',
  gemGrab5V5: 'Razzia de gemmes 5c5',
  brawlBall5V5: 'Brawlball 5c5',
  knockout5V5: 'Hors-jeu 5c5',
  wipeout5V5: 'Wipeout 5c5',
  unknown: 'Mode inconnu',
};

/** 'brawlBall5V5' → 'Brawl Ball 5v5' */
export function prettifyIdentifier(id: string): string {
  const spaced = id
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/(\d)V(\d)/g, '$1v$2')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function modeLabel(mode?: string | null): string {
  if (!mode) return MODE_LABELS.unknown;
  return MODE_LABELS[mode] ?? prettifyIdentifier(mode);
}

export type BattleCategory = 'ranked' | 'trophies' | 'friendly' | 'other';

/**
 * Attention au piège de l'API : type « ranked » = combats de trophées classiques.
 * Le mode Ranked (ex-Ligue) apparaît en « soloRanked » / « teamRanked ».
 */
export function battleCategory(type?: string | null): BattleCategory {
  if (!type) return 'other';
  if (type === 'ranked') return 'trophies';
  if (/ranked/i.test(type)) return 'ranked';
  if (type === 'friendly') return 'friendly';
  return 'other';
}

const TYPE_LABELS: Record<string, string> = {
  ranked: 'Trophées',
  soloRanked: 'Ranked',
  teamRanked: 'Ranked en équipe',
  friendly: 'Amical',
  challenge: 'Défi',
  championshipChallenge: 'Championnat',
  tournament: 'Tournoi',
};

export function battleTypeLabel(type?: string | null): string {
  if (!type) return 'Autre';
  return TYPE_LABELS[type] ?? prettifyIdentifier(type);
}

export const CATEGORY_LABELS: Record<BattleCategory, string> = {
  ranked: 'Ranked',
  trophies: 'Trophées',
  friendly: 'Amical',
  other: 'Autres',
};

// Rangs du mode Ranked. En combat classé, l'API renvoie le rang du joueur
// (1 = Bronze I … 22 = Pro) dans le champ « trophies » de son brawler.
const TIER_FAMILIES = ['Bronze', 'Argent', 'Or', 'Diamant', 'Mythique', 'Légendaire', 'Masters'] as const;
const ROMAN = ['I', 'II', 'III'] as const;
export const MAX_RANKED_TIER = TIER_FAMILIES.length * 3 + 1;

export function isKnownTier(tier: number | null | undefined): tier is number {
  return typeof tier === 'number' && Number.isInteger(tier) && tier >= 1 && tier <= MAX_RANKED_TIER;
}

export function tierName(tier: number | null | undefined): string {
  if (tier == null) return '—';
  if (!isKnownTier(tier)) return String(tier);
  if (tier === MAX_RANKED_TIER) return 'Pro';
  const family = TIER_FAMILIES[Math.floor((tier - 1) / 3)];
  return `${family} ${ROMAN[(tier - 1) % 3]}`;
}

/** Nom court pour les axes : « Or II » → « Or II », « Légendaire III » → « Lég. III ». */
export function tierShortName(tier: number): string {
  return tierName(tier).replace('Légendaire', 'Lég.').replace('Mythique', 'Myth.').replace('Diamant', 'Diam.');
}

const RARITY_LABELS: Record<string, string> = {
  'Starting Brawler': 'Départ',
  Common: 'Commun',
  Rare: 'Rare',
  'Super Rare': 'Super rare',
  Epic: 'Épique',
  Mythic: 'Mythique',
  Legendary: 'Légendaire',
  'Ultra Legendary': 'Ultra-légendaire',
  Chromatic: 'Chromatique',
};

export function rarityLabel(rarity?: string | null): string | null {
  if (!rarity) return null;
  return RARITY_LABELS[rarity] ?? rarity;
}

/** L'API renvoie les noms en majuscules : 'EL PRIMO' → 'El Primo', '8-BIT' → '8-Bit', 'MR. P' → 'Mr. P'. */
export function titleCase(name?: string | null): string {
  if (!name) return '';
  return name.toLowerCase().replace(/(^|[\s\-.&])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
