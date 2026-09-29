import { BrawlStarsError, type BrawlStarsClient } from '../brawlstars/client';
import type { Db, KvStore } from '../db';
import { errorMessage, log } from '../log';
import { recordMetaMatches, type MetaParticipant } from './matches';

// Collecte des parties classées de la communauté (onglet Draft).
//
// L'API officielle ne donne que les 25 derniers combats d'un joueur : on part des
// classements (joueurs très actifs), on lit leur journal, on garde les manches de
// Ranked, et on ajoute à la file les joueurs de haut rang croisés dans ces manches
// (« boule de neige »). Une requête toutes les quelques secondes, pas plus.

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const SEED_EVERY_MS = DAY_MS;
const MAX_QUEUE = 40_000;
const KEEP_MATCHES_DAYS = 35;
const MAX_BACKOFF_MS = 120_000;

export interface MetaCrawlerOptions {
  /** Pause entre deux requêtes (ms) ; 0 désactive la collecte. */
  intervalMs: number;
  /** Rang minimal des joueurs ajoutés à la file (13 = Mythique I). */
  minTier: number;
  /** Classements de départ : « global » et/ou codes pays (FR, BE…). */
  seedRankings: string[];
}

export interface MetaCrawlerStatus {
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  lastRunAt: string | null;
  lastError: string | null;
  queue: number;
  due: number;
  matches: number;
  matches24h: number;
}

/** Ajoute (ou rafraîchit) des joueurs de haut rang dans la file d'exploration. */
export function discoverPlayers(db: Db, participants: readonly MetaParticipant[], minTier: number, now = Date.now()): number {
  let added = 0;
  const seen = new Set<string>();
  for (const { tag, tier } of participants) {
    if (seen.has(tag) || tier === null || tier < minTier) continue;
    seen.add(tag);
    // Étalé sur l'heure qui vient, pour ne pas lire tout un lot d'un coup.
    const next = new Date(now + Math.floor(Math.random() * HOUR_MS)).toISOString();
    const result = db.run(
      `INSERT INTO meta_players (tag, tier, source, discovered_at, next_crawl_at) VALUES (?, ?, 'partie', ?, ?)
       ON CONFLICT(tag) DO UPDATE SET tier = excluded.tier`,
      [tag, tier, new Date(now).toISOString(), next],
    );
    added += result.changes > 0 ? 1 : 0;
  }
  return added;
}

/** Délai avant de relire un joueur, selon ce que son journal a apporté. */
export function nextCrawlDelay(newMatches: number, rankedInLog: number): number {
  if (rankedInLog === 0) return 2 * DAY_MS;
  if (newMatches >= 8) return 3 * HOUR_MS;
  if (newMatches >= 1) return 8 * HOUR_MS;
  return DAY_MS;
}

export class MetaCrawler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = true;
  private delayMs: number;
  private lastRunAt: string | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly db: Db,
    private readonly kv: KvStore,
    private readonly client: BrawlStarsClient,
    private readonly options: MetaCrawlerOptions,
  ) {
    this.delayMs = options.intervalMs;
  }

  get enabled(): boolean {
    return this.options.intervalMs > 0;
  }

  start(delayMs = 20_000): void {
    if (!this.enabled) return;
    this.stopped = false;
    this.schedule(delayMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  status(now = Date.now()): MetaCrawlerStatus {
    const iso = new Date(now).toISOString();
    const count = (sql: string, params: (string | number)[] = []) => this.db.get<{ n: number }>(sql, params)?.n ?? 0;
    return {
      enabled: this.enabled,
      running: this.running,
      intervalMs: this.delayMs,
      lastRunAt: this.lastRunAt,
      lastError: this.lastError,
      queue: count('SELECT COUNT(*) AS n FROM meta_players'),
      due: count('SELECT COUNT(*) AS n FROM meta_players WHERE next_crawl_at <= ?', [iso]),
      matches: count('SELECT COUNT(*) AS n FROM meta_matches'),
      matches24h: count('SELECT COUNT(*) AS n FROM meta_matches WHERE battle_time >= ?', [new Date(now - DAY_MS).toISOString()]),
    };
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.step(), delayMs);
  }

  /** Une étape : entretien quotidien si besoin, puis lecture d'un journal. */
  async step(now = Date.now()): Promise<void> {
    this.running = true;
    let wait = this.delayMs;
    try {
      await this.maintain(now);
      const next = this.db.get<{ tag: string }>(
        'SELECT tag FROM meta_players WHERE next_crawl_at <= ? ORDER BY next_crawl_at LIMIT 1',
        [new Date(now).toISOString()],
      );
      if (!next) {
        wait = 60_000; // rien à lire pour l'instant
      } else {
        await this.crawl(next.tag, now);
        // Débit rétabli progressivement après un ralentissement.
        this.delayMs = Math.max(this.options.intervalMs, Math.round(this.delayMs * 0.9));
        wait = this.delayMs;
      }
      this.lastError = null;
    } catch (error) {
      this.lastError = errorMessage(error);
      if (error instanceof BrawlStarsError && error.status === 429) {
        this.delayMs = Math.min(MAX_BACKOFF_MS, this.delayMs * 2);
        wait = this.delayMs;
      } else {
        // Clé en cours de renouvellement, maintenance de l'API… on réessaie plus tard.
        wait = 5 * 60_000;
        log.warn(`Collecte Draft en pause : ${this.lastError}`);
      }
    } finally {
      this.running = false;
      this.lastRunAt = new Date().toISOString();
      this.schedule(wait);
    }
  }

  /** Lit le journal d'un joueur de la file et enregistre ses manches classées. */
  async crawl(tag: string, now = Date.now()): Promise<number> {
    let items;
    try {
      items = (await this.client.getBattleLog(tag)).items ?? [];
    } catch (error) {
      if (error instanceof BrawlStarsError && error.status === 404) {
        this.db.run('DELETE FROM meta_players WHERE tag = ?', [tag]);
        return 0;
      }
      throw error;
    }
    const iso = new Date(now).toISOString();
    return this.db.transaction(() => {
      const { inserted, participants } = recordMetaMatches(this.db, tag, items);
      discoverPlayers(this.db, participants, this.options.minTier, now);
      const ranked = participants.length / 6;
      this.db.run(
        `UPDATE meta_players SET last_crawled_at = ?, next_crawl_at = ?, crawls = crawls + 1,
           matches_found = matches_found + ? WHERE tag = ?`,
        [iso, new Date(now + nextCrawlDelay(inserted, ranked)).toISOString(), inserted, tag],
      );
      return inserted;
    });
  }

  /** Une fois par jour : classements de départ, file plafonnée, vieilles manches supprimées. */
  private async maintain(now: number): Promise<void> {
    const seeded = this.kv.getJson<number>('meta.seededAt');
    if (seeded && now - seeded.value < SEED_EVERY_MS) return;
    const iso = new Date(now).toISOString();
    let seeds = 0;
    for (const ranking of this.options.seedRankings) {
      try {
        const players = await this.client.getRankings(ranking);
        for (const player of players) {
          const result = this.db.run(
            `INSERT OR IGNORE INTO meta_players (tag, tier, source, discovered_at, next_crawl_at) VALUES (?, NULL, ?, ?, ?)`,
            [player.tag.toUpperCase(), `classement ${ranking}`, iso, iso],
          );
          seeds += result.changes;
        }
      } catch (error) {
        log.warn(`Classement ${ranking} indisponible : ${errorMessage(error)}`);
      }
    }
    const total = this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM meta_players')?.n ?? 0;
    if (total > MAX_QUEUE) {
      this.db.run(
        `DELETE FROM meta_players WHERE tag IN (
           SELECT tag FROM meta_players ORDER BY matches_found ASC, discovered_at ASC LIMIT ?)`,
        [total - MAX_QUEUE],
      );
    }
    this.db.run('DELETE FROM meta_matches WHERE battle_time < ?', [new Date(now - KEEP_MATCHES_DAYS * DAY_MS).toISOString()]);
    this.kv.setJson('meta.seededAt', now);
    if (seeds) log.info(`Collecte Draft : ${seeds} joueur${seeds > 1 ? 's' : ''} ajouté${seeds > 1 ? 's' : ''} depuis les classements.`);
  }
}
