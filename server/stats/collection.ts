import { titleCase } from '../../shared/labels';
import type { AccessoryDto, BrawlerCardDto, CollectionResponse, CostLineDto, WinLoss } from '../../shared/types';
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
      coinsToMax: owned.reduce((t, b) => t + (b.cost?.coins ?? 0), 0),
      powerPointsToMax: owned.reduce((t, b) => t + (b.cost?.powerPoints ?? 0), 0),
    },
    brawlers,
  };
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
