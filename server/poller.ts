import type { StatusDto } from '../shared/types';
import { BrawlStarsError, type BrawlStarsClient } from './brawlstars/client';
import type { CatalogService, RotationService } from './catalog';
import type { AppConfig } from './config';
import type { Db } from './db';
import { ingestBattleLog, ingestProfile } from './ingest';
import { errorMessage, log } from './log';
import { listPlayers } from './repo';
import { backupIfDue } from './backup';
import { refreshGoalAchievements } from './stats/goals';

// Collecte en tâche de fond. L'API ne renvoie que les 25 derniers combats :
// on interroge souvent pendant une session de jeu, plus rarement au repos.

const ACTIVE_WINDOW_MS = 20 * 60 * 1000;

export interface PollerDeps {
  db: Db;
  client: BrawlStarsClient;
  catalog: CatalogService;
  rotation: RotationService;
  config: AppConfig;
  backupDir: string;
}

export class Poller {
  private timer: NodeJS.Timeout | null = null;
  private current: Promise<void> | null = null;
  private lastRunAt: string | null = null;
  private nextRunAt: string | null = null;
  private lastError: string | null = null;

  constructor(private readonly deps: PollerDeps) {}

  start(delayMs = 1500): void {
    this.schedule(delayMs);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.nextRunAt = null;
  }

  status(): StatusDto['poller'] {
    return {
      running: this.current !== null,
      lastRunAt: this.lastRunAt,
      nextRunAt: this.nextRunAt,
      lastError: this.lastError,
      activeSeconds: this.deps.config.pollActiveSeconds,
      idleSeconds: this.deps.config.pollIdleSeconds,
    };
  }

  /** Lance une collecte immédiate (ou attend celle déjà en cours). */
  runNow(): Promise<void> {
    if (this.current) return this.current;
    if (this.timer) clearTimeout(this.timer);
    return this.cycle();
  }

  /** Récupère profil + combats d'un joueur et les enregistre. */
  async pollPlayer(tag: string): Promise<number> {
    const { client, db } = this.deps;
    const [profile, battleLog] = await Promise.all([
      client.getPlayer(tag),
      client.getBattleLog(tag).catch((error: unknown) => {
        // Un compte sans combat récent peut renvoyer 404 : ce n'est pas une erreur.
        if (error instanceof BrawlStarsError && error.status === 404) return { items: [] };
        throw error;
      }),
    ]);
    const now = new Date().toISOString();
    const inserted = db.transaction(() => {
      ingestProfile(db, tag, profile, now);
      return ingestBattleLog(db, tag, battleLog.items ?? []).inserted;
    });
    refreshGoalAchievements(db, tag, now);
    if (inserted > 0) log.info(`${profile.name} : ${inserted} nouveau${inserted > 1 ? 'x' : ''} combat${inserted > 1 ? 's' : ''}.`);
    return inserted;
  }

  private cycle(): Promise<void> {
    const { db, catalog, rotation } = this.deps;
    this.current = (async () => {
      let failure: string | null = null;
      for (const player of listPlayers(db)) {
        try {
          await this.pollPlayer(player.tag);
        } catch (error) {
          failure = errorMessage(error);
          db.run('UPDATE players SET last_error = ? WHERE tag = ?', [failure, player.tag]);
          log.error(`Collecte de ${player.name || player.tag}`, error);
        }
      }
      for (const [label, task] of [
        ['Mise à jour du catalogue des brawlers', () => catalog.refreshIfStale()],
        ['Mise à jour de la rotation des événements', () => rotation.refreshIfStale()],
        ['Sauvegarde hebdomadaire', async () => backupIfDue(db, this.deps.backupDir)],
      ] as const) {
        try {
          await task();
        } catch (error) {
          failure ??= errorMessage(error);
          log.error(label, error);
        }
      }
      this.lastError = failure;
    })().finally(() => {
      this.current = null;
      this.lastRunAt = new Date().toISOString();
      this.schedule(this.nextDelayMs());
    });
    return this.current;
  }

  private nextDelayMs(): number {
    const { config, db } = this.deps;
    const latest = listPlayers(db)
      .map((p) => p.last_battle_at)
      .filter((t): t is string => t !== null)
      .sort()
      .at(-1);
    const active = latest !== undefined && Date.now() - Date.parse(latest) < ACTIVE_WINDOW_MS;
    return (active ? config.pollActiveSeconds : config.pollIdleSeconds) * 1000;
  }

  private schedule(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.nextRunAt = new Date(Date.now() + delayMs).toISOString();
    this.timer = setTimeout(() => void this.cycle(), delayMs);
  }
}
