import fs from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { BrawlStarsClient } from './brawlstars/client';
import {
  AutoKeyProvider,
  DemoKeyProvider,
  ManualKeyProvider,
  MissingKeyProvider,
  type KeyProvider,
} from './brawlstars/keys';
import { CatalogService, RotationService } from './catalog';
import { loadConfig } from './config';
import { Db, KvStore } from './db';
import { seedDemo } from './demo';
import { ImageCache } from './images';
import { errorMessage, log } from './log';
import { Poller } from './poller';
import { findPlayer, insertPlayer } from './repo';
import { lanUrls, registerRoutes } from './routes';

const config = loadConfig();
const version = (JSON.parse(fs.readFileSync(path.join(config.rootDir, 'package.json'), 'utf8')) as { version: string })
  .version;

// ── Données ──
const dbFile = path.join(config.dataDir, config.demo ? 'demo.sqlite' : 'brawl.sqlite');
if (config.demo) {
  // Le mode démo repart d'une base neuve à chaque lancement (dates toujours récentes).
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbFile + suffix, { force: true });
}
const db = new Db(dbFile);
const kv = new KvStore(db);

// ── Clé API & client ──
let keys: KeyProvider;
let client: BrawlStarsClient | null = null;
if (config.demo) {
  keys = new DemoKeyProvider();
  seedDemo(db, kv);
} else {
  if (config.devEmail && config.devPassword) {
    keys = new AutoKeyProvider({ email: config.devEmail, password: config.devPassword, keyName: config.keyName, kv });
  } else if (config.apiKey) {
    keys = new ManualKeyProvider(config.apiKey);
  } else {
    keys = new MissingKeyProvider();
  }
  client = new BrawlStarsClient(config.apiBaseUrl, keys);
  for (const tag of config.initialTags) if (!findPlayer(db, tag)) insertPlayer(db, tag);
}

const catalog = new CatalogService(kv, client);
const rotation = new RotationService(kv, client);
const poller = client ? new Poller({ db, client, catalog, rotation, config }) : null;
const images = new ImageCache(path.join(config.dataDir, 'img'));

// ── Serveur HTTP ──
const app = Fastify({ logger: false });
registerRoutes(app, { db, catalog, rotation, config, keys, poller, images, version });

const hasWebBuild = fs.existsSync(path.join(config.webDistDir, 'index.html'));
if (hasWebBuild) {
  await app.register(fastifyStatic, {
    root: config.webDistDir,
    // Fichiers lus à la demande : une recompilation de l'interface est prise en compte sans redémarrer.
    wildcard: true,
    setHeaders(reply, filePath) {
      reply.header(
        'cache-control',
        filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });
}

app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'Route inconnue.' });
  // Un fichier absent (ex. ancien script après une mise à jour) → vrai 404, pas la page HTML.
  if (/\.[a-z0-9]+$/i.test(request.url.split('?')[0])) return reply.code(404).send('Introuvable');
  if (!hasWebBuild) {
    return reply
      .code(503)
      .type('text/plain; charset=utf-8')
      .send('Interface non compilée : lance `npm start` (ou `npm run dev` pour développer).');
  }
  return reply.header('cache-control', 'no-cache').sendFile('index.html');
});

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  log.error(
    code === 'EADDRINUSE'
      ? `Le port ${config.port} est déjà utilisé : l’app tourne peut-être déjà (sinon change PORT dans .env).`
      : 'Impossible de démarrer le serveur',
    code === 'EADDRINUSE' ? undefined : error,
  );
  process.exit(1);
}

const keyLabel: Record<KeyProvider['mode'], string> = {
  auto: 'gestion automatique (developer.brawlstars.com)',
  manual: 'clé manuelle (BS_API_KEY)',
  none: 'NON CONFIGURÉE → remplis le fichier .env',
  demo: 'mode démo (données fictives)',
};
console.log(
  [
    '',
    `  Brawl Dashboard ${version} est prêt.`,
    `  → Sur cet ordinateur : http://localhost:${config.port}`,
    ...lanUrls(config).map((url) => `  → Sur ton téléphone  : ${url}`),
    `  Clé API : ${keyLabel[keys.mode]}`,
    '',
  ].join('\n'),
);

// Sans clé, inutile de lancer la collecte : le dashboard affiche la marche à suivre.
if (keys.mode !== 'none') poller?.start();

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info(`Arrêt (${signal})…`);
  poller?.stop();
  try {
    await app.close();
  } catch (error) {
    log.error('Arrêt du serveur', errorMessage(error));
  }
  db.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
