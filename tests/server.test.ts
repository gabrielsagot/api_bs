import { describe, expect, it, vi } from 'vitest';
import { BrawlStarsClient } from '../server/brawlstars/client';
import { AutoKeyProvider, ManualKeyProvider, ipFromErrorMessage, ipFromTemporaryToken } from '../server/brawlstars/keys';
import type { ApiPlayer } from '../server/brawlstars/types';
import { Db, KvStore } from '../server/db';
import { ingestBattleLog, ingestProfile } from '../server/ingest';
import { insertPlayer, latestSnapshot, loadBattles } from '../server/repo';
import { ME, teamBattle } from './fixtures';

function jwt(payload: object): string {
  return `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;
}

function json(body: unknown, init: ResponseInit & { cookies?: string[] } = {}): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const cookie of init.cookies ?? []) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

/** Faux portail développeur + fausse API Brawl Stars. */
function fakeSupercell(options: { ip: string; existingKeys?: object[] }) {
  const calls: string[] = [];
  let keys = [...(options.existingKeys ?? [])] as { id: string; name: string; key: string; cidrRanges: string[] }[];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url.replace('https://developer.brawlstars.com/api', 'portal:'));
    if (url.endsWith('/login')) {
      return json({ temporaryAPIToken: jwt({ limits: [{ tier: 'x' }, { cidrs: [`${options.ip}/32`] }] }) }, { cookies: ['session=abc; Path=/'] });
    }
    expect(new Headers(init?.headers).get('cookie')).toBe('session=abc');
    if (url.endsWith('/apikey/list')) return json({ keys });
    if (url.endsWith('/apikey/create')) {
      const body = JSON.parse(String(init?.body));
      const key = { id: `k${keys.length + 1}`, name: body.name, key: `token-${body.cidrRanges[0]}`, cidrRanges: body.cidrRanges };
      keys.push(key);
      return json({ key });
    }
    if (url.endsWith('/apikey/revoke')) {
      const { id } = JSON.parse(String(init?.body));
      keys = keys.filter((k) => k.id !== id);
      return json({});
    }
    throw new Error(`URL inattendue ${url}`);
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

describe('gestion de la clé API', () => {
  it('extrait l’IP du jeton temporaire et des messages d’erreur', () => {
    expect(ipFromTemporaryToken(jwt({ limits: [{}, { cidrs: ['1.2.3.4/32'] }] }))).toBe('1.2.3.4');
    expect(ipFromTemporaryToken('pas-un-jwt')).toBeNull();
    expect(ipFromErrorMessage('Invalid authorization: API key does not allow access from IP 5.6.7.8')).toBe('5.6.7.8');
  });

  it('crée une clé pour l’IP actuelle et la met en cache', async () => {
    const kv = new KvStore(new Db(':memory:'));
    const portal = fakeSupercell({ ip: '9.9.9.9' });
    const keys = new AutoKeyProvider({ email: 'a@b.c', password: 'x', keyName: 'brawl-dashboard', kv, fetchImpl: portal.fetchImpl });
    expect(await keys.getKey()).toBe('token-9.9.9.9');
    expect(portal.calls).toEqual(['portal:/login', 'portal:/apikey/list', 'portal:/apikey/create']);
    expect(kv.getJson<{ ips: string[] }>('api_key')?.value.ips).toEqual(['9.9.9.9']);
    expect(keys.status().state).toBe('ok');
  });

  it('réutilise une clé existante pour la même IP', async () => {
    const kv = new KvStore(new Db(':memory:'));
    const portal = fakeSupercell({
      ip: '9.9.9.9',
      existingKeys: [{ id: 'k1', name: 'brawl-dashboard', key: 'old-token', cidrRanges: ['9.9.9.9'] }],
    });
    const keys = new AutoKeyProvider({ email: 'a@b.c', password: 'x', keyName: 'brawl-dashboard', kv, fetchImpl: portal.fetchImpl });
    expect(await keys.getKey()).toBe('old-token');
    expect(portal.calls).not.toContain('portal:/apikey/create');
  });

  it('libère une place quand le compte a déjà 10 clés', async () => {
    const kv = new KvStore(new Db(':memory:'));
    const existingKeys = Array.from({ length: 10 }, (_, i) => ({
      id: `k${i}`,
      name: i === 3 ? 'brawl-dashboard' : `perso-${i}`,
      key: `t${i}`,
      cidrRanges: [`10.0.0.${i}`],
    }));
    const portal = fakeSupercell({ ip: '9.9.9.9', existingKeys });
    const keys = new AutoKeyProvider({ email: 'a@b.c', password: 'x', keyName: 'brawl-dashboard', kv, fetchImpl: portal.fetchImpl });
    expect(await keys.getKey()).toBe('token-9.9.9.9');
    expect(portal.calls).toContain('portal:/apikey/revoke');
  });

  it('recrée la clé et rejoue la requête quand l’IP a changé', async () => {
    const kv = new KvStore(new Db(':memory:'));
    kv.setJson('api_key', { key: 'token-1.1.1.1', ip: '1.1.1.1', createdAt: '2026-01-01T00:00:00Z' });
    const portal = fakeSupercell({ ip: '9.9.9.9' });
    const apiCalls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith('https://api.brawlstars.com')) return portal.fetchImpl(input, init);
      const auth = new Headers(init?.headers).get('authorization');
      apiCalls.push(auth ?? '');
      return auth === 'Bearer token-9.9.9.9'
        ? json({ items: [] })
        : json({ reason: 'accessDenied.invalidIp', message: 'API key does not allow access from IP 9.9.9.9' }, { status: 403 });
    }) as typeof fetch;
    const keys = new AutoKeyProvider({ email: 'a@b.c', password: 'x', keyName: 'brawl-dashboard', kv, fetchImpl });
    const client = new BrawlStarsClient('https://api.brawlstars.com/v1', keys, fetchImpl);
    expect(await client.getBrawlers()).toEqual([]);
    expect(apiCalls).toEqual(['Bearer token-1.1.1.1', 'Bearer token-9.9.9.9']);
  });

  it('autorise l’IP réellement vue par l’API quand elle diffère de celle du portail', async () => {
    const kv = new KvStore(new Db(':memory:'));
    const portal = fakeSupercell({ ip: '8.8.8.8' });
    const created: string[][] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/apikey/create')) created.push(JSON.parse(String(init?.body)).cidrRanges);
      if (!url.startsWith('https://api.brawlstars.com')) return portal.fetchImpl(input, init);
      const auth = new Headers(init?.headers).get('authorization');
      return auth === 'Bearer token-9.9.9.9'
        ? json({ items: [] })
        : json({ reason: 'accessDenied.invalidIp', message: 'API key does not allow access from IP 9.9.9.9' }, { status: 403 });
    }) as typeof fetch;
    const keys = new AutoKeyProvider({ email: 'a@b.c', password: 'x', keyName: 'brawl-dashboard', kv, fetchImpl });
    const client = new BrawlStarsClient('https://api.brawlstars.com/v1', keys, fetchImpl);
    expect(await client.getBrawlers()).toEqual([]);
    expect(created).toEqual([['8.8.8.8'], ['9.9.9.9', '8.8.8.8']]);
    expect(portal.calls.filter((c) => c.endsWith('/revoke'))).toHaveLength(1);
  });

  it('signale l’IP à déclarer en mode manuel', async () => {
    const keys = new ManualKeyProvider('abc');
    const fetchImpl = (async () =>
      json({ reason: 'accessDenied.invalidIp', message: 'API key does not allow access from IP 5.6.7.8' }, { status: 403 })) as typeof fetch;
    const client = new BrawlStarsClient('https://api.brawlstars.com/v1', keys, fetchImpl);
    await expect(client.getPlayer('#2PP')).rejects.toThrow();
    expect(keys.status()).toMatchObject({ state: 'error', ip: '5.6.7.8' });
  });
});

describe('enregistrement', () => {
  const profile = (trophies: number): ApiPlayer => ({
    tag: ME,
    name: 'Moi',
    trophies,
    highestTrophies: 900,
    brawlers: [{ id: 16000000, name: 'SHELLY', power: 9, trophies, highestTrophies: 900 }],
  });

  it('n’ajoute un instantané que si le profil change', () => {
    const db = new Db(':memory:');
    insertPlayer(db, ME);
    ingestProfile(db, ME, profile(800), '2026-09-01T10:00:00Z');
    ingestProfile(db, ME, profile(800), '2026-09-01T10:02:00Z');
    ingestProfile(db, ME, profile(808), '2026-09-01T10:04:00Z');
    const count = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM player_snapshots')?.n;
    expect(count).toBe(2);
    expect(latestSnapshot(db, ME)?.trophies).toBe(808);
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM brawler_snapshots')?.n).toBe(2);
  });

  it('dédoublonne les combats déjà vus', () => {
    const db = new Db(':memory:');
    insertPlayer(db, ME);
    const log = [
      teamBattle({ time: '20260901T100500.000Z', result: 'victory' }),
      teamBattle({ time: '20260901T100000.000Z', result: 'defeat' }),
    ];
    expect(ingestBattleLog(db, ME, log).inserted).toBe(2);
    expect(ingestBattleLog(db, ME, [teamBattle({ time: '20260901T101000.000Z', result: 'victory' }), ...log]).inserted).toBe(1);
    expect(loadBattles(db, ME).map((b) => b.outcome)).toEqual(['loss', 'win', 'win']);
    expect(db.get<{ last_battle_at: string }>('SELECT last_battle_at FROM players')?.last_battle_at).toBe(
      '2026-09-01T10:10:00.000Z',
    );
  });
});
