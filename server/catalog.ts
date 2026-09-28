import type { BrawlStarsClient } from './brawlstars/client';
import type { KvStore } from './db';
import { log } from './log';
import { parseBattleTime } from './stats/normalize';

// Catalogue des brawlers (API officielle /brawlers) enrichi, si possible, avec la
// rareté et la classe fournies par Brawlify (site communautaire). L'enrichissement
// est facultatif : sans lui, le dashboard fonctionne, sans les filtres de rareté.

export interface CatalogItem {
  id: number;
  name: string;
}

export interface CatalogBrawler {
  id: number;
  name: string;
  gadgets: CatalogItem[];
  starPowers: CatalogItem[];
  hyperCharges: CatalogItem[];
  rarity: string | null;
  rarityRank: number | null;
  className: string | null;
}

interface CatalogCache {
  brawlers: CatalogBrawler[];
}

const RARITY_ORDER = [
  'Starting Brawler',
  'Common',
  'Rare',
  'Super Rare',
  'Epic',
  'Mythic',
  'Legendary',
  'Ultra Legendary',
  'Chromatic',
];

const DAY_MS = 24 * 60 * 60 * 1000;

function items(list: unknown): CatalogItem[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item): item is { id: number; name: string } => typeof item?.id === 'number')
    .map((item) => ({ id: item.id, name: String(item.name ?? '') }));
}

export class CatalogService {
  constructor(
    private readonly kv: KvStore,
    private readonly client: BrawlStarsClient | null,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get(): { brawlers: CatalogBrawler[]; fetchedAt: string } | null {
    const cached = this.kv.getJson<CatalogCache>('catalog');
    return cached ? { brawlers: cached.value.brawlers, fetchedAt: cached.updatedAt } : null;
  }

  async refreshIfStale(maxAgeMs = DAY_MS): Promise<void> {
    const cached = this.get();
    if (cached && Date.now() - Date.parse(cached.fetchedAt) < maxAgeMs) return;
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.client) return;
    const official = await this.client.getBrawlers();
    const previous = new Map((this.get()?.brawlers ?? []).map((b) => [b.id, b]));
    const extra = await this.fetchBrawlify().catch((error) => {
      log.warn(`Brawlify indisponible (rareté des brawlers non mise à jour) : ${error.message ?? error}`);
      return null;
    });

    const brawlers: CatalogBrawler[] = official.map((brawler) => {
      const info = extra?.get(brawler.id);
      const old = previous.get(brawler.id);
      const rarity = info?.rarity ?? old?.rarity ?? null;
      const rank = rarity ? RARITY_ORDER.indexOf(rarity) : -1;
      return {
        id: brawler.id,
        name: brawler.name,
        gadgets: items(brawler.gadgets),
        starPowers: items(brawler.starPowers),
        hyperCharges: items(brawler.hyperCharges),
        rarity,
        rarityRank: rank >= 0 ? rank : null,
        className: info?.className ?? old?.className ?? null,
      };
    });
    this.kv.setJson('catalog', { brawlers } satisfies CatalogCache);
    log.info(`Catalogue mis à jour : ${brawlers.length} brawlers.`);
  }

  private async fetchBrawlify(): Promise<Map<number, { rarity: string | null; className: string | null }>> {
    // L'API communautaire a changé d'adresse : on essaie la nouvelle puis l'ancienne.
    let response: Response | null = null;
    for (const url of ['https://api.brawlapi.com/v1/brawlers', 'https://api.brawlify.com/v1/brawlers']) {
      response = await this.fetchImpl(url, {
        headers: { accept: 'application/json', 'user-agent': 'brawl-dashboard (usage personnel)' },
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      if (response?.ok && response.headers.get('content-type')?.includes('json')) break;
      response = null;
    }
    if (!response) throw new Error('aucune source disponible');
    const data = (await response.json()) as { list?: unknown[]; items?: unknown[] } | unknown[];
    const list = Array.isArray(data) ? data : (data.list ?? data.items ?? []);
    const result = new Map<number, { rarity: string | null; className: string | null }>();
    for (const entry of list as { id?: number; rarity?: { name?: string }; class?: { name?: string } }[]) {
      if (typeof entry?.id !== 'number') continue;
      // Le champ « class » de cette API n'est plus une classe de brawler exploitable : on l'ignore.
      result.set(entry.id, { rarity: entry.rarity?.name ?? null, className: null });
    }
    return result;
  }
}

// ── Rotation des événements ───────────────────────────────────

export interface RotationSlot {
  slotId: number | null;
  eventId: number | null;
  mode: string;
  map: string | null;
  startTime: string;
  endTime: string;
}

interface RotationCache {
  slots: RotationSlot[];
}

export class RotationService {
  constructor(
    private readonly kv: KvStore,
    private readonly client: BrawlStarsClient | null,
  ) {}

  get(): { slots: RotationSlot[]; fetchedAt: string } | null {
    const cached = this.kv.getJson<RotationCache>('rotation');
    return cached ? { slots: cached.value.slots, fetchedAt: cached.updatedAt } : null;
  }

  async refreshIfStale(maxAgeMs = 10 * 60 * 1000): Promise<void> {
    const cached = this.get();
    const now = Date.now();
    const expired = cached?.slots.some((slot) => Date.parse(slot.endTime) < now) ?? true;
    if (cached && !expired && now - Date.parse(cached.fetchedAt) < maxAgeMs) return;
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.client) return;
    const events = await this.client.getEventRotation();
    const slots: RotationSlot[] = events.map((slot) => ({
      slotId: slot.slotId ?? null,
      eventId: slot.event?.id || null,
      mode: slot.event?.mode ?? 'unknown',
      map: slot.event?.map ?? null,
      startTime: parseBattleTime(slot.startTime),
      endTime: parseBattleTime(slot.endTime),
    }));
    this.kv.setJson('rotation', { slots } satisfies RotationCache);
  }
}
