import { describe, expect, it } from 'vitest';
import type { ApiBattle } from '../server/brawlstars/types';
import { Db, KvStore } from '../server/db';
import { MetaCrawler, discoverPlayers, nextCrawlDelay } from '../server/meta/crawler';
import { loadMetaMatches, recordMetaMatches, toMetaMatch, type StoredMetaMatch } from '../server/meta/matches';
import { buildDraftModel, counter, mapWinRate, scoreBans, scorePicks, synergy } from '../server/stats/draft';
import { ME, apiTime, teamBattle } from './fixtures';

const base = '2026-09-20T18:00:00Z';
const NOW = Date.parse('2026-09-21T12:00:00Z');

/** Même manche vue depuis le journal d'un adversaire (équipes et résultat inversés). */
function mirrored(raw: ApiBattle): ApiBattle {
  const [mine, theirs] = raw.battle.teams!;
  return {
    ...raw,
    battle: { ...raw.battle, result: raw.battle.result === 'victory' ? 'defeat' : 'victory', teams: [theirs, mine] },
  };
}

describe('manches classées de la communauté', () => {
  it('normalise une manche et la dédoublonne quel que soit le journal lu', () => {
    const raw = teamBattle({ time: apiTime(base), result: 'victory', tier: 15 });
    const mine = toMetaMatch(ME, raw)!;
    const theirs = toMetaMatch('#E1', mirrored(raw))!;
    expect(mine.match.key).toBe(theirs.match.key);
    expect(mine.match.teamA).toEqual(theirs.match.teamA);
    expect(mine.match.winner).toBe(theirs.match.winner);
    expect(mine.match.minTier).toBe(15);

    const db = new Db(':memory:');
    expect(recordMetaMatches(db, ME, [raw]).inserted).toBe(1);
    expect(recordMetaMatches(db, '#E1', [mirrored(raw)]).inserted).toBe(0);
    const [stored] = loadMetaMatches(db, 'gemGrab', '2026-01-01');
    const winners = stored.winner === 0 ? stored.teamA : stored.teamB;
    expect(winners).toContain(16000000); // mon équipe a gagné
  });

  it('ignore les parties qui ne sont pas du Ranked à 3 contre 3', () => {
    expect(toMetaMatch(ME, teamBattle({ time: apiTime(base), result: 'victory', type: 'ranked' }))).toBeNull();
    expect(toMetaMatch(ME, teamBattle({ time: apiTime(base), result: 'victory', type: 'friendly' }))).toBeNull();
  });
});

describe('collecte', () => {
  it('ajoute les joueurs de haut rang croisés et espace les relectures', () => {
    const db = new Db(':memory:');
    const added = discoverPlayers(
      db,
      [
        { tag: '#HIGH', tier: 16 },
        { tag: '#LOW', tier: 9 },
        { tag: '#HIGH', tier: 16 },
      ],
      13,
      NOW,
    );
    expect(added).toBe(1);
    expect(nextCrawlDelay(10, 12)).toBeLessThan(nextCrawlDelay(0, 12));
    expect(nextCrawlDelay(0, 0)).toBeGreaterThan(nextCrawlDelay(0, 5));
  });

  it('lit un journal, enregistre ses manches et programme la relecture', async () => {
    const db = new Db(':memory:');
    const kv = new KvStore(db);
    kv.setJson('meta.seededAt', NOW); // pas de classements dans ce test
    const battles = [0, 5, 10].map((m) => teamBattle({ time: apiTime(base, m), result: 'victory', tier: 16, enemies: [`#X${m}`, `#Y${m}`, `#Z${m}`] }));
    const client = { getBattleLog: async () => ({ items: battles }), getRankings: async () => [] };
    const crawler = new MetaCrawler(db, kv, client as never, { intervalMs: 1000, minTier: 13, seedRankings: [] });
    discoverPlayers(db, [{ tag: ME, tier: 16 }], 13, NOW - 3_600_000);
    db.run('UPDATE meta_players SET next_crawl_at = ?', [new Date(NOW - 1000).toISOString()]);
    await crawler.step(NOW);
    const status = crawler.status(NOW);
    expect(status.matches).toBe(3);
    expect(status.queue).toBeGreaterThan(1); // adversaires et coéquipiers découverts
    const me = db.get<{ next_crawl_at: string; crawls: number }>('SELECT next_crawl_at, crawls FROM meta_players WHERE tag = ?', [ME])!;
    expect(me.crawls).toBe(1);
    expect(Date.parse(me.next_crawl_at)).toBeGreaterThan(NOW);
    crawler.stop();
  });
});

/** Génère des manches où A (id 1) est fort sur la map, B (2) et C (3) s'entendent, D (4) contre E (5). */
function plantedMatches(): StoredMetaMatch[] {
  const matches: StoredMetaMatch[] = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  for (let n = 0; n < 6000; n++) {
    const shuffled = [...pool].sort(() => rand() - 0.5);
    const teamA = shuffled.slice(0, 3);
    const teamB = shuffled.slice(3, 6);
    const power = (team: number[], enemies: number[]) =>
      (team.includes(1) ? 0.8 : 0) + (team.includes(2) && team.includes(3) ? 0.9 : 0) + (team.includes(4) && enemies.includes(5) ? 0.9 : 0);
    const edge = power(teamA, teamB) - power(teamB, teamA);
    matches.push({
      battleTime: new Date(NOW - rand() * 10 * 86_400_000).toISOString(),
      mode: 'gemGrab',
      map: 'Hard Rock Mine',
      eventId: null,
      teamA,
      teamB,
      winner: rand() < 1 / (1 + Math.exp(-edge)) ? 0 : 1,
      minTier: 15,
    });
  }
  return matches;
}

describe('moteur du Draft', () => {
  const model = buildDraftModel('gemGrab', plantedMatches(), NOW);
  const candidates = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  it('retrouve la force sur la map, les duos et les contres', () => {
    expect(mapWinRate(model, 'Hard Rock Mine', 1)).toBeGreaterThan(0.6);
    expect(synergy(model, 2, 3)).toBeGreaterThan(0.3);
    expect(counter(model, 4, 5)).toBeGreaterThan(0.3);
    expect(Math.abs(counter(model, 6, 7))).toBeLessThan(0.2);
  });

  it('recommande le brawler fort, puis adapte aux alliés et aux ennemis', () => {
    const empty = scorePicks(model, { map: 'Hard Rock Mine', bans: [], allies: [], enemies: [], enemyPicksAfter: 0, candidates });
    expect(empty[0].brawlerId).toBe(1);
    // Avec B comme allié et A banni, C devient le meilleur choix (synergie).
    const withAlly = scorePicks(model, { map: 'Hard Rock Mine', bans: [1], allies: [2], enemies: [], enemyPicksAfter: 0, candidates });
    expect(withAlly[0].brawlerId).toBe(3);
    expect(withAlly[0].reasons.some((r) => r.kind === 'synergy' && r.brawlerId === 2)).toBe(true);
    // Face à E, D ressort grâce au contre.
    const vsE = scorePicks(model, { map: 'Hard Rock Mine', bans: [1], allies: [], enemies: [5], enemyPicksAfter: 0, candidates });
    expect(vsE[0].brawlerId).toBe(4);
    // Bannis et déjà choisis ne sont jamais proposés.
    expect(withAlly.some((p) => p.brawlerId === 1 || p.brawlerId === 2)).toBe(false);
  });

  it('pénalise un pick facile à contrer quand l’adversaire choisit après', () => {
    const state = { map: 'Hard Rock Mine', bans: [1], allies: [], enemies: [], candidates };
    const estimate = (after: number, id: number) =>
      scorePicks(model, { ...state, enemyPicksAfter: after }).find((p) => p.brawlerId === id)!;
    // E (5) est contré par D (4) : il perd plus à être choisi tôt qu'un brawler neutre.
    const lossE = estimate(0, 5).estimate - estimate(3, 5).estimate;
    const lossNeutral = estimate(0, 7).estimate - estimate(3, 7).estimate;
    expect(lossE).toBeGreaterThan(lossNeutral + 0.02);
    expect(estimate(3, 5).reasons.some((r) => r.kind === 'risk' && r.brawlerId === 4)).toBe(true);
  });

  it('propose en ban le brawler le plus fort sur la map', () => {
    expect(scoreBans(model, 'Hard Rock Mine')[0].brawlerId).toBe(1);
    expect(scoreBans(model, 'Hard Rock Mine', [1]).some((b) => b.brawlerId === 1)).toBe(false);
  });
});

describe('sauvegardes et Draft', () => {
  it('n’inclut pas les parties de la communauté dans les sauvegardes', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { createBackup } = await import('../server/backup');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brawl-draft-'));
    const db = new Db(path.join(dir, 'brawl.sqlite'));
    recordMetaMatches(db, ME, [teamBattle({ time: apiTime(base), result: 'victory', tier: 15 })]);
    const backup = createBackup(db, path.join(dir, 'backups'));
    const copy = new Db(path.join(dir, 'backups', backup.name));
    expect(copy.get<{ n: number }>('SELECT COUNT(*) AS n FROM meta_matches')?.n).toBe(0);
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM meta_matches')?.n).toBe(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
