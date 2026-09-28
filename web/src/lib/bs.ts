import { isKnownTier, parseFame, type FameTier } from '../../../shared/labels';

// Repères visuels de Brawl Stars : couleur du pseudo, rangs, gloire, modes, raretés.
// Les couleurs du jeu sont souvent très claires (pensées pour un fond sombre) : pour
// du texte sur fond blanc, readableColor() les assombrit en gardant leur teinte.

// ── Couleurs ──────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function saturation(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * Couleur lisible sur fond clair : assombrie par petits pas jusqu'au contraste voulu
 * (3:1 pour du texte en gras ou de grande taille, 4.5:1 pour du petit texte).
 */
export function readableColor(hex: string, minContrast = 3, background = '#ffffff'): string {
  let rgb = hexToRgb(hex);
  for (let i = 0; i < 40 && contrastRatio(rgbToHex(rgb), background) < minContrast; i++) {
    rgb = rgb.map((v) => v * 0.93) as [number, number, number];
  }
  return rgbToHex(rgb);
}

/**
 * Couleur du pseudo choisie dans le jeu (« 0xfff05637 » → « #f05637 »), rendue lisible.
 * Le blanc et les gris (pseudo par défaut) renvoient null : on garde la couleur du texte.
 */
export function nameColor(apiColor: string | null | undefined, minContrast = 3): string | null {
  const match = /^(?:0x|#)?(?:[0-9a-f]{2})?([0-9a-f]{6})$/i.exec(apiColor?.trim() ?? '');
  if (!match) return null;
  const hex = `#${match[1].toLowerCase()}`;
  if (saturation(hex) < 0.15) return null;
  return readableColor(hex, minContrast);
}

// ── Rangs Ranked ──────────────────────────────────────────────

/** Couleur de chaque famille de rang, reprise des emblèmes du jeu. */
const TIER_COLORS = ['#e8862a', '#8f9be0', '#f2b200', '#1fb8e8', '#c32fd8', '#e53935', '#a33a12', '#e0a100'];

export function tierColor(tier: number | null | undefined): string | null {
  if (!isKnownTier(tier)) return null;
  return TIER_COLORS[Math.min(Math.floor((tier - 1) / 3), TIER_COLORS.length - 1)];
}

/** Emblème officiel du rang (Bronze I = 58000000 … Pro = 58000021) sur le CDN Brawlify. */
export function tierIconId(tier: number | null | undefined): number | null {
  return isKnownTier(tier) ? 58_000_000 + tier - 1 : null;
}

// ── Gloire ────────────────────────────────────────────────────

/** Une couleur par palier, d'après son thème (l'API ne fournit pas de couleur). */
const FAME_COLORS: Record<FameTier, string> = {
  GLOBAL: '#2f7de1',
  LUNAR: '#7b86a8',
  MARTIAN: '#d9542b',
  SATURNIAN: '#c08a1e',
  SOLAR: '#f0a000',
  METEORIC: '#e8603c',
  ALIEN: '#3fae3a',
  'STARR FORCE': '#b640e0',
};

export function fameColor(name: string | null | undefined): string | null {
  const { tier } = parseFame(name);
  return tier ? FAME_COLORS[tier] : null;
}

// ── Modes de jeu ──────────────────────────────────────────────

/** Identifiant Brawlify (icône) et couleur officielle de chaque mode renvoyé par l'API. */
const MODES: Record<string, [id: number, color: string]> = {
  gemGrab: [48000000, '#d852ff'],
  heist: [48000002, '#d852ff'],
  bounty: [48000003, '#24d6ff'],
  brawlBall: [48000005, '#9ab1fd'],
  soloShowdown: [48000006, '#91e136'],
  bigGame: [48000007, '#ff6847'],
  roboRumble: [48000008, '#ff6847'],
  duoShowdown: [48000009, '#91e136'],
  bossFight: [48000010, '#ff6847'],
  takedown: [48000014, '#3891ff'],
  loneStar: [48000015, '#e24e5a'],
  presentPlunder: [48000016, '#2ef3e0'],
  hotZone: [48000017, '#ff4343'],
  knockout: [48000020, '#fd9b0e'],
  basketBrawl: [48000022, '#2fc4f9'],
  volleyBrawl: [48000023, '#c2ed00'],
  duels: [48000024, '#c2ed00'],
  wipeout: [48000025, '#24d6ff'],
  payload: [48000026, '#ff4343'],
  hunters: [48000028, '#fd9b0e'],
  lastStand: [48000029, '#ff6847'],
  wipeout5V5: [48000031, '#24d6ff'],
  brawlBall5V5: [48000032, '#9ab1fd'],
  gemGrab5V5: [48000033, '#d852ff'],
  knockout5V5: [48000035, '#fd9b0e'],
  trioShowdown: [48000038, '#91e136'],
  brawlHockey: [48000045, '#9ab1fd'],
};

export function modeIconId(mode: string | null | undefined): number | null {
  return (mode && MODES[mode]?.[0]) || null;
}

export function modeColor(mode: string | null | undefined): string | null {
  return (mode && MODES[mode]?.[1]) || null;
}

// ── Raretés ───────────────────────────────────────────────────

/** Couleurs des raretés dans le jeu. */
const RARITY_COLORS: Record<string, string> = {
  'Starting Brawler': '#9fd8f5',
  Common: '#9fd8f5',
  Rare: '#5ad64a',
  'Super Rare': '#3f9ef7',
  Epic: '#c64cf5',
  Mythic: '#f5485f',
  Legendary: '#f2d40c',
  'Ultra Legendary': '#ff6a00',
  Chromatic: '#f08d1d',
};

export function rarityColor(rarity: string | null | undefined): string | null {
  return (rarity && RARITY_COLORS[rarity]) || null;
}
