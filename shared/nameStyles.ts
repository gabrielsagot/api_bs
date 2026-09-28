// Couleurs de pseudo proposées par Brawl Stars (écran « Choisir la couleur »).
// Toutes sauf le blanc sont des dégradés ; les couleurs ont été relevées sur une
// capture du jeu, de gauche à droite dans le pseudo.
//
// L'API ne renvoie qu'une couleur (« nameColor », ex. 0xfff05637) : le style est
// deviné à partir d'elle (le plus proche), et peut être choisi à la main dans les
// Réglages quand la déduction se trompe.

export interface NameStyle {
  id: string;
  label: string;
  /** Couleurs du dégradé, de gauche à droite (une seule pour le blanc). */
  stops: string[];
}

export const NAME_STYLES: readonly NameStyle[] = [
  { id: 'blanc', label: 'Blanc', stops: ['#ffffff'] },
  { id: 'corail', label: 'Corail rosé', stops: ['#ea6061', '#ec9a47', '#dc3f8a'] },
  { id: 'vert', label: 'Vert', stops: ['#43dd86', '#1bc955', '#39da6d'] },
  { id: 'or', label: 'Or', stops: ['#ebc418', '#eaa10e', '#e5c221'] },
  { id: 'peche', label: 'Pêche', stops: ['#f3b68c', '#e88762', '#eaa481'] },
  { id: 'braise', label: 'Braise', stops: ['#f5ae3a', '#e8403a', '#f19a35'] },
  { id: 'citron', label: 'Citron', stops: ['#f5f189', '#efdc51', '#e9e27e'] },
  { id: 'sable', label: 'Sable', stops: ['#f8d19d', '#f0bc88', '#f3cc99'] },
  { id: 'anis', label: 'Anis', stops: ['#a5e673', '#43d439', '#87e574'] },
  { id: 'lagon', label: 'Lagon', stops: ['#1dd2e5', '#23a8e6', '#17beda'] },
  { id: 'framboise', label: 'Framboise', stops: ['#e3766d', '#e1396e', '#df626e'] },
  { id: 'magenta', label: 'Magenta', stops: ['#de3bc7', '#ca07d3', '#dc1bc3'] },
];

export function nameStyleById(id: string | null | undefined): NameStyle | null {
  return NAME_STYLES.find((style) => style.id === id) ?? null;
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** « 0xfff05637 » → « #f05637 » (null si illisible). */
export function apiColorToHex(apiColor: string | null | undefined): string | null {
  const match = /^(?:0x|#)?(?:[0-9a-f]{2})?([0-9a-f]{6})$/i.exec(apiColor?.trim() ?? '');
  return match ? `#${match[1].toLowerCase()}` : null;
}

/**
 * Style le plus proche de la couleur renvoyée par l'API : on compare cette couleur
 * à chacune des teintes du dégradé et on garde le style qui en contient une proche.
 */
export function guessNameStyle(apiColor: string | null | undefined): NameStyle | null {
  const hex = apiColorToHex(apiColor);
  if (!hex) return null;
  const target = rgb(hex);
  let best: NameStyle | null = null;
  let bestDistance = Infinity;
  for (const style of NAME_STYLES) {
    for (const stop of style.stops) {
      const [r, g, b] = rgb(stop);
      const distance = Math.hypot(r - target[0], g - target[1], b - target[2]);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = style;
      }
    }
  }
  // Trop loin de tout style connu : couleur inconnue, on garde la couleur brute.
  return bestDistance <= 90 ? best : null;
}
