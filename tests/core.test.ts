import { describe, expect, it } from 'vitest';
import { battleCategory, tierName, titleCase } from '../shared/labels';
import { normalizeTag } from '../shared/tags';
import { currentStreak, frequentAllies, longestWinStreak, shrunkWinRate } from '../server/stats/aggregate';
import { levelCostToMax } from '../server/stats/costs';
import { progressRatePerDay } from '../server/stats/goals';
import { computeOutcome, normalizeBattle, parseBattleTime } from '../server/stats/normalize';
import { groupRankedSets, tierTimeline } from '../server/stats/ranked';
import { dailyDeltas, downsample } from '../server/stats/trophies';
import { ME, apiTime, player, stored, teamBattle } from './fixtures';

describe('tags', () => {
  it('normalise les saisies courantes', () => {
    expect(normalizeTag('#2pp')).toBe('#2PP');
    expect(normalizeTag('  2PP ')).toBe('#2PP');
    expect(normalizeTag('2PO')).toBe('#2P0'); // O tapé à la place de 0
    expect(normalizeTag('#ABC')).toBeNull(); // A, B : lettres impossibles dans un tag
    expect(normalizeTag('')).toBeNull();
  });
});

describe('libellés', () => {
  it('met en forme les noms renvoyés en majuscules', () => {
    expect(titleCase('EL PRIMO')).toBe('El Primo');
    expect(titleCase('8-BIT')).toBe('8-Bit');
    expect(titleCase('MR. P')).toBe('Mr. P');
    expect(titleCase('LARRY & LAWRIE')).toBe('Larry & Lawrie');
  });

  it('distingue le type « ranked » (trophées) du mode Ranked', () => {
    expect(battleCategory('ranked')).toBe('trophies');
    expect(battleCategory('soloRanked')).toBe('ranked');
    expect(battleCategory('teamRanked')).toBe('ranked');
    expect(battleCategory('friendly')).toBe('friendly');
  });

  it('nomme les rangs', () => {
    expect(tierName(1)).toBe('Bronze I');
    expect(tierName(8)).toBe('Or II');
    expect(tierName(22)).toBe('Pro');
    expect(tierName(640)).toBe('640');
  });
});

describe('lecture des combats', () => {
  it('convertit battleTime en ISO', () => {
    expect(parseBattleTime('20240115T123456.000Z')).toBe('2024-01-15T12:34:56.000Z');
  });

  it('identifie son équipe, ses alliés et ses adversaires', () => {
    const battle = normalizeBattle(teamBattle({ time: '20260901T100000.000Z', result: 'victory', star: true }), ME);
    expect(battle.outcome).toBe('win');
    expect(battle.starPlayer).toBe(true);
    expect(battle.brawlerId).toBe(16000000);
    expect(battle.participants.filter((p) => p.side === 'ally')).toHaveLength(2);
    expect(battle.participants.filter((p) => p.side === 'enemy')).toHaveLength(3);
  });

  it('gère le Survivant solo (classement)', () => {
    const players = Array.from({ length: 10 }, (_, i) => player(i === 2 ? ME : `#P${i}`));
    const battle = normalizeBattle(
      {
        battleTime: '20260901T100000.000Z',
        event: { id: 1, mode: 'soloShowdown', map: 'Skull Creek' },
        battle: { mode: 'soloShowdown', type: 'ranked', rank: 3, trophyChange: 6, players },
      },
      ME,
    );
    expect(battle.outcome).toBe('win');
    expect(battle.teamsCount).toBe(10);
    expect(battle.participants.filter((p) => p.side === 'enemy')).toHaveLength(9);
  });

  it('gère les Duels (plusieurs brawlers par joueur)', () => {
    const battle = normalizeBattle(
      {
        battleTime: '20260901T100000.000Z',
        event: { id: 1, mode: 'duels', map: 'Arena' },
        battle: {
          mode: 'duels',
          type: 'ranked',
          result: 'defeat',
          players: [
            { tag: ME, name: 'moi', brawlers: [{ id: 16000005, name: 'SPIKE', trophyChange: -3 }, { id: 16000001, name: 'COLT', trophyChange: -2 }] },
            { tag: '#Q', name: 'lui', brawlers: [{ id: 16000002, name: 'BULL' }] },
          ],
        },
      },
      ME,
    );
    expect(battle.outcome).toBe('loss');
    expect(battle.brawlerId).toBe(16000005);
    expect(battle.trophyChange).toBe(-5);
  });

  it('déduit le résultat du classement sans variation de trophées', () => {
    expect(computeOutcome(undefined, 2, null, 5)).toBe('win');
    expect(computeOutcome(undefined, 4, null, 5)).toBe('loss');
    expect(computeOutcome(undefined, 4, 3, 10)).toBe('win');
  });
});

describe('sets Ranked', () => {
  const base = '2026-09-01T18:00:00Z';

  it('regroupe les manches d’un BO3 et sépare les adversaires différents', () => {
    const battles = [
      stored(teamBattle({ time: apiTime(base, 0), result: 'victory' })),
      stored(teamBattle({ time: apiTime(base, 4), result: 'defeat' })),
      stored(teamBattle({ time: apiTime(base, 8), result: 'victory' })),
      stored(teamBattle({ time: apiTime(base, 13), result: 'defeat', enemies: ['#X1', '#X2', '#X3'] })),
      stored(teamBattle({ time: apiTime(base, 17), result: 'defeat', enemies: ['#X1', '#X2', '#X3'] })),
    ];
    const sets = groupRankedSets(battles, Date.parse(base) + 3 * 60 * 60 * 1000);
    expect(sets).toHaveLength(2);
    expect(sets[1]).toMatchObject({ wins: 2, losses: 1, outcome: 'win' });
    expect(sets[0]).toMatchObject({ wins: 0, losses: 2, outcome: 'loss' });
  });

  it('marque un set inachevé comme en cours, puis partiel', () => {
    const battles = [
      stored(teamBattle({ time: apiTime(base, 0), result: 'victory' })),
      stored(teamBattle({ time: apiTime(base, 20), result: 'victory', enemies: ['#Y1', '#Y2', '#Y3'] })),
      stored(teamBattle({ time: apiTime(base, 24), result: 'victory', enemies: ['#Y1', '#Y2', '#Y3'] })),
    ];
    const soon = groupRankedSets(battles, Date.parse(base) + 5 * 60_000);
    expect(soon.at(-1)?.outcome).toBe('ongoing');
    const later = groupRankedSets(battles, Date.parse(base) + 2 * 60 * 60 * 1000);
    expect(later.at(-1)?.outcome).toBe('partial');
  });

  it('suit le rang (champ trophies en combat classé)', () => {
    const battles = [8, 8, 9, 9, 8].map((tier, i) =>
      stored(teamBattle({ time: apiTime(base, i * 5), result: 'victory', tier, enemies: [`#Z${i}`] })),
    );
    expect(tierTimeline(battles).map((p) => p.tier)).toEqual([8, 9, 8]);
  });
});

describe('agrégations', () => {
  it('calcule les séries', () => {
    expect(currentStreak(['loss', 'win', 'win', null, 'win'])).toEqual({ kind: 'win', count: 3 });
    expect(longestWinStreak(['win', 'win', 'loss', 'win', 'win', 'win', 'draw'])).toBe(3);
  });

  it('lisse les petits échantillons', () => {
    expect(shrunkWinRate({ wins: 2, losses: 0 })).toBeLessThan(shrunkWinRate({ wins: 30, losses: 10 }));
  });

  it('ne compte comme coéquipiers réguliers que les joueurs retrouvés à plusieurs occasions', () => {
    const base = '2026-09-01T18:00:00Z';
    const oneSet = [0, 4, 8].map((m) => stored(teamBattle({ time: apiTime(base, m), result: 'victory' })));
    expect(frequentAllies(oneSet)).toHaveLength(0);
    const later = [120, 124].map((m) => stored(teamBattle({ time: apiTime(base, m), result: 'defeat', enemies: ['#W'] })));
    expect(frequentAllies([...oneSet, ...later]).map((r) => r.key)).toEqual(['#A1', '#A2']);
  });

  it('calcule les variations quotidiennes', () => {
    const days = dailyDeltas(
      [
        { taken_at: '2026-09-01T10:00:00Z', trophies: 100 },
        { taken_at: '2026-09-01T12:00:00Z', trophies: 120 },
        { taken_at: '2026-09-02T12:00:00Z', trophies: 110 },
      ],
      { taken_at: '2026-08-31T12:00:00Z', trophies: 90 },
    );
    expect(days.map((d) => d.delta)).toEqual([30, -10]);
  });

  it('réduit une longue série en gardant les extrémités', () => {
    const points = Array.from({ length: 1000 }, (_, i) => ({ t: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(), v: i }));
    const reduced = downsample(points, 100);
    expect(reduced.length).toBeLessThanOrEqual(101);
    expect(reduced[0]).toEqual(points[0]);
    expect(reduced.at(-1)).toEqual(points.at(-1));
  });
});

describe('coûts et objectifs', () => {
  it('calcule le coût pour maxer un brawler', () => {
    expect(levelCostToMax(1)).toEqual({ coins: 7765, powerPoints: 3740 });
    expect(levelCostToMax(11)).toEqual({ coins: 0, powerPoints: 0 });
  });

  it('estime le rythme de progression', () => {
    const now = Date.UTC(2026, 8, 20, 12);
    const points = Array.from({ length: 10 }, (_, i) => ({
      t: new Date(now - (9 - i) * 24 * 60 * 60 * 1000).toISOString(),
      v: 1000 + i * 50,
    }));
    expect(progressRatePerDay(points, now)).toBeCloseTo(50, 5);
    expect(progressRatePerDay(points.slice(-1), now)).toBeNull();
  });
});

describe('recommandations', () => {
  it('préfère un brawler solide à une victoire isolée', async () => {
    const { recommendForSlot } = await import('../server/stats/recommend');
    const base = Date.UTC(2026, 8, 1, 18);
    const games: ReturnType<typeof stored>[] = [];
    let minute = 0;
    const play = (brawlerId: number, result: 'victory' | 'defeat', map = 'Hard Rock Mine') => {
      const raw = teamBattle({ time: apiTime(new Date(base).toISOString(), (minute += 5)), result, map, type: 'ranked', enemies: [`#E${minute}`] });
      raw.battle.teams![0][0].brawler!.id = brawlerId;
      games.push(stored(raw));
    };
    play(1, 'victory'); // brawler 1 : une seule victoire
    for (let i = 0; i < 8; i++) play(2, i < 6 ? 'victory' : 'defeat'); // brawler 2 : 6–2 sur la map
    for (let i = 0; i < 20; i++) play(2, i < 13 ? 'victory' : 'defeat', 'Crystal Arcade');
    const owned = new Map([1, 2].map((id) => [id, { id, name: `B${id}`, trophies: 500, power: 11 }]));
    const slot = { slotId: 1, eventId: null, mode: 'gemGrab', map: 'Hard Rock Mine', startTime: '', endTime: '' };
    const { recommendations } = recommendForSlot(slot, games, owned);
    expect(recommendations.map((r) => r.brawlerId)).toEqual([2]);
  });
});
