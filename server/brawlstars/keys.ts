import type { KeyStatusDto } from '../../shared/types';
import type { KvStore } from '../db';
import { errorMessage, log } from '../log';
import type { BrawlStarsError } from './client';

// Les clés de l'API Brawl Stars sont verrouillées sur une liste d'IP publiques.
// - AutoKeyProvider : se connecte au portail développeur avec l'email/mot de passe
//   du .env et crée (ou retrouve) une clé pour l'IP actuelle. Si l'IP change,
//   l'API répond 403 → on recrée une clé et on rejoue la requête.
// - ManualKeyProvider : clé fournie telle quelle ; sur un 403 on affiche l'IP
//   à déclarer sur le portail.

export interface KeyProvider {
  readonly mode: KeyStatusDto['mode'];
  getKey(): Promise<string>;
  /** Appelé sur un 403. Renvoie true si une nouvelle clé est prête (la requête est rejouée). */
  handleAccessDenied(error: BrawlStarsError): Promise<boolean>;
  markOk(): void;
  status(): KeyStatusDto;
  /** Force la création d'une nouvelle clé (mode auto uniquement). */
  renew?(): Promise<void>;
}

export class KeyUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeyUnavailableError';
  }
}

const now = () => new Date().toISOString();

/** L'API indique l'IP refusée dans son message : « …does not allow access from IP 1.2.3.4 ». */
export function ipFromErrorMessage(message: string | null | undefined): string | null {
  const match = message?.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
  return match ? match[1] : null;
}

/** Le portail renvoie un jeton temporaire dont la charge utile contient l'IP vue par Supercell. */
export function ipFromTemporaryToken(token: unknown): string | null {
  if (typeof token !== 'string') return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      limits?: { cidrs?: unknown }[];
    };
    for (const limit of data.limits ?? []) {
      const cidrs = limit?.cidrs;
      if (Array.isArray(cidrs) && typeof cidrs[0] === 'string') return cidrs[0].split('/')[0];
    }
  } catch {
    // jeton illisible : on se rabattra sur un service d'IP publique
  }
  return null;
}

// ── Mode manuel ───────────────────────────────────────────────

export class ManualKeyProvider implements KeyProvider {
  readonly mode = 'manual' as const;
  private state: KeyStatusDto = { mode: 'manual', state: 'pending', ip: null, message: null, updatedAt: null };

  constructor(private readonly key: string) {}

  async getKey(): Promise<string> {
    return this.key;
  }

  async handleAccessDenied(error: BrawlStarsError): Promise<boolean> {
    const ip = ipFromErrorMessage(error.message);
    this.state = {
      mode: 'manual',
      state: 'error',
      ip,
      message: ip
        ? `Clé refusée pour l’IP ${ip}. Ajoute cette IP à ta clé sur developer.brawlstars.com, ou renseigne BS_DEV_EMAIL / BS_DEV_PASSWORD pour que l’app gère la clé toute seule.`
        : `Clé API refusée : ${error.message}`,
      updatedAt: now(),
    };
    return false;
  }

  markOk(): void {
    if (this.state.state !== 'ok') this.state = { mode: 'manual', state: 'ok', ip: null, message: null, updatedAt: now() };
  }

  status(): KeyStatusDto {
    return this.state;
  }
}

// ── Mode démo (aucun appel à l'API) ───────────────────────────

export class DemoKeyProvider implements KeyProvider {
  readonly mode = 'demo' as const;

  async getKey(): Promise<string> {
    throw new KeyUnavailableError('Mode démo : aucun appel à l’API.');
  }

  async handleAccessDenied(): Promise<boolean> {
    return false;
  }

  markOk(): void {}

  status(): KeyStatusDto {
    return {
      mode: 'demo',
      state: 'ok',
      ip: null,
      message: 'Données fictives générées localement. Lance `npm start` pour suivre ton vrai compte.',
      updatedAt: null,
    };
  }
}

// ── Aucune clé ────────────────────────────────────────────────

export class MissingKeyProvider implements KeyProvider {
  readonly mode = 'none' as const;
  private readonly message =
    'Aucune clé configurée : renseigne BS_DEV_EMAIL et BS_DEV_PASSWORD (ou BS_API_KEY) dans le fichier .env, puis relance l’app.';

  async getKey(): Promise<string> {
    throw new KeyUnavailableError(this.message);
  }

  async handleAccessDenied(): Promise<boolean> {
    return false;
  }

  markOk(): void {}

  status(): KeyStatusDto {
    return { mode: 'none', state: 'missing', ip: null, message: this.message, updatedAt: null };
  }
}

// ── Mode automatique (portail développeur) ────────────────────

const PORTAL_URL = 'https://developer.brawlstars.com/api';
const MAX_KEYS_PER_ACCOUNT = 10;
const RENEW_COOLDOWN_MS = 60_000;

interface PortalKey {
  id: string;
  name?: string;
  description?: string;
  cidrRanges?: string[];
  key?: string;
}

interface CachedKey {
  key: string;
  /** IP autorisées par la clé. */
  ips?: string[];
  /** Ancien format (une seule IP). */
  ip?: string;
  createdAt: string;
}

const MAX_IPS_PER_KEY = 5;

class PortalSession {
  constructor(
    private readonly cookie: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  private async post<T>(path: string, body: unknown = {}): Promise<T> {
    const response = await this.fetchImpl(`${PORTAL_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', cookie: this.cookie },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await response.json().catch(() => null)) as
      | (T & { status?: { message?: string }; description?: string })
      | null;
    if (!response.ok || !data) {
      const detail = data?.description ?? data?.status?.message;
      throw new KeyUnavailableError(
        `Portail développeur : ${path} a échoué (HTTP ${response.status}${detail ? `, ${detail}` : ''}).`,
      );
    }
    return data;
  }

  async listKeys(): Promise<PortalKey[]> {
    const data = await this.post<{ keys?: PortalKey[] }>('/apikey/list');
    return data.keys ?? [];
  }

  async createKey(name: string, description: string, ips: string[]): Promise<string> {
    const input = { name, description, cidrRanges: ips };
    let data: { key?: PortalKey };
    try {
      data = await this.post<{ key?: PortalKey }>('/apikey/create', { ...input, scopes: ['brawlstars'] });
    } catch {
      // Filet de sécurité si le portail n'accepte plus le champ « scopes ».
      data = await this.post<{ key?: PortalKey }>('/apikey/create', input);
    }
    if (!data.key?.key) throw new KeyUnavailableError('Le portail n’a pas renvoyé de clé.');
    return data.key.key;
  }

  async revokeKey(id: string): Promise<void> {
    await this.post('/apikey/revoke', { id });
  }
}

export interface AutoKeyOptions {
  email: string;
  password: string;
  keyName: string;
  kv: KvStore;
  fetchImpl?: typeof fetch;
}

export class AutoKeyProvider implements KeyProvider {
  readonly mode = 'auto' as const;
  private cached: CachedKey | null;
  private state: KeyStatusDto;
  private inFlight: Promise<void> | null = null;
  private lastAttempt = 0;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: AutoKeyOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.cached = options.kv.getJson<CachedKey>('api_key')?.value ?? null;
    this.state = {
      mode: 'auto',
      state: 'pending',
      ip: this.cachedIps().join(', ') || null,
      message: null,
      updatedAt: this.cached?.createdAt ?? null,
    };
  }

  private cachedIps(): string[] {
    return this.cached?.ips ?? (this.cached?.ip ? [this.cached.ip] : []);
  }

  async getKey(): Promise<string> {
    // Anti-spam : avec de mauvais identifiants, on ne retente la connexion qu'une fois par minute.
    if (!this.cached) await this.renew(false);
    if (!this.cached) throw new KeyUnavailableError(this.state.message ?? 'Clé API indisponible.');
    return this.cached.key;
  }

  async handleAccessDenied(error: BrawlStarsError): Promise<boolean> {
    const previous = this.cached?.key;
    // L'API indique l'IP qu'elle voit réellement : c'est celle-là qu'il faut autoriser.
    const deniedIp = ipFromErrorMessage(error.message);
    const newIp = deniedIp !== null && !this.cachedIps().includes(deniedIp);
    log.warn(`Clé API refusée (${error.reason ?? error.status}${deniedIp ? `, IP ${deniedIp}` : ''}) : création d’une nouvelle clé…`);
    await this.renew(newIp, deniedIp);
    return Boolean(this.cached && this.cached.key !== previous);
  }

  markOk(): void {
    if (this.state.state !== 'ok') {
      this.state = { mode: 'auto', state: 'ok', ip: this.cachedIps().join(', ') || null, message: null, updatedAt: now() };
    }
  }

  status(): KeyStatusDto {
    return this.state;
  }

  /**
   * Crée ou retrouve une clé valable pour l'IP actuelle. `force` ignore l'anti-spam ;
   * `requiredIp` est l'IP refusée par l'API (prioritaire sur celle vue par le portail).
   */
  renew(force = true, requiredIp: string | null = null): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (!force && Date.now() - this.lastAttempt < RENEW_COOLDOWN_MS) return Promise.resolve();
    this.lastAttempt = Date.now();
    this.inFlight = this.doRenew(requiredIp).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async login(): Promise<{ session: PortalSession; ip: string | null }> {
    const response = await this.fetchImpl(`${PORTAL_URL}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ email: this.options.email, password: this.options.password }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => null)) as { temporaryAPIToken?: string } | null;
    if (response.status === 401 || response.status === 403) {
      throw new KeyUnavailableError(
        'Identifiants refusés par developer.brawlstars.com : vérifie BS_DEV_EMAIL et BS_DEV_PASSWORD dans le .env.',
      );
    }
    if (!response.ok) {
      throw new KeyUnavailableError(`Connexion au portail développeur impossible (HTTP ${response.status}).`);
    }
    const cookie = response.headers
      .getSetCookie()
      .map((header) => header.split(';')[0])
      .join('; ');
    return { session: new PortalSession(cookie, this.fetchImpl), ip: ipFromTemporaryToken(body?.temporaryAPIToken) };
  }

  private async publicIp(): Promise<string> {
    const response = await this.fetchImpl('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(10_000) });
    const data = (await response.json()) as { ip?: string };
    if (!data.ip) throw new KeyUnavailableError('Impossible de déterminer ton IP publique.');
    return data.ip;
  }

  private async doRenew(requiredIp: string | null): Promise<void> {
    this.state = { ...this.state, state: 'pending', message: 'Création de la clé API…' };
    try {
      const { session, ip: tokenIp } = await this.login();
      const primary = requiredIp ?? tokenIp ?? (await this.publicIp());
      // Si l'API voit une autre IP que le portail (connexion à plusieurs sorties),
      // la nouvelle clé autorise les deux, plus celles déjà connues.
      const ips = [...new Set([primary, tokenIp, ...(requiredIp ? this.cachedIps() : [])])]
        .filter((ip): ip is string => Boolean(ip))
        .slice(0, MAX_IPS_PER_KEY);
      let keys = await session.listKeys();
      const { keyName } = this.options;

      const reusable = keys.find((key) => key.name === keyName && key.key && key.cidrRanges?.includes(primary));
      let key = reusable?.key;
      let keyIps = reusable?.cidrRanges ?? ips;
      if (!key) {
        // L'ancienne clé de l'app ne sert plus : on la retire pour ne pas encombrer le compte.
        const previous = keys.find((candidate) => candidate.name === keyName && candidate.key === this.cached?.key);
        if (previous) {
          await session.revokeKey(previous.id);
          keys = keys.filter((candidate) => candidate !== previous);
        }
        if (keys.length >= MAX_KEYS_PER_ACCOUNT) {
          // On ne supprime que nos propres anciennes clés, jamais celles créées à la main.
          const stale = keys.find((candidate) => candidate.name === keyName);
          if (!stale) {
            throw new KeyUnavailableError(
              'Ton compte développeur a déjà 10 clés : supprimes-en une sur developer.brawlstars.com.',
            );
          }
          await session.revokeKey(stale.id);
        }
        const stamp = new Date().toLocaleString('fr-FR');
        key = await session.createKey(keyName, `Brawl Dashboard (${stamp})`, ips);
        keyIps = ips;
        log.info(`Nouvelle clé API créée pour ${ips.length > 1 ? 'les IP' : 'l’IP'} ${ips.join(', ')}.`);
      } else {
        log.info(`Clé API existante réutilisée pour l’IP ${primary}.`);
      }

      this.cached = { key, ips: keyIps, createdAt: now() };
      this.options.kv.setJson('api_key', this.cached);
      this.state = { mode: 'auto', state: 'ok', ip: keyIps.join(', '), message: null, updatedAt: now() };
    } catch (error) {
      const message = errorMessage(error);
      log.error('Gestion automatique de la clé API', error);
      this.state = { mode: 'auto', state: 'error', ip: this.state.ip, message, updatedAt: now() };
    }
  }
}
