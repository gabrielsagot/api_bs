import type {
  ApiAccessory,
  ApiBattle,
  ApiBattlePlayer,
  ApiPlayer,
} from './brawlstars/types';
import type { CatalogBrawler, RotationSlot } from './catalog';
import type { Db, KvStore } from './db';
import { ingestBattleLog, ingestProfile } from './ingest';
import { log } from './log';
import { insertPlayer } from './repo';
import { MAX_POWER_LEVEL } from './stats/costs';
import { DAY_MS, HOUR_MS } from './stats/time';

// Mode démo : simule ~45 jours de jeu pour 3 joueurs, au format exact de l'API
// officielle, puis fait passer ces données par le vrai code d'enregistrement.

const BRAWLERS: [number, string, string][] = [
  [16000000, 'SHELLY', 'Starting Brawler'], [16000001, 'COLT', 'Rare'], [16000002, 'BULL', 'Rare'],
  [16000003, 'BROCK', 'Rare'], [16000004, 'RICO', 'Super Rare'], [16000005, 'SPIKE', 'Legendary'],
  [16000006, 'BARLEY', 'Rare'], [16000007, 'JESSIE', 'Super Rare'], [16000008, 'NITA', 'Rare'],
  [16000009, 'DYNAMIKE', 'Super Rare'], [16000010, 'EL PRIMO', 'Rare'], [16000011, 'MORTIS', 'Mythic'],
  [16000012, 'CROW', 'Legendary'], [16000013, 'POCO', 'Rare'], [16000014, 'BO', 'Epic'],
  [16000015, 'PIPER', 'Epic'], [16000016, 'PAM', 'Epic'], [16000017, 'TARA', 'Mythic'],
  [16000018, 'DARRYL', 'Super Rare'], [16000019, 'PENNY', 'Super Rare'], [16000020, 'FRANK', 'Epic'],
  [16000021, 'GENE', 'Mythic'], [16000022, 'TICK', 'Super Rare'], [16000023, 'LEON', 'Legendary'],
  [16000024, 'ROSA', 'Rare'], [16000025, 'CARL', 'Super Rare'], [16000026, 'BIBI', 'Epic'],
  [16000027, '8-BIT', 'Super Rare'], [16000028, 'SANDY', 'Legendary'], [16000029, 'BEA', 'Epic'],
  [16000030, 'EMZ', 'Epic'], [16000031, 'MR. P', 'Mythic'], [16000032, 'MAX', 'Mythic'],
  [16000034, 'JACKY', 'Super Rare'], [16000035, 'GALE', 'Epic'], [16000036, 'NANI', 'Epic'],
  [16000037, 'SPROUT', 'Mythic'], [16000038, 'SURGE', 'Legendary'], [16000039, 'COLETTE', 'Epic'],
  [16000040, 'AMBER', 'Legendary'], [16000041, 'LOU', 'Mythic'], [16000042, 'BYRON', 'Mythic'],
  [16000043, 'EDGAR', 'Epic'], [16000044, 'RUFFS', 'Mythic'], [16000045, 'STU', 'Epic'],
  [16000046, 'BELLE', 'Epic'], [16000047, 'SQUEAK', 'Mythic'], [16000048, 'GROM', 'Epic'],
  [16000049, 'BUZZ', 'Mythic'], [16000050, 'GRIFF', 'Epic'], [16000051, 'ASH', 'Epic'],
  [16000052, 'MEG', 'Legendary'], [16000053, 'LOLA', 'Epic'], [16000054, 'FANG', 'Mythic'],
  [16000056, 'EVE', 'Mythic'], [16000057, 'JANET', 'Mythic'], [16000058, 'BONNIE', 'Epic'],
  [16000059, 'OTIS', 'Mythic'], [16000060, 'SAM', 'Epic'], [16000061, 'GUS', 'Super Rare'],
  [16000062, 'BUSTER', 'Mythic'], [16000063, 'CHESTER', 'Legendary'], [16000064, 'GRAY', 'Mythic'],
  [16000065, 'MANDY', 'Epic'], [16000066, 'R-T', 'Mythic'], [16000067, 'WILLOW', 'Mythic'],
  [16000068, 'MAISIE', 'Epic'], [16000069, 'HANK', 'Epic'], [16000070, 'CORDELIUS', 'Legendary'],
  [16000071, 'DOUG', 'Mythic'], [16000072, 'PEARL', 'Epic'], [16000073, 'CHUCK', 'Mythic'],
  [16000074, 'CHARLIE', 'Mythic'], [16000075, 'MICO', 'Mythic'], [16000076, 'KIT', 'Legendary'],
  [16000077, 'LARRY & LAWRIE', 'Epic'], [16000078, 'MELODIE', 'Mythic'], [16000079, 'ANGELO', 'Epic'],
  [16000080, 'DRACO', 'Legendary'], [16000081, 'LILY', 'Mythic'], [16000082, 'BERRY', 'Epic'],
  [16000083, 'CLANCY', 'Mythic'], [16000084, 'MOE', 'Mythic'], [16000085, 'KENJI', 'Legendary'],
];

const RARITY_ORDER = ['Starting Brawler', 'Common', 'Rare', 'Super Rare', 'Epic', 'Mythic', 'Legendary'];

const TROPHY_MAPS: Record<string, string[]> = {
  gemGrab: ['Hard Rock Mine', 'Crystal Arcade', 'Double Swoosh', 'Undermine'],
  brawlBall: ['Center Stage', 'Pinball Dreams', 'Sneaky Fields', 'Super Beach', 'Triple Dribble'],
  heist: ['Safe Zone', 'Hot Potato', 'Kaboom Canyon', 'Bridge Too Far'],
  bounty: ['Shooting Star', 'Hideout', 'Layer Cake', 'Dry Season'],
  hotZone: ['Dueling Beetles', 'Open Business', 'Parallel Plays', 'Ring of Fire'],
  knockout: ["Belle's Rock", 'Goldarm Gulch', 'New Perspective', 'Out in the Open'],
  soloShowdown: ['Skull Creek', 'Cavern Churn', 'Rockwall Brawl', 'Double Trouble'],
  duoShowdown: ['Skull Creek', 'Cavern Churn', 'Rockwall Brawl'],
};

const RANKED_POOL: [string, string][] = [
  ['gemGrab', 'Hard Rock Mine'],
  ['gemGrab', 'Double Swoosh'],
  ['brawlBall', 'Center Stage'],
  ['brawlBall', 'Pinball Dreams'],
  ['heist', 'Safe Zone'],
  ['heist', 'Hot Potato'],
  ['bounty', 'Shooting Star'],
  ['hotZone', 'Dueling Beetles'],
  ['knockout', "Belle's Rock"],
  ['knockout', 'Goldarm Gulch'],
];

const NAMES = [
  'Kiwi', 'Zorro', 'Lumen', 'Nox', 'Pixel', 'Mango', 'Sora', 'Blitz', 'Echo', 'Taz', 'Milo', 'Yuki', 'Rocco',
  'Nova', 'Juno', 'Axel', 'Luna', 'Orion', 'Hugo', 'Maya', 'Kenzo', 'Lila', 'Sacha', 'Noa', 'Iris', 'Enzo',
  'Zoé', 'Raph', 'Tom', 'Lou', 'Gabin', 'Jade', 'Nils', 'Ambre', 'Timéo', 'Rose',
];

const TAG_CHARS = '0289PYLQGRJCUV';

type Rand = () => number;

function mulberry32(seed: number): Rand {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rand: Rand, list: readonly T[]): T => list[Math.floor(rand() * list.length)];
const between = (rand: Rand, min: number, max: number) => Math.floor(min + rand() * (max - min + 1));

function randomTag(rand: Rand): string {
  let tag = '#';
  const length = between(rand, 8, 9);
  for (let i = 0; i < length; i++) tag += pick(rand, TAG_CHARS.split(''));
  return tag;
}

function battleTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}.000Z`;
}

// Identifiants volontairement hors des vraies plages : pas de fausse image.
const fakeItem = (index: number, slot: number, name: string): ApiAccessory => ({ id: 29_900_000 + index * 8 + slot, name });

function catalogFor(index: number, id: number, name: string, rarity: string): CatalogBrawler {
  return {
    id,
    name,
    gadgets: [fakeItem(index, 0, 'GADGET 1'), fakeItem(index, 1, 'GADGET 2')],
    starPowers: [fakeItem(index, 2, 'STAR POWER 1'), fakeItem(index, 3, 'STAR POWER 2')],
    hyperCharges: index % 3 === 2 ? [] : [fakeItem(index, 4, 'HYPERCHARGE')],
    rarity,
    rarityRank: RARITY_ORDER.indexOf(rarity),
    className: null,
  };
}

const GEAR_NAMES = ['SPEED', 'DAMAGE', 'SHIELD', 'HEALTH', 'VISION', 'GADGET CHARGE'];

interface SimBrawler {
  id: number;
  name: string;
  index: number;
  power: number;
  trophies: number;
  highest: number;
  gadgets: ApiAccessory[];
  starPowers: ApiAccessory[];
  gears: ApiAccessory[];
  hyperCharges: ApiAccessory[];
  /** Talent caché : rend les stats de la démo intéressantes (vrais bons et mauvais picks). */
  skill: number;
  streak?: number;
  maxStreak?: number;
}

interface SimPlayer {
  tag: string;
  name: string;
  iconId: number;
  nameColor: string;
  club: { tag: string; name: string };
  brawlers: Map<number, SimBrawler>;
  locked: number[];
  highestTrophies: number;
  expLevel: number;
  expPoints: number;
  victories3v3: number;
  solo: number;
  duo: number;
  tier: number;
  elo: number;
  bestElo: number;
  seasonBestElo: number;
  favorites: number[];
}

function unlockEquipment(sim: SimBrawler, catalog: CatalogBrawler, rand: Rand): void {
  if (sim.power >= 7 && sim.gadgets.length < 2 && rand() < 0.8) {
    const next = catalog.gadgets.find((g) => !sim.gadgets.some((o) => o.id === g.id));
    if (next) sim.gadgets.push(next);
  }
  if (sim.power >= 9 && sim.starPowers.length < 2 && rand() < 0.7) {
    const next = catalog.starPowers.find((s) => !sim.starPowers.some((o) => o.id === s.id));
    if (next) sim.starPowers.push(next);
  }
  if (sim.power >= 8 && sim.gears.length < 2 && rand() < 0.6) {
    const name = pick(rand, GEAR_NAMES.filter((g) => !sim.gears.some((o) => o.name === g)));
    sim.gears.push({ id: 62_000_000 + GEAR_NAMES.indexOf(name), name, level: 3 });
  }
  if (sim.power >= MAX_POWER_LEVEL && catalog.hyperCharges.length && !sim.hyperCharges.length && rand() < 0.5) {
    sim.hyperCharges.push(catalog.hyperCharges[0]);
  }
}

function createPlayer(
  rand: Rand,
  catalog: CatalogBrawler[],
  options: { tag: string; name: string; iconId: number; owned: number; level: [number, number]; trophies: [number, number]; tier: number },
): SimPlayer {
  const order = catalog.map((_, i) => i).sort(() => rand() - 0.5);
  const owned = new Set(order.slice(0, options.owned));
  const brawlers = new Map<number, SimBrawler>();
  catalog.forEach((entry, index) => {
    if (!owned.has(index)) return;
    const power = between(rand, options.level[0], options.level[1]);
    const trophies = between(rand, options.trophies[0], options.trophies[1]);
    const sim: SimBrawler = {
      id: entry.id,
      name: entry.name,
      index,
      power,
      trophies,
      highest: trophies + between(rand, 0, 120),
      gadgets: [],
      starPowers: [],
      gears: [],
      hyperCharges: [],
      skill: (rand() - 0.45) * 0.22,
    };
    for (let i = 0; i < 3; i++) unlockEquipment(sim, entry, rand);
    brawlers.set(entry.id, sim);
  });
  const favorites = [...brawlers.values()]
    .sort((a, b) => b.skill - a.skill)
    .slice(0, 14)
    .map((b) => b.id);
  return {
    tag: options.tag,
    name: options.name,
    iconId: options.iconId,
    // Couleurs de pseudo du jeu, choisies d'après le tag (le blanc est la couleur par défaut).
    nameColor: DEMO_NAME_COLORS[[...options.tag].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % DEMO_NAME_COLORS.length],
    club: { tag: '#2GQ8JPUV', name: 'Les Croissants' },
    brawlers,
    locked: catalog.map((c) => c.id).filter((id) => !brawlers.has(id)),
    highestTrophies: 0,
    expLevel: between(rand, 160, 240),
    expPoints: between(rand, 1_000, 9_000),
    victories3v3: between(rand, 9_000, 16_000),
    solo: between(rand, 600, 1_500),
    duo: between(rand, 900, 2_200),
    tier: options.tier,
    elo: Math.round(500 * (options.tier - 4)),
    bestElo: Math.round(500 * (options.tier - 4)) + 900,
    seasonBestElo: Math.round(500 * (options.tier - 4)) + 250,
    favorites,
  };
}

const DEMO_NAME_COLORS = ['0xfff05637', '0xff1ba5f5', '0xffcb5aff', '0xff4ddba2', '0xffffffff'];
const DEMO_FAME_TIERS = ['SOLAR FAME III', 'METEORIC FAME I', 'MARTIAN FAME II'];

function toApiPlayer(sim: SimPlayer): ApiPlayer {
  const brawlers = [...sim.brawlers.values()];
  const trophies = brawlers.reduce((sum, b) => sum + b.trophies, 0);
  sim.highestTrophies = Math.max(sim.highestTrophies, trophies);
  return {
    tag: sim.tag,
    name: sim.name,
    nameColor: sim.nameColor,
    icon: { id: sim.iconId },
    trophies,
    highestTrophies: sim.highestTrophies,
    expLevel: sim.expLevel,
    expPoints: sim.expPoints,
    '3vs3Victories': sim.victories3v3,
    soloVictories: sim.solo,
    duoVictories: sim.duo,
    // Ranked : ~370 points par rang, comme dans le jeu.
    rankedSeasonId: 49,
    rankedRank: Math.floor(sim.elo / 500) + 4,
    rankedElo: sim.elo,
    highestSeasonRankedRank: Math.floor(sim.seasonBestElo / 500) + 4,
    highestSeasonRankedElo: sim.seasonBestElo,
    highestAllTimeRankedRank: Math.floor(sim.bestElo / 500) + 4,
    highestAllTimeRankedElo: sim.bestElo,
    fame: 30_000 + sim.expLevel * 350,
    fameTierName: DEMO_FAME_TIERS[sim.expLevel % DEMO_FAME_TIERS.length],
    club: sim.club,
    brawlers: brawlers.map((b) => ({
      id: b.id,
      name: b.name,
      power: b.power,
      rank: Math.min(35, 1 + Math.floor(b.trophies / 40)),
      trophies: b.trophies,
      highestTrophies: b.highest,
      ...(b.trophies >= 1000 ? { prestigeLevel: Math.floor(b.trophies / 1000) } : {}),
      currentWinStreak: b.streak ?? 0,
      maxWinStreak: Math.max(b.maxStreak ?? 0, 3 + (b.id % 9)),
      buffies: { gadget: b.power >= 11 && b.id % 3 === 0, starPower: b.power >= 11 && b.id % 5 === 0, hyperCharge: false },
      gears: b.gears,
      starPowers: b.starPowers,
      gadgets: b.gadgets,
      hyperCharges: b.hyperCharges,
    })),
  };
}

function randomOpponent(rand: Rand, brawlerTrophies: number, rankedTier?: number): ApiBattlePlayer {
  const [id, name] = pick(rand, BRAWLERS);
  return {
    tag: randomTag(rand),
    name: pick(rand, NAMES),
    brawler: {
      id,
      name,
      power: rankedTier ? 11 : between(rand, 9, 11),
      trophies: rankedTier ? Math.max(1, rankedTier + between(rand, -1, 1)) : Math.max(0, brawlerTrophies + between(rand, -80, 80)),
    },
  };
}

function selfEntry(sim: SimPlayer, brawler: SimBrawler, trophies: number): ApiBattlePlayer {
  return { tag: sim.tag, name: sim.name, brawler: { id: brawler.id, name: brawler.name, power: brawler.power, trophies } };
}

function pickBrawler(rand: Rand, sim: SimPlayer, strict = false): SimBrawler {
  const pool = rand() < (strict ? 0.85 : 0.6) ? sim.favorites : [...sim.brawlers.keys()];
  return sim.brawlers.get(pick(rand, pool))!;
}

/** Une partie de trophées (3v3 ou Survivant). */
function trophyGame(rand: Rand, sim: SimPlayer, at: number): ApiBattle {
  const mode = pick(rand, Object.keys(TROPHY_MAPS));
  const map = pick(rand, TROPHY_MAPS[mode]);
  const brawler = pickBrawler(rand, sim);
  const before = brawler.trophies;
  const winChance = 0.5 + brawler.skill - (before - 600) / 4000;
  let battle: ApiBattle['battle'];

  if (mode.endsWith('Showdown')) {
    const duo = mode === 'duoShowdown';
    const places = duo ? 5 : 10;
    const rank = rand() < winChance ? between(rand, 1, Math.ceil(places / 2)) : between(rand, Math.ceil(places / 2), places);
    const change = duo ? [9, 7, 0, -4, -6][rank - 1] : [10, 8, 6, 4, 0, -2, -4, -6, -8, -10][rank - 1];
    brawler.trophies = Math.max(0, before + change);
    if (rank === 1) duo ? sim.duo++ : sim.solo++;
    const me = selfEntry(sim, brawler, before);
    battle = duo
      ? {
          mode,
          type: 'ranked',
          rank,
          trophyChange: change,
          teams: Array.from({ length: places }, (_, i) =>
            i === rank - 1 ? [me, randomOpponent(rand, before)] : [randomOpponent(rand, before), randomOpponent(rand, before)],
          ),
        }
      : {
          mode,
          type: 'ranked',
          rank,
          trophyChange: change,
          players: Array.from({ length: places }, (_, i) => (i === rank - 1 ? me : randomOpponent(rand, before))),
        };
  } else {
    const roll = rand();
    const result = roll < winChance ? 'victory' : roll < winChance + 0.04 ? 'draw' : 'defeat';
    const change = result === 'victory' ? between(rand, 6, 9) : result === 'draw' ? 0 : -between(rand, 4, 8);
    brawler.streak = result === 'victory' ? (brawler.streak ?? 0) + 1 : 0;
    brawler.maxStreak = Math.max(brawler.maxStreak ?? 0, brawler.streak);
    brawler.trophies = Math.max(0, before + change);
    if (result === 'victory') sim.victories3v3++;
    const allies = [selfEntry(sim, brawler, before), randomOpponent(rand, before), randomOpponent(rand, before)];
    const enemies = [randomOpponent(rand, before), randomOpponent(rand, before), randomOpponent(rand, before)];
    const star = result === 'draw' ? null : result === 'victory' ? (rand() < 0.4 ? allies[0] : allies[1]) : enemies[0];
    battle = {
      mode,
      type: 'ranked',
      result,
      duration: between(rand, 70, 180),
      trophyChange: change,
      starPlayer: star,
      teams: rand() < 0.5 ? [allies, enemies] : [enemies, allies],
    };
  }
  brawler.highest = Math.max(brawler.highest, brawler.trophies);
  sim.expPoints += between(rand, 8, 30);
  return { battleTime: battleTime(at), event: { id: 15_000_000 + between(rand, 0, 400), mode, map }, battle };
}

/** Un set classé en BO3 : 2 ou 3 manches contre la même équipe. */
function rankedSet(rand: Rand, sim: SimPlayer, start: number, teammates: ApiBattlePlayer[] | null): { battles: ApiBattle[]; end: number } {
  const [mode, map] = pick(rand, RANKED_POOL);
  const brawler = pickBrawler(rand, sim, true);
  const tier = Math.floor(sim.tier);
  const allies = teammates ?? [randomOpponent(rand, 0, tier), randomOpponent(rand, 0, tier)];
  const enemies = [randomOpponent(rand, 0, tier), randomOpponent(rand, 0, tier), randomOpponent(rand, 0, tier)];
  const winChance = 0.53 + brawler.skill * 1.3 - (sim.tier - 11) * 0.03;
  const battles: ApiBattle[] = [];
  let wins = 0;
  let losses = 0;
  let at = start;
  while (wins < 2 && losses < 2) {
    const win = rand() < winChance;
    if (win) wins++;
    else losses++;
    const me = selfEntry(sim, brawler, tier);
    const myTeam = [me, ...allies.map((p) => ({ ...p, brawler: { ...p.brawler!, trophies: tier } }))];
    const star = win ? (rand() < 0.45 ? myTeam[0] : myTeam[1]) : enemies[between(rand, 0, 2)];
    battles.push({
      battleTime: battleTime(at),
      event: { id: 15_000_000 + RANKED_POOL.findIndex(([, m]) => m === map), mode, map },
      battle: {
        mode,
        type: teammates ? 'teamRanked' : 'soloRanked',
        result: win ? 'victory' : 'defeat',
        duration: between(rand, 80, 190),
        starPlayer: star,
        teams: [myTeam, enemies],
      },
    });
    at += between(rand, 150, 260) * 1000;
  }
  sim.elo = Math.max(0, sim.elo + (wins === 2 ? between(rand, 20, 30) : -between(rand, 15, 25)));
  sim.seasonBestElo = Math.max(sim.seasonBestElo, sim.elo);
  sim.bestElo = Math.max(sim.bestElo, sim.elo);
  sim.tier = sim.elo / 500 + 4;
  sim.expPoints += between(rand, 20, 60);
  return { battles, end: at };
}

interface SimOptions {
  sim: SimPlayer;
  rand: Rand;
  catalog: CatalogBrawler[];
  daysBack: number;
  sessionChance: number;
  rankedShare: number;
  friends?: ApiBattlePlayer[];
}

/** Rejoue l'historique jour par jour, comme si le dashboard avait tourné tout ce temps. */
function simulate(db: Db, options: SimOptions, now: number): void {
  const { sim, rand, catalog, daysBack } = options;
  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const start = now - daysBack * DAY_MS;
  ingestProfile(db, sim.tag, toApiPlayer(sim), new Date(start).toISOString());
  const history: ApiBattle[] = [];
  let cursor = start;

  for (let day = daysBack; day >= 0; day--) {
    const dayStart = new Date(now - day * DAY_MS);
    dayStart.setHours(0, 0, 0, 0);
    const sessions = day === 0 ? 1 : rand() < options.sessionChance ? between(rand, 1, 2) : 0;
    for (let s = 0; s < sessions; s++) {
      const hour = day === 0 ? Math.max(0, new Date(now).getHours() - 2) : between(rand, 12, 21) + s;
      let at = dayStart.getTime() + hour * HOUR_MS + between(rand, 0, 50) * 60_000;
      if (at > now - 45 * 60_000) at = now - 100 * 60_000;
      // Deux sessions ne se chevauchent jamais (sinon les sets s'entremêlent).
      at = Math.max(at, cursor + 45 * 60_000);
      const sessionBattles: ApiBattle[] = [];
      const games = between(rand, 6, 16);
      for (let g = 0; g < games && at < now - 40 * 60_000; g++) {
        if (rand() < options.rankedShare) {
          const withFriends = options.friends && rand() < 0.25 ? options.friends : null;
          const set = rankedSet(rand, sim, at, withFriends);
          sessionBattles.push(...set.battles);
          at = set.end + between(rand, 30, 90) * 1000;
          g += set.battles.length - 1;
        } else {
          sessionBattles.push(trophyGame(rand, sim, at));
          at += between(rand, 140, 260) * 1000;
        }
        ingestProfile(db, sim.tag, toApiPlayer(sim), new Date(at).toISOString());
      }
      cursor = Math.max(cursor, at);
      history.push(...sessionBattles);
      ingestBattleLog(db, sim.tag, history.slice(-25).reverse());
    }

    // Progression du compte : améliorations et nouveaux brawlers au fil des jours.
    if (rand() < 0.45) {
      const candidates = [...sim.brawlers.values()].filter((b) => b.power < MAX_POWER_LEVEL);
      if (candidates.length) {
        const brawler = pick(rand, candidates);
        brawler.power++;
        unlockEquipment(brawler, catalogById.get(brawler.id)!, rand);
      }
    }
    if (rand() < 0.08 && sim.locked.length) {
      const id = sim.locked.splice(between(rand, 0, sim.locked.length - 1), 1)[0];
      const entry = catalogById.get(id)!;
      sim.brawlers.set(id, {
        id,
        name: entry.name,
        index: catalog.indexOf(entry),
        power: 1,
        trophies: 0,
        highest: 0,
        gadgets: [],
        starPowers: [],
        gears: [],
        hyperCharges: [],
        skill: (rand() - 0.5) * 0.1,
      });
    }
    if (rand() < 0.3) sim.expLevel++;
  }
  ingestProfile(db, sim.tag, toApiPlayer(sim), new Date(now - 5 * 60_000).toISOString());
  db.run('UPDATE players SET last_polled_at = ? WHERE tag = ?', [new Date(now - 60_000).toISOString(), sim.tag]);
}

export function seedDemo(db: Db, kv: KvStore, now = Date.now()): void {
  const rand = mulberry32(20250928);
  const catalog = BRAWLERS.map(([id, name, rarity], index) => catalogFor(index, id, name, rarity));
  kv.setJson('catalog', { brawlers: catalog });

  const me = createPlayer(rand, catalog, {
    tag: '#9QUG2PY8',
    name: 'Démo',
    iconId: 28_000_000,
    owned: 76,
    level: [6, 11],
    trophies: [380, 930],
    tier: 9.4,
  });
  const leo = createPlayer(rand, catalog, {
    tag: '#2LJ8QGRC',
    name: 'Léo',
    iconId: 28_000_010,
    owned: 70,
    level: [5, 11],
    trophies: [300, 880],
    tier: 11.2,
  });
  const ines = createPlayer(rand, catalog, {
    tag: '#8YVR0CUJ',
    name: 'Inès',
    iconId: 28_000_020,
    owned: 64,
    level: [4, 11],
    trophies: [250, 820],
    tier: 7.6,
  });

  const asMate = (sim: SimPlayer): ApiBattlePlayer => {
    const brawler = sim.brawlers.get(sim.favorites[0])!;
    return { tag: sim.tag, name: sim.name, brawler: { id: brawler.id, name: brawler.name, power: brawler.power, trophies: 0 } };
  };

  const started = Date.now();
  db.transaction(() => {
    for (const sim of [me, leo, ines]) insertPlayer(db, sim.tag, new Date(now - 45 * DAY_MS).toISOString());
    simulate(db, { sim: me, rand, catalog, daysBack: 45, sessionChance: 0.72, rankedShare: 0.4, friends: [asMate(leo), asMate(ines)] }, now);
    simulate(db, { sim: leo, rand, catalog, daysBack: 45, sessionChance: 0.55, rankedShare: 0.45 }, now);
    simulate(db, { sim: ines, rand, catalog, daysBack: 45, sessionChance: 0.5, rankedShare: 0.35 }, now);

    // Objectifs d'exemple (dont un déjà atteint).
    const profile = toApiPlayer(me);
    const favorite = profile.brawlers.find((b) => b.id === me.favorites[0])!;
    const goals: [string, number | null, number, number, number, string | null][] = [
      ['trophies', null, Math.ceil((profile.trophies + 1800) / 500) * 500, profile.trophies - 1400, 30, null],
      ['ranked_tier', null, Math.min(22, Math.round(me.tier) + 2), Math.max(1, Math.round(me.tier) - 2), 25, null],
      ['brawler_trophies', favorite.id, Math.ceil((favorite.trophies + 120) / 50) * 50, favorite.trophies - 150, 20, null],
      ['power11', null, profile.brawlers.filter((b) => b.power >= MAX_POWER_LEVEL).length + 6, profile.brawlers.filter((b) => b.power >= MAX_POWER_LEVEL).length - 4, 40, null],
      ['brawlers_owned', null, profile.brawlers.length - 2, profile.brawlers.length - 6, 42, new Date(now - 6 * DAY_MS).toISOString()],
    ];
    for (const [kind, brawlerId, target, startValue, daysAgo, achievedAt] of goals) {
      db.run(
        'INSERT INTO goals (tag, kind, brawler_id, target, start_value, created_at, achieved_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [me.tag, kind, brawlerId, target, startValue, new Date(now - daysAgo * DAY_MS).toISOString(), achievedAt],
      );
    }
  });

  // Rotation fictive : maps que la démo a beaucoup jouées, pour montrer les recommandations.
  const slots: RotationSlot[] = [
    ['gemGrab', 'Hard Rock Mine'],
    ['brawlBall', 'Pinball Dreams'],
    ['heist', 'Safe Zone'],
    ['bounty', 'Shooting Star'],
    ['knockout', "Belle's Rock"],
    ['hotZone', 'Dueling Beetles'],
    ['soloShowdown', 'Skull Creek'],
    ['duoShowdown', 'Cavern Churn'],
  ].map(([mode, map], index) => ({
    slotId: index + 1,
    eventId: null,
    mode,
    map,
    startTime: new Date(now - (index + 2) * HOUR_MS).toISOString(),
    endTime: new Date(now + (index * 3 + 4) * HOUR_MS).toISOString(),
  }));
  kv.setJson('rotation', { slots });
  log.info(`Mode démo : données générées en ${Date.now() - started} ms.`);
}
