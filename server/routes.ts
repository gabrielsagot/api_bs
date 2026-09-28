import os from 'node:os';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import QRCode from 'qrcode';
import type { BattleCategory } from '../shared/labels';
import { normalizeTag } from '../shared/tags';
import type { BattleFilters, CreateGoalInput, GoalKind, RankedQueue, StatusDto } from '../shared/types';
import { BrawlStarsError } from './brawlstars/client';
import { KeyUnavailableError, type KeyProvider } from './brawlstars/keys';
import type { AppConfig } from './config';
import { ImageCache } from './images';
import { errorMessage } from './log';
import type { Poller } from './poller';
import {
  countBattles,
  deletePlayer,
  findPlayer,
  insertPlayer,
  listPlayers,
  setPrimaryPlayer,
  toListItem,
  type PlayerRow,
} from './repo';
import { GOAL_KINDS, createGoal, listGoals } from './stats/goals';
import { parsePeriod } from './stats/time';
import {
  battleListView,
  battleStatsView,
  brawlerDetailView,
  collectionView,
  compareView,
  overviewView,
  rankedView,
  rotationView,
  trophiesView,
  type ViewDeps,
} from './views';

export interface RouteDeps extends ViewDeps {
  config: AppConfig;
  keys: KeyProvider;
  poller: Poller | null;
  images: ImageCache;
  version: string;
}

type Params = { tag?: string; id?: string; kind?: string; file?: string };
type Query = Record<string, string | undefined>;
type Req = FastifyRequest<{ Params: Params; Querystring: Query; Body: unknown }>;

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

const CATEGORIES: BattleCategory[] = ['ranked', 'trophies', 'friendly', 'other'];

function parseFilters(query: Query): BattleFilters {
  const brawlerId = Number.parseInt(query.brawler ?? '', 10);
  return {
    period: parsePeriod(query.period, '30d'),
    category: CATEGORIES.includes(query.category as BattleCategory) ? (query.category as BattleCategory) : 'all',
    mode: query.mode || null,
    map: query.map || null,
    brawlerId: Number.isFinite(brawlerId) ? brawlerId : null,
  };
}

/** Rang d'une IP : les réseaux domestiques (box Wi-Fi) d'abord, les VPN et interfaces virtuelles ensuite. */
function lanPriority(ip: string): number {
  if (ip.startsWith('192.168.')) return 0;
  if (ip.startsWith('10.')) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
  return 3;
}

export function lanUrls(config: AppConfig): string[] {
  if (['127.0.0.1', 'localhost', '::1'].includes(config.host)) return [];
  const ips: string[] = [];
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) ips.push(address.address);
    }
  }
  return ips.sort((a, b) => lanPriority(a) - lanPriority(b)).map((ip) => `http://${ip}:${config.port}`);
}

export function registerRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { db, config, keys, poller, images } = deps;

  // Protection CSRF : les requêtes qui modifient des données doivent porter cet en-tête,
  // ce qu'un site tiers ne peut pas faire sans accord CORS.
  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'GET' || request.method === 'HEAD' || !request.url.startsWith('/api/')) return;
    if (request.headers['x-requested-with'] !== 'brawl-dashboard') {
      return reply.code(403).send({ error: 'Requête refusée.' });
    }
  });

  app.setErrorHandler((error: Error & { statusCode?: number }, _request, reply) => {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    reply.code(status).send({ error: error.message || 'Erreur interne.' });
  });

  const player = (request: Req): PlayerRow => {
    const tag = normalizeTag(request.params.tag);
    const row = tag ? findPlayer(db, tag) : undefined;
    if (!row) throw new HttpError(404, 'Ce joueur n’est pas suivi.');
    return row;
  };

  // ── Statut & réglages ──

  app.get('/api/status', async (): Promise<StatusDto> => {
    const players = listPlayers(db);
    const snapshots = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM player_snapshots')?.n ?? 0;
    return {
      demo: config.demo,
      version: deps.version,
      key: keys.status(),
      poller: poller?.status() ?? {
        running: false,
        lastRunAt: null,
        nextRunAt: null,
        lastError: null,
        activeSeconds: config.pollActiveSeconds,
        idleSeconds: config.pollIdleSeconds,
      },
      network: { host: config.host, port: config.port, lanUrls: lanUrls(config) },
      data: {
        players: players.length,
        battles: countBattles(db),
        snapshots,
        dbSizeBytes: db.sizeBytes(),
        since: players.map((p) => p.added_at).sort()[0] ?? null,
      },
    };
  });

  app.post('/api/refresh', async () => {
    if (!poller) throw new HttpError(400, 'Mode démo : pas de collecte.');
    await poller.runNow();
    return { ok: true };
  });

  app.post('/api/key/renew', async () => {
    if (!keys.renew) throw new HttpError(400, 'Le renouvellement automatique n’est pas configuré.');
    await keys.renew();
    return keys.status();
  });

  app.get('/api/qr.svg', async (_request, reply: FastifyReply) => {
    const url = lanUrls(config)[0];
    if (!url) throw new HttpError(404, 'Aucune adresse réseau local.');
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#1d1d1f', light: '#ffffff' } });
    return reply.type('image/svg+xml').header('cache-control', 'no-store').send(svg);
  });

  // ── Joueurs suivis ──

  app.get('/api/players', async () => listPlayers(db).map(toListItem));

  app.post('/api/players', async (request: Req, reply) => {
    const tag = normalizeTag((request.body as { tag?: string } | null)?.tag);
    if (!tag) throw new HttpError(400, 'Tag invalide : il ne contient que les caractères 0289PYLQGRJCUV.');
    if (findPlayer(db, tag)) throw new HttpError(409, 'Ce joueur est déjà suivi.');
    if (!poller) throw new HttpError(400, 'Mode démo : impossible d’ajouter un joueur.');
    insertPlayer(db, tag);
    try {
      await poller.pollPlayer(tag);
    } catch (error) {
      deletePlayer(db, tag);
      if (error instanceof BrawlStarsError && error.status === 404) throw new HttpError(404, `Aucun joueur avec le tag ${tag}.`);
      throw new HttpError(error instanceof KeyUnavailableError ? 503 : 502, errorMessage(error));
    }
    reply.code(201);
    return toListItem(findPlayer(db, tag)!);
  });

  app.delete('/api/players/:tag', async (request: Req) => {
    deletePlayer(db, player(request).tag);
    return { ok: true };
  });

  app.post('/api/players/:tag/primary', async (request: Req) => {
    setPrimaryPlayer(db, player(request).tag);
    return { ok: true };
  });

  // ── Pages ──

  app.get('/api/players/:tag/overview', async (request: Req) => overviewView(deps, player(request)));

  app.get('/api/players/:tag/ranked', async (request: Req) => {
    const queue = (['all', 'solo', 'team'] as RankedQueue[]).includes(request.query.queue as RankedQueue)
      ? (request.query.queue as RankedQueue)
      : 'all';
    return rankedView(deps, player(request), parsePeriod(request.query.period, '30d'), queue);
  });

  app.get('/api/players/:tag/trophies', async (request: Req) =>
    trophiesView(deps, player(request), parsePeriod(request.query.period, '30d')),
  );

  app.get('/api/players/:tag/battles/stats', async (request: Req) =>
    battleStatsView(deps, player(request), parseFilters(request.query)),
  );

  app.get('/api/players/:tag/battles', async (request: Req) => {
    const limit = Math.min(200, Math.max(1, Number.parseInt(request.query.limit ?? '50', 10) || 50));
    const offset = Math.max(0, Number.parseInt(request.query.offset ?? '0', 10) || 0);
    return battleListView(deps, player(request), parseFilters(request.query), limit, offset);
  });

  app.get('/api/players/:tag/brawlers', async (request: Req) => collectionView(deps, player(request)));

  app.get('/api/players/:tag/brawlers/:id', async (request: Req) => {
    const detail = brawlerDetailView(deps, player(request), Number(request.params.id));
    if (!detail) throw new HttpError(404, 'Brawler inconnu.');
    return detail;
  });

  app.get('/api/players/:tag/rotation', async (request: Req) => rotationView(deps, player(request)));

  // ── Objectifs ──

  app.get('/api/players/:tag/goals', async (request: Req) => listGoals(db, player(request).tag));

  app.post('/api/players/:tag/goals', async (request: Req, reply) => {
    const row = player(request);
    const body = (request.body ?? {}) as Partial<CreateGoalInput>;
    const target = Number(body.target);
    if (!GOAL_KINDS.includes(body.kind as GoalKind)) throw new HttpError(400, 'Type d’objectif inconnu.');
    if (!Number.isInteger(target) || target <= 0) throw new HttpError(400, 'La cible doit être un entier positif.');
    const brawlerId = body.kind === 'brawler_trophies' ? Number(body.brawlerId) : null;
    if (body.kind === 'brawler_trophies' && !Number.isInteger(brawlerId)) throw new HttpError(400, 'Choisis un brawler.');
    reply.code(201);
    return createGoal(db, row.tag, { kind: body.kind as GoalKind, target, brawlerId });
  });

  app.delete('/api/goals/:id', async (request: Req) => {
    db.run('DELETE FROM goals WHERE id = ?', [Number(request.params.id)]);
    return { ok: true };
  });

  // ── Comparaison ──

  app.get('/api/compare', async (request: Req) => {
    const tags = (request.query.tags ?? '')
      .split(',')
      .map((tag) => normalizeTag(tag))
      .filter((tag): tag is string => tag !== null);
    const rows = tags.map((tag) => findPlayer(db, tag)).filter((row): row is PlayerRow => row !== undefined);
    return compareView(deps, rows.length ? rows : listPlayers(db).slice(0, 4));
  });

  // ── Images (proxy + cache du CDN Brawlify) ──

  app.get('/api/img/:kind/:file', async (request: Req, reply: FastifyReply) => {
    const kind = request.params.kind ?? '';
    const id = (request.params.file ?? '').replace(/\.png$/, '');
    if (!ImageCache.isValid(kind, id)) throw new HttpError(404, 'Image inconnue.');
    const image = await images.get(kind, id);
    if (image.status === 404) {
      return reply.code(404).header('cache-control', 'public, max-age=3600').send({ error: 'Image indisponible.' });
    }
    return reply.type('image/png').header('cache-control', 'public, max-age=604800').send(image.body);
  });
}
