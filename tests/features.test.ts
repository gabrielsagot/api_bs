import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BrawlerCardDto } from '../shared/types';
import { backupIfDue, createBackup, listBackups, toCsv } from '../server/backup';
import { Db } from '../server/db';
import { upgradePriorities } from '../server/stats/collection';
import { duoStats } from '../server/stats/duo';
import { attachEloChanges, defaultTierThreshold, nextTierInfo, tierThresholds } from '../server/stats/elo';
import { groupRankedSets } from '../server/stats/ranked';
import { withBattleSamples } from '../server/stats/trophies';
import { playPoints, playTimeline } from '../web/src/lib/playtime';
import { fameLabel } from '../shared/labels';
import { NAME_STYLES, guessNameStyle } from '../shared/nameStyles';
import { contrastRatio, modeIconId, nameStyleCss, tierIconId } from '../web/src/lib/bs';
import { apiTime, stored, teamBattle } from './fixtures';

const base = '2026-09-01T18:00:00Z';
const at = (minutes: number) => new Date(Date.parse(base) + minutes * 60_000).toISOString();

function twoSets() {
  const battles = [
    stored(teamBattle({ time: apiTime(base, 0), result: 'victory' })),
    stored(teamBattle({ time: apiTime(base, 4), result: 'victory' })),
    stored(teamBattle({ time: apiTime(base, 20), result: 'defeat', enemies: ['#X1'] })),
    stored(teamBattle({ time: apiTime(base, 24), result: 'defeat', enemies: ['#X1'] })),
  ];
  return groupRankedSets(battles, Date.parse(base) + 3 * 3_600_000);
}

describe('points par set', () => {
  it('chiffre chaque set quand un relevé l’encadre', () => {
    const sets = twoSets();
    attachEloChanges(sets, [
      { t: at(-5), elo: 5500 },
      { t: at(10), elo: 5524 },
      { t: at(30), elo: 5505 },
    ]);
    expect(sets.map((s) => s.eloChange)).toEqual([-19, 24]);
  });

  it('ne chiffre pas un set sans relevé entre lui et le suivant', () => {
    const sets = twoSets();
    attachEloChanges(sets, [
      { t: at(-5), elo: 5500 },
      { t: at(30), elo: 5505 },
    ]);
    expect(sets.map((s) => s.eloChange)).toEqual([null, null]);
  });

  it('ne chiffre pas le premier set sans relevé avant lui', () => {
    const sets = twoSets();
    attachEloChanges(sets, [
      { t: at(10), elo: 5524 },
      { t: at(30), elo: 5505 },
    ]);
    expect(sets.map((s) => s.eloChange)).toEqual([-19, null]);
  });
});

describe('rang suivant', () => {
  it('suit les seuils observés dans les vraies données', () => {
    expect(defaultTierThreshold(15)).toBe(5500); // Mythique III
    expect(defaultTierThreshold(17)).toBe(6500); // Légendaire II
    expect(defaultTierThreshold(3)).toBeNull();
  });

  it('corrige un seuil avec les observations', () => {
    expect(tierThresholds([{ elo: 5450, tier: 15 }]).get(15)).toBe(5450);
  });

  it('calcule les points restants et le nombre de sets', () => {
    const info = nextTierInfo(5507, 15, tierThresholds([]), [20, -10, 30]);
    expect(info).toMatchObject({ nextTier: 16, nextTierElo: 6000, pointsToNext: 493, setsToNext: 37 });
    expect(nextTierInfo(5507, 15, tierThresholds([]), [-5]).setsToNext).toBeNull();
  });
});

describe('duo', () => {
  it('compare avec et sans un coéquipier régulier', () => {
    const battles = [
      ...[0, 4, 60, 64].map((m, i) => stored(teamBattle({ time: apiTime(base, m), result: i < 3 ? 'victory' : 'defeat', enemies: [`#E${m}`] }))),
    ];
    // Deux parties sans lui.
    const solo = [200, 204].map((m) => {
      const raw = teamBattle({ time: apiTime(base, m), result: 'defeat', enemies: [`#S${m}`] });
      raw.battle.teams![0][1].tag = '#AUTRE1';
      raw.battle.teams![0][2].tag = '#AUTRE2';
      return stored(raw);
    });
    const rows = duoStats([...battles, ...solo], []);
    const mate = rows.find((r) => r.tag === '#A1')!;
    expect(mate).toMatchObject({ games: 4, wins: 3, losses: 1, withoutGames: 2, withoutWinRate: 0 });
    expect(mate.pairs[0]).toMatchObject({ games: 4, wins: 3 });
  });
});

describe('priorités d’amélioration', () => {
  const card = (id: number, power: number, extra: Partial<BrawlerCardDto> = {}): BrawlerCardDto => ({
    id,
    name: `B${id}`,
    owned: true,
    rarity: null,
    rarityRank: null,
    className: null,
    power,
    rank: null,
    trophies: 500,
    highestTrophies: 500,
    prestige: null,
    currentWinStreak: null,
    maxWinStreak: null,
    buffies: null,
    gadgets: [],
    starPowers: [],
    hyperCharges: [],
    gears: [],
    cost: { coins: 1000, powerPoints: 0, maxed: false },
    games: 0,
    winRate: null,
    ...extra,
  });

  it('classe par usage et efficacité, avec la prochaine étape', () => {
    const cards = [
      card(1, 9),
      card(2, 11, { gadgets: [{ id: 1, name: 'Truc', owned: false, level: null }] }),
      card(3, 11, { cost: { coins: 0, powerPoints: 0, maxed: true } }),
    ];
    const usage = new Map([
      [1, { games: 5, ranked: 0, wins: 2, losses: 3 }],
      [2, { games: 20, ranked: 10, wins: 14, losses: 6 }],
      [3, { games: 50, ranked: 0, wins: 30, losses: 20 }],
    ]);
    const rows = upgradePriorities(cards, usage);
    expect(rows.map((r) => r.brawlerId)).toEqual([2, 1]);
    expect(rows[0]).toMatchObject({ step: 'Gadget · Truc', stepCoins: 1000 });
    expect(rows[1].step).toContain('Niveau 9 → 10');
  });
});

describe('historique des trophées reconstitué', () => {
  it('remonte les combats antérieurs au premier relevé', () => {
    const { samples, reconstructedUntil } = withBattleSamples(
      [{ taken_at: at(30), trophies: 1000 }],
      [
        { t: at(0), change: 8 },
        { t: at(5), change: -4 },
        { t: at(10), change: 6 },
      ],
    );
    expect(reconstructedUntil).toBe(at(30));
    expect(samples.map((s) => s.trophies)).toEqual([990, 998, 994, 1000, 1000]);
    expect(samples[0].taken_at).toBe(at(-2));
  });

  it('comble un trou entre deux relevés sans toucher aux relevés', () => {
    const { samples, reconstructedUntil } = withBattleSamples(
      [
        { taken_at: at(0), trophies: 500 },
        { taken_at: at(600), trophies: 510 },
      ],
      [
        { t: at(100), change: 7 },
        { t: at(200), change: 3 },
        { t: at(700), change: 9 }, // pas encore mesuré : ignoré
      ],
    );
    expect(reconstructedUntil).toBeNull();
    expect(samples.map((s) => [s.taken_at, s.trophies])).toEqual([
      [at(0), 500],
      [at(100), 507],
      [at(200), 510],
      [at(600), 510],
    ]);
  });
});

describe('sauvegardes et export', () => {
  it('produit un CSV compatible Excel', () => {
    expect(toCsv(['a', 'b'], [[1, 'x;y']])).toBe('﻿a;b\n1;"x;y"\n');
  });

  it('sauvegarde la base et n’en refait pas avant une semaine', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brawl-backup-'));
    const db = new Db(path.join(dir, 'brawl.sqlite'));
    const backups = path.join(dir, 'backups');
    createBackup(db, backups);
    expect(listBackups(backups)).toHaveLength(1);
    backupIfDue(db, backups);
    expect(listBackups(backups)).toHaveLength(1);
    backupIfDue(db, backups, Date.now() + 8 * 24 * 3_600_000);
    expect(listBackups(backups)).toHaveLength(2);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('repères Brawl Stars', () => {
  it('traduit le palier de gloire', () => {
    expect(fameLabel('METEORIC FAME I')).toBe('Gloire météorique I');
    expect(fameLabel('STARR FORCE FAME III')).toBe('Gloire Starr Force III');
    expect(fameLabel('SATURNAL FAME II')).toBe('Gloire saturnienne II');
    expect(fameLabel('NEW THING')).toBe('New Thing');
    expect(fameLabel(null)).toBeNull();
  });

  it('retrouve le dégradé du pseudo à partir de la couleur de l’API', () => {
    expect(guessNameStyle('0xfff05637')?.id).toBe('braise');
    expect(guessNameStyle('0xffffffff')?.id).toBe('blanc');
    expect(guessNameStyle('n/a')).toBeNull();
    expect(nameStyleCss('0xffffffff', null)).toBeNull(); // pseudo blanc : couleur du texte
    expect(nameStyleCss('0xfff05637', null)?.backgroundImage).toContain('linear-gradient');
    // Le choix manuel l'emporte sur la déduction.
    expect(nameStyleCss('0xfff05637', 'blanc')).toBeNull();
    // Chaque teinte reste lisible sur fond blanc.
    for (const style of NAME_STYLES.filter((s) => s.id !== 'blanc')) {
      const css = nameStyleCss(null, style.id)!;
      for (const color of String(css.backgroundImage).match(/#[0-9a-f]{6}/g)!) {
        expect(contrastRatio(color, '#ffffff')).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('associe rangs et modes à leurs icônes', () => {
    expect(tierIconId(1)).toBe(58000000);
    expect(tierIconId(15)).toBe(58000014);
    expect(tierIconId(22)).toBe(58000021);
    expect(tierIconId(null)).toBeNull();
    expect(modeIconId('heist')).toBe(48000002);
    expect(modeIconId('inconnu')).toBeNull();
  });
});

describe('axe du temps de jeu', () => {
  const t = (minutes: number) => Date.parse(base) + minutes * 60_000;

  it('compresse les pauses et garde les sessions à l’échelle', () => {
    // Session de 20 min, nuit de 12 h, session de 10 min.
    const timeline = playTimeline([t(0), t(10), t(20), t(740), t(750)]);
    expect(timeline.pauses).toHaveLength(1);
    expect(timeline.toX(t(10))).toBe(10 * 60_000);
    expect(timeline.toX(t(740))).toBe(24 * 60_000); // 20 min de jeu + 4 min pour la nuit
    expect(timeline.maxX).toBe(34 * 60_000);
    expect(timeline.toTime(timeline.toX(t(745)))).toBe(t(745));
    // La reprise après la nuit est graduée.
    expect(timeline.ticks).toContain(timeline.toX(t(740)));
  });

  it('traite un palier sans changement comme une pause (Ranked pendant la courbe des trophées)', () => {
    // Trophées : +8 puis +6, ensuite 3 h de Ranked (mesures toutes les 2 min, trophées inchangés), puis +10.
    const flat = Array.from({ length: 90 }, (_, i) => ({ t: t(10 + i * 2), v: 114 }));
    const points = [{ t: t(0), v: 100 }, { t: t(5), v: 108 }, ...flat, { t: t(190), v: 124 }];
    const kept = playPoints(points);
    expect(kept.map((p) => p.v)).toEqual([100, 108, 114, 114, 124]);
    const timeline = playTimeline(kept.map((p) => p.t));
    expect(timeline.pauses).toHaveLength(1);
    // Les 3 h de palier ne pèsent plus qu'une petite part de l'axe.
    expect(timeline.pauses[0].x2 - timeline.pauses[0].x1).toBeLessThan(timeline.maxX * 0.2);
  });

  it('ne compresse rien sans pause', () => {
    const timeline = playTimeline([t(0), t(15), t(29)]);
    expect(timeline.pauses).toHaveLength(0);
    expect(timeline.maxX).toBe(29 * 60_000);
  });
});
