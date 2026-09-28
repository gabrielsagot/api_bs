import { titleCase } from '../../shared/labels';
import type { AccessoryDto, BrawlerCardDto, CollectionResponse, CostLineDto, UpgradePriorityDto, WinLoss } from '../../shared/types';
import { shrunkWinRate, winRate } from './aggregate';
import type { ApiAccessory, ApiPlayer, ApiPlayerBrawler } from '../brawlstars/types';
import type { CatalogBrawler, CatalogItem } from '../catalog';
import {
  GADGET_COST,
  HYPERCHARGE_COST,
  LEVEL_UP_COSTS,
  MAX_POWER_LEVEL,
  STAR_POWER_COST,
  levelCostToMax,
} from './costs';

function accessories(all: readonly CatalogItem[], owned: readonly ApiAccessory[] | undefined): AccessoryDto[] {
  const ownedIds = new Set((owned ?? []).map((item) => item.id));
  const known = new Map(all.map((item) => [item.id, item]));
  for (const item of owned ?? []) if (!known.has(item.id)) known.set(item.id, item);
  return [...known.values()].map((item) => ({
    id: item.id,
    name: titleCase(item.name),
    owned: ownedIds.has(item.id),
    level: null,
  }));
}

export function buildCard(
  catalog: CatalogBrawler | undefined,
  owned: ApiPlayerBrawler | undefined,
  stats: WinLoss | undefined,
): BrawlerCardDto {
  const id = owned?.id ?? catalog!.id;
  const gadgets = accessories(catalog?.gadgets ?? [], owned?.gadgets);
  const starPowers = accessories(catalog?.starPowers ?? [], owned?.starPowers);
  const hyperCharges = accessories(catalog?.hyperCharges ?? [], owned?.hyperCharges);
  const gears: AccessoryDto[] = (owned?.gears ?? []).map((gear) => ({
    id: gear.id,
    name: titleCase(gear.name),
    owned: true,
    level: gear.level ?? null,
  }));

  let cost: BrawlerCardDto['cost'] = null;
  if (owned) {
    const levels = levelCostToMax(owned.power);
    const missing = (list: AccessoryDto[]) => list.filter((item) => !item.owned).length;
    const coins =
      levels.coins +
      missing(gadgets) * GADGET_COST +
      missing(starPowers) * STAR_POWER_COST +
      missing(hyperCharges) * HYPERCHARGE_COST;
    cost = { coins, powerPoints: levels.powerPoints, maxed: coins === 0 && levels.powerPoints === 0 };
  }

  return {
    id,
    name: titleCase(owned?.name ?? catalog?.name),
    owned: Boolean(owned),
    rarity: catalog?.rarity ?? null,
    rarityRank: catalog?.rarityRank ?? null,
    className: catalog?.className ?? null,
    power: owned?.power ?? null,
    rank: owned?.rank ?? null,
    trophies: owned?.trophies ?? null,
    highestTrophies: owned?.highestTrophies ?? null,
    prestige: typeof owned?.prestigeLevel === 'number' ? owned.prestigeLevel : null,
    currentWinStreak: typeof owned?.currentWinStreak === 'number' ? owned.currentWinStreak : null,
    maxWinStreak: typeof owned?.maxWinStreak === 'number' ? owned.maxWinStreak : null,
    buffies: owned?.buffies
      ? {
          gadget: Boolean(owned.buffies.gadget),
          starPower: Boolean(owned.buffies.starPower),
          hyperCharge: Boolean(owned.buffies.hyperCharge),
        }
      : null,
    gadgets,
    starPowers,
    hyperCharges,
    gears,
    cost,
    games: stats?.games ?? 0,
    winRate: stats?.winRate ?? null,
  };
}

export function buildCollection(
  profile: ApiPlayer | null,
  catalog: readonly CatalogBrawler[] | null,
  statsByBrawler: Map<number, WinLoss>,
): CollectionResponse {
  const ownedById = new Map((profile?.brawlers ?? []).map((brawler) => [brawler.id, brawler]));
  const catalogById = new Map((catalog ?? []).map((brawler) => [brawler.id, brawler]));
  const ids = new Set<number>([...catalogById.keys(), ...ownedById.keys()]);
  const brawlers = [...ids].map((id) => buildCard(catalogById.get(id), ownedById.get(id), statsByBrawler.get(id)));

  const owned = brawlers.filter((b) => b.owned);
  const count = (list: AccessoryDto[]) => list.filter((item) => item.owned).length;
  const sumOwned = (pick: (b: BrawlerCardDto) => AccessoryDto[]) => brawlers.reduce((t, b) => t + count(pick(b)), 0);
  const sumAll = (pick: (b: BrawlerCardDto) => AccessoryDto[]) => brawlers.reduce((t, b) => t + pick(b).length, 0);
  const hasCatalog = Boolean(catalog?.length);
  const catalogHasHypercharges = (catalog ?? []).some((b) => b.hyperCharges.length > 0);

  brawlers.sort(
    (a, b) =>
      Number(b.owned) - Number(a.owned) || (b.trophies ?? 0) - (a.trophies ?? 0) || a.name.localeCompare(b.name),
  );

  return {
    catalogSource: hasCatalog ? 'api' : 'profile',
    totals: {
      owned: owned.length,
      total: hasCatalog ? brawlers.length : null,
      power11: owned.filter((b) => (b.power ?? 0) >= MAX_POWER_LEVEL).length,
      maxed: owned.filter((b) => b.cost?.maxed).length,
      gadgets: { owned: sumOwned((b) => b.gadgets), total: hasCatalog ? sumAll((b) => b.gadgets) : null },
      starPowers: { owned: sumOwned((b) => b.starPowers), total: hasCatalog ? sumAll((b) => b.starPowers) : null },
      hyperCharges: {
        owned: sumOwned((b) => b.hyperCharges),
        total: catalogHasHypercharges ? sumAll((b) => b.hyperCharges) : null,
      },
      gears: owned.reduce((t, b) => t + b.gears.length, 0),
      buffies: (() => {
        const withBuffies = owned.filter((b) => b.buffies);
        const count = withBuffies.reduce(
          (t, b) => t + Number(b.buffies!.gadget) + Number(b.buffies!.starPower) + Number(b.buffies!.hyperCharge),
          0,
        );
        return { owned: count, total: withBuffies.length ? withBuffies.length * 3 : null };
      })(),
      coinsToMax: owned.reduce((t, b) => t + (b.cost?.coins ?? 0), 0),
      powerPointsToMax: owned.reduce((t, b) => t + (b.cost?.powerPoints ?? 0), 0),
    },
    brawlers,
    priorities: [],
  };
}

/** Prochaine étape d'amélioration d'un brawler et son coût. */
function nextStep(card: BrawlerCardDto): { step: string; coins: number; powerPoints: number } | null {
  if (!card.owned || card.power === null) return null;
  if (card.power < MAX_POWER_LEVEL) {
    const cost = LEVEL_UP_COSTS[card.power];
    const unlock = card.power + 1 === 7 ? ' (débloque les gadgets)' : card.power + 1 === 9 ? ' (débloque les star powers)' : card.power + 1 === MAX_POWER_LEVEL ? ' (débloque l’hypercharge)' : '';
    return { step: `Niveau ${card.power} → ${card.power + 1}${unlock}`, coins: cost?.coins ?? 0, powerPoints: cost?.powerPoints ?? 0 };
  }
  const gadget = card.gadgets.find((g) => !g.owned);
  if (gadget) return { step: `Gadget · ${gadget.name}`, coins: GADGET_COST, powerPoints: 0 };
  const starPower = card.starPowers.find((s) => !s.owned);
  if (starPower) return { step: `Star power · ${starPower.name}`, coins: STAR_POWER_COST, powerPoints: 0 };
  const hyper = card.hyperCharges.find((h) => !h.owned);
  if (hyper) return { step: `Hypercharge · ${hyper.name}`, coins: HYPERCHARGE_COST, powerPoints: 0 };
  return null;
}

/**
 * Quoi améliorer en premier : on privilégie les brawlers joués récemment (le Ranked
 * compte davantage) et efficaces (winrate lissé). Chaque ligne donne la prochaine
 * étape concrète et son prix.
 */
export function upgradePriorities(
  cards: readonly BrawlerCardDto[],
  recent: ReadonlyMap<number, { games: number; ranked: number; wins: number; losses: number }>,
  limit = 8,
): UpgradePriorityDto[] {
  return cards
    .map((card) => {
      const usage = recent.get(card.id);
      const step = nextStep(card);
      if (!usage || !step || usage.games === 0) return null;
      const effectiveness = shrunkWinRate(usage, 0.5, 6);
      const missingBuffies = card.buffies
        ? 3 - Number(card.buffies.gadget) - Number(card.buffies.starPower) - Number(card.buffies.hyperCharge)
        : 0;
      return {
        score: (usage.games + usage.ranked * 0.5) * (0.5 + effectiveness),
        row: {
          brawlerId: card.id,
          name: card.name,
          power: card.power ?? 0,
          games: usage.games,
          rankedGames: usage.ranked,
          winRate: winRate(usage.wins, usage.losses),
          step: step.step,
          stepCoins: step.coins,
          stepPowerPoints: step.powerPoints,
          remainingCoins: card.cost?.coins ?? 0,
          missingBuffies,
        } satisfies UpgradePriorityDto,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.row);
}

/** Détail du coût restant pour un brawler (niveaux, gadgets, star powers, hypercharge). */
export function costLines(card: BrawlerCardDto): CostLineDto[] {
  if (!card.owned || card.power === null) return [];
  const lines: CostLineDto[] = [];
  for (let level = card.power; level < MAX_POWER_LEVEL; level++) {
    const step = LEVEL_UP_COSTS[level];
    if (step) lines.push({ label: `Niveau ${level} → ${level + 1}`, coins: step.coins, powerPoints: step.powerPoints });
  }
  for (const gadget of card.gadgets.filter((g) => !g.owned)) {
    lines.push({ label: `Gadget · ${gadget.name}`, coins: GADGET_COST, powerPoints: 0 });
  }
  for (const starPower of card.starPowers.filter((s) => !s.owned)) {
    lines.push({ label: `Star power · ${starPower.name}`, coins: STAR_POWER_COST, powerPoints: 0 });
  }
  for (const hyper of card.hyperCharges.filter((h) => !h.owned)) {
    lines.push({ label: `Hypercharge · ${hyper.name}`, coins: HYPERCHARGE_COST, powerPoints: 0 });
  }
  return lines;
}
