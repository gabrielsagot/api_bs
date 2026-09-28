import type { CSSProperties } from 'react';
import { isKnownTier, parseFame, type FameTier } from '../../../shared/labels';
import { apiColorToHex, guessNameStyle, nameStyleById } from '../../../shared/nameStyles';

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
 * Rendu du pseudo : le style choisi dans les Réglages, sinon celui deviné d'après la
 * couleur de l'API. Chaque teinte est juste assez assombrie pour rester lisible sur
 * fond blanc. Le blanc (pseudo par défaut) renvoie null : couleur du texte normale.
 */
export function nameStyleCss(
  apiColor: string | null | undefined,
  styleId: string | null | undefined,
  minContrast = 2,
): CSSProperties | null {
  const style = nameStyleById(styleId) ?? guessNameStyle(apiColor);
  if (style?.id === 'blanc') return null;
  if (!style) {
    // Couleur hors des styles connus : on l'affiche telle quelle (si elle n'est pas grise).
    const hex = apiColorToHex(apiColor);
    return hex && saturation(hex) >= 0.15 ? { color: readableColor(hex, Math.max(3, minContrast)) } : null;
  }
  const stops = style.stops.map((stop) => readableColor(stop, minContrast));
  return {
    backgroundImage: `linear-gradient(90deg, ${stops.join(', ')})`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    WebkitTextFillColor: 'transparent',
  };
}

/** Couleur unie du pseudo (pastilles, légendes) : teinte centrale du style. */
export function nameSolidColor(apiColor: string | null | undefined, styleId: string | null | undefined): string | null {
  const style = nameStyleById(styleId) ?? guessNameStyle(apiColor);
  if (style?.id === 'blanc') return null;
  const hex = style ? style.stops[Math.floor(style.stops.length / 2)] : apiColorToHex(apiColor);
  return hex ? readableColor(hex, 3) : null;
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

/**
 * Couleurs des emblèmes de gloire du jeu (Terre, Lune, Mars, Saturne, Soleil,
 * Météore…) : remplissage, contour et couleur du texte.
 */
const FAME_STYLES: Record<FameTier, { fill: string; ring: string; text: string }> = {
  GLOBAL: { fill: '#2e8fe0', ring: '#3cc56b', text: '#2a9d55' },
  LUNAR: { fill: '#d4d7dd', ring: '#9aa0aa', text: '#6f7580' },
  MARTIAN: { fill: '#e8453c', ring: '#b3261e', text: '#d32f2f' },
  SATURNIAN: { fill: '#f39a2e', ring: '#c4671a', text: '#d9791c' },
  SOLAR: { fill: '#f8cb1c', ring: '#e3a012', text: '#c98a00' },
  METEORIC: { fill: '#2b2a2e', ring: '#f2661d', text: '#e2404f' },
  ALIEN: { fill: '#8fdc2c', ring: '#4a9e1f', text: '#4a9e1f' },
  'STARR FORCE': { fill: '#b640e0', ring: '#f5c518', text: '#b640e0' },
};

export function fameStyle(name: string | null | undefined): { fill: string; ring: string; text: string } | null {
  const { tier } = parseFame(name);
  return tier ? FAME_STYLES[tier] : null;
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
