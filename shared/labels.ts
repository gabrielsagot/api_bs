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

// Gloire (« fame ») : 8 paliers de 3 niveaux. L'API renvoie « METEORIC FAME I ».
export const FAME_TIERS = ['GLOBAL', 'LUNAR', 'MARTIAN', 'SATURNIAN', 'SOLAR', 'METEORIC', 'ALIEN', 'STARR FORCE'] as const;
export type FameTier = (typeof FAME_TIERS)[number];

const FAME_LABELS: Record<FameTier, string> = {
  GLOBAL: 'mondiale',
  LUNAR: 'lunaire',
  MARTIAN: 'martienne',
  SATURNIAN: 'saturnienne',
  SOLAR: 'solaire',
  METEORIC: 'météorique',
  ALIEN: 'extraterrestre',
  'STARR FORCE': 'Starr Force',
};

/** 'METEORIC FAME I' → { tier: 'METEORIC', level: 'I' } (tolère « SATURNAL »). */
export function parseFame(name?: string | null): { tier: FameTier | null; level: string | null } {
  if (!name) return { tier: null, level: null };
  const match = /^(.*?)\s*FAME\s*([IVX]+)?$/i.exec(name.trim());
  const raw = (match?.[1] ?? name).toUpperCase().replace('SATURNAL', 'SATURNIAN').trim();
  const tier = (FAME_TIERS as readonly string[]).includes(raw) ? (raw as FameTier) : null;
  return { tier, level: match?.[2]?.toUpperCase() ?? null };
}

/** 'METEORIC FAME I' → 'Gloire météorique I' ; un palier inconnu est simplement embelli. */
export function fameLabel(name?: string | null): string | null {
  if (!name) return null;
  const { tier, level } = parseFame(name);
  if (!tier) return titleCase(name);
  return ['Gloire', FAME_LABELS[tier], level].filter(Boolean).join(' ');
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

/**
 * Libellés français officiels des cartes (maps) de Brawl Stars.
 * Les noms renvoyés par l'API officielle sont en anglais.
 */
export const MAP_LABELS: Record<string, string> = {
  // Razzia de gemmes (Gem Grab)
  'Hard Rock Mine': 'Mine hard-rock',
  'Double Swoosh': 'Bruissements',
  'Gem Fort': 'Fort de gemmes',
  'Undermine': 'Tunnel de mine',
  'Crystal Arcade': 'Arcade de cristal',
  'Rustic Arcade': 'Arcade rustique',
  'Minecart Madness': 'Folie des chariots',
  'Flooded Dam': 'Barrage inondé',
  'Cell Division': 'Division cellulaire',
  'Deathcap Trap': 'Piège mortel',
  'Ice Fort': 'Fort de glace',
  'Acute Angle': 'Angle aigu',
  'Deep Diner': 'Dîner des profondeurs',
  'Chilled Cave': 'Grotte glacée',
  'Spring Trap': 'Piège à ressort',
  'Four Squared': 'Quatre carrés',
  'Royal Flush': 'Quinte flush',
  'Solid Center': 'Centre solide',
  'Brrr!': 'Brrr !',
  'Cobweb': 'Toile d’araignée',
  'Cross Cut': 'Coupe transversale',
  'Spare Space': 'Espace de réserve',
  'Bouncing Diner': 'Restaurant rebondissant',

  // Brawlball (Brawl Ball)
  'Center Stage': 'Milieu de scène',
  'Sneaky Fields': 'Champs sournois',
  'Super Beach': 'Super plage',
  'Beach Ball': 'Ballon de plage',
  'Pinball Dreams': 'Flipper',
  'Triple Dribble': 'Triple dribble',
  'Sunny Soccer': 'Foot sous le soleil',
  'Grass Knot': 'Nœud Herbe',
  'Spiraling Out': 'Spirale infernale',
  'Puddle Splash': "Flaques d'eau",
  'Field Goal': 'Tir au but',
  'Encroaching Evil': 'Mal envahissant',
  'Galaxy Arena': 'Arène galactique',
  'Backyard Bowl': "Stade d'arrière-cour",
  'Post Haste': 'Toute vitesse',
  'Well Rounded': 'Bien équilibré',
  'Penalty Kick': 'Penalty',
  'Center Field': 'Champ central',
  'Coarse Course': 'Parcours rugueux',
  'Slalom': 'Slalom',
  'Warped Arena': 'Arène déformée',
  'Side Step': 'Pas de côté',
  'Goat Meadow': 'Pré des chèvres',
  'Retina': 'Rétine',
  'Iron Alley': 'Allée de fer',
  'Pinball': 'Flipper',
  'Offside': 'Hors-jeu',
  'Sticky Notes': 'Notes autocollantes',

  // 5c5 (Brawlball 5c5, etc.)
  'Stockpile Stadium': 'Stade stable',
  'Stream Masterclass': 'Masterclass de stream',
  'Clean Sweep': 'Coup de balai',
  'Crossover': 'Crossover',
  'Bridges & Canals': 'Ponts et canaux',
  'Tangled': 'Enchevêtré',

  // Braquage (Heist)
  'Safe Zone': 'Zone sécurisée',
  'Hot Potato': "C'est chaud patate",
  'Kaboom Canyon': 'Canyon boum-boum',
  'Bridge Too Far': 'Pont au loin',
  'Jedna': 'Jedna',
  'G.G. Mortuary': 'Morgue G.G.',
  'Pit Stop': 'Arrêt au stand',
  'Snaking Slabs': 'Dalles sinueuses',
  'Corner Case': 'Cas particulier',
  'Tornado Ring': 'Cercle de tornades',
  'Hot Paradox': 'Paradoxe brûlant',
  'Bandit Cove': 'Crique des bandits',
  'Forks Out': 'Fourchettes sorties',
  'Diamond Dust': 'Poussière de diamant',
  'Rolling Rumble': 'Bagarre roulante',
  'Covering Fire': 'Tir de couverture',
  'Side Story': 'Histoire secondaire',
  'Rattlesnake Ravine': 'Ravin du crotale',
  'Safe Cracker': 'Perceur de coffres',

  // Prime (Bounty)
  'Shooting Star': 'Étoile filante',
  'Shooting Stars': 'Étoile filante',
  'Hideout': 'Cachette secrète',
  'Layer Cake': 'Mille-feuilles',
  'Dry Season': 'Saison sèche',
  'Canal Grande': 'Grand Canal',
  'Snake Prairie': 'Prairie aux serpents',
  'Land Run': 'Course à la terre',
  'Bull Pen': 'Enclos à taureaux',
  'Heat Wave': 'Vague de chaleur',
  'Deadeye Intersection': 'Intersection fatale',
  'Overgrown Oasis': 'Oasis luxuriante',
  'Temple Ruins': 'Ruines du temple',
  'Sunstroke': 'Coup de soleil',
  'Cobweb Valley': 'Vallée de la toile',
  'Electric Zone': 'Zone électrique',
  'Excel': 'Excel',
  'Crisis Crossing': 'Croisement de crise',

  // Zone réservée (Hot Zone)
  'Dueling Beetles': 'Duel de scarabées',
  'Ring of Fire': 'Cercle de feu',
  'Open Business': "C'est ouvert !",
  'Parallel Plays': 'Stratégies parallèles',
  'In the Liminal': "Dans l'espace liminaire",
  'Quick Travel': 'Voyage instantané',
  'Tread Carefully': 'Pas légers',
  'Split': 'Séparation',
  'Massive Attack': 'Attaque massive',
  'Quarter Pounder': 'Quart de livre',
  'Street Cred': 'Crédibilité de la rue',
  'Open Space': 'Espace ouvert',
  'Controller': 'Contrôleur',
  'Rush Hour': 'Heure de pointe',
  'Sizzling Stakes': 'Enjeux brûlants',
  'Streamlined': 'Profilé',

  // Hors-jeu (Knockout)
  "Belle's Rock": 'Rocher de la belle',
  'Goldarm Gulch': "Ravin du bras d'or",
  'Flaring Phoenix': 'Phénix flamboyant',
  'Out in the Open': 'À découvert',
  'New Horizons': 'Nouveaux horizons',
  'New Perspective': 'Nouvelle perspective',
  'Deep End': 'Grand bain',
  'Healthy Middle Ground': 'Juste milieu',
  'Ends of the Earth': 'Bouts du monde',
  'Riverside': 'Bord de rivière',
  'Four Lakes': 'Quatre lacs',
  'Split Difference': 'Couper la poire en deux',
  'Gold Rush': "Ruée vers l'or",
  'Island Crossing': 'Traversée des îles',
  'Between the Rivers': 'Entre deux rivières',
  'Tearful Glade': 'Clairière en larmes',
  'Sunset Valley': 'Vallée du couchant',
  'Crimson Flare': 'Lueur pourpre',

  // Survivant (Solo, Duo, Trio Showdown)
  'Rockwall Brawl': "Brawl n'roll",
  'Skull Creek': 'Crique du crâne',
  'Cavern Churn': 'Caverne bouillonnante',
  'Double Trouble': 'Double danger',
  'Feast or Famine': 'Festin ou famine',
  'Thousand Lakes': 'Mille lacs',
  'Two Thousand Lakes': 'Deux mille lacs',
  'Flying Fantasies': 'Fantasmes volants',
  'Acid Lakes': "Lac d'acide",
  'Makeshift Scaffolding': 'Échafaudage de fortune',
  'Danger Intersection': 'Intersection dangereuse',
  'Dark Passage': 'Passage sombre',
  'Eggshell': "Coquille d'œuf",
  'Eye of the Storm': 'Œil du cyclone',
  'Forsaken Falls': 'Chutes délaissées',
  'Galaxy': 'Galaxie',
  'Safety Center': 'Centre sécurisé',
  'Stormy Plains': 'Plaines orageuses',
  'Dune Drift': 'Dérive des dunes',
  'Royal Runway': 'Piste royale',
  'Passage': 'Passage',
  'Clash Colosseum': 'Colisée du choc',
  'Vortex': 'Vortex',
  'Island Invasion': 'Invasion des îles',
  'Core Crossing': 'Croisement central',
  'Point of View': 'Point de vue',
  'Shadow Valley': 'Vallée des ombres',
  'Scorched Stone': 'Pierre brûlée',
  'Erratic Blocks': 'Blocs erratiques',

  // Basket Brawl
  'Pocket Pass': 'Passe de poche',
  'Triple-Double': 'Triple-double',
  'Ball Hog': 'Monopolisateur',
  'Turnover': 'Retournement',
  'Green Meadow': 'Pré vert',
  'Dancing Lights': 'Lumières dansantes',
  'Iron Court': 'Terrain de fer',

  // Duels
  'Search and Destroy': 'Recherche et destruction',
  'Four Levels': 'Quatre niveaux',
  'No Excuses': "Pas d'excuses",
  'Meadow': 'Prairie',
  'Monkey Maze': 'Labyrinthe des singes',
  'Iron Core': 'Noyau de fer',
  'Shrouding Serpent': 'Serpent enveloppant',
  'Grim Island': 'Île sinistre',
  'Warrior Way': 'Voie du guerrier',
  'Duel of the Fates': 'Duel des destins',

  // Modes saisonniers & spéciaux
  'Raging Ocean': 'Océan agité',
  'Mirage Arena': 'Arène mirage',
  'Infinite Doom': 'Destin infini',
  'Splatter Arena': 'Arène d’éclaboussures',
};

function normalizeMapKey(name: string): string {
  return name.trim().toLowerCase().replace(/['’`]/gu, "'");
}

const NORMALIZED_MAP_LABELS = new Map<string, string>();
for (const [key, val] of Object.entries(MAP_LABELS)) {
  NORMALIZED_MAP_LABELS.set(normalizeMapKey(key), val);
}

/**
 * Traduction française officielle des maps du jeu.
 * Si la map n'est pas répertoriée (création personnalisée ou nouvelle map),
 * renvoie le nom original nettoyé.
 */
export function mapLabel(name: string): string;
export function mapLabel(name: undefined | null): null;
export function mapLabel(name?: string | null): string | null;
export function mapLabel(name?: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return '';
  return NORMALIZED_MAP_LABELS.get(normalizeMapKey(trimmed)) ?? trimmed;
}

