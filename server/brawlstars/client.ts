import type { ApiBattleLog, ApiCatalogBrawler, ApiEventSlot, ApiPlayer } from './types';
import type { KeyProvider } from './keys';

export class BrawlStarsError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'BrawlStarsError';
  }

  get isAccessDenied(): boolean {
    return this.status === 403;
  }
}

const FRIENDLY_MESSAGES: Record<number, string> = {
  400: 'Requête refusée par l’API (paramètre invalide).',
  404: 'Introuvable : vérifie le tag.',
  429: 'Trop de requêtes : l’API limite le débit, nouvel essai plus tard.',
  500: 'Erreur interne de l’API Brawl Stars.',
  503: 'API en maintenance (souvent pendant une mise à jour du jeu).',
};

/** Limite le nombre de requêtes simultanées vers l'API. */
class Limiter {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

export class BrawlStarsClient {
  private readonly limiter = new Limiter(4);

  constructor(
    private readonly baseUrl: string,
    private readonly keys: KeyProvider,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async request<T>(path: string, allowRetry = true): Promise<T> {
    const key = await this.keys.getKey();
    const response = await this.limiter.run(() =>
      this.fetchImpl(`${this.baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      }),
    );

    if (response.ok) {
      this.keys.markOk();
      return (await response.json()) as T;
    }

    const body = (await response.json().catch(() => null)) as { reason?: string; message?: string } | null;
    const error = new BrawlStarsError(
      response.status,
      body?.reason ?? null,
      body?.message || FRIENDLY_MESSAGES[response.status] || `Erreur HTTP ${response.status}`,
    );
    if (error.isAccessDenied && allowRetry && (await this.keys.handleAccessDenied(error))) {
      return this.request<T>(path, false);
    }
    throw error;
  }

  getPlayer(tag: string): Promise<ApiPlayer> {
    return this.request<ApiPlayer>(`/players/${encodeURIComponent(tag)}`);
  }

  getBattleLog(tag: string): Promise<ApiBattleLog> {
    return this.request<ApiBattleLog>(`/players/${encodeURIComponent(tag)}/battlelog`);
  }

  async getBrawlers(): Promise<ApiCatalogBrawler[]> {
    const data = await this.request<{ items?: ApiCatalogBrawler[] }>('/brawlers');
    return data.items ?? [];
  }

  async getEventRotation(): Promise<ApiEventSlot[]> {
    const data = await this.request<ApiEventSlot[] | { items?: ApiEventSlot[] }>('/events/rotation');
    return Array.isArray(data) ? data : (data.items ?? []);
  }
}
