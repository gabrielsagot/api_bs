// Économie du jeu utilisée pour le « coût restant pour tout maxer ».
// Valeurs connues au moment de l'écriture : si Supercell change les prix,
// il suffit de modifier ce fichier.

export const MAX_POWER_LEVEL = 11;

/** Coût pour passer du niveau N au niveau N+1 (index = niveau de départ). */
export const LEVEL_UP_COSTS: Record<number, { coins: number; powerPoints: number }> = {
  1: { coins: 20, powerPoints: 20 },
  2: { coins: 35, powerPoints: 30 },
  3: { coins: 75, powerPoints: 50 },
  4: { coins: 140, powerPoints: 80 },
  5: { coins: 290, powerPoints: 130 },
  6: { coins: 480, powerPoints: 210 },
  7: { coins: 800, powerPoints: 340 },
  8: { coins: 1250, powerPoints: 550 },
  9: { coins: 1875, powerPoints: 890 },
  10: { coins: 2800, powerPoints: 1440 },
};

export const GADGET_COST = 1000;
export const STAR_POWER_COST = 2000;
export const HYPERCHARGE_COST = 5000;

/** Pièces et points de puissance pour monter un brawler de `power` au niveau max. */
export function levelCostToMax(power: number): { coins: number; powerPoints: number } {
  let coins = 0;
  let powerPoints = 0;
  for (let level = Math.max(1, power); level < MAX_POWER_LEVEL; level++) {
    const step = LEVEL_UP_COSTS[level];
    if (!step) continue;
    coins += step.coins;
    powerPoints += step.powerPoints;
  }
  return { coins, powerPoints };
}
