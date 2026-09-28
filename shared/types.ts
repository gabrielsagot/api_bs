// Contrat entre le serveur (server/) et l'interface (web/).
import type { BattleCategory } from './labels';

export type Outcome = 'win' | 'loss' | 'draw';
export type Period = '24h' | '7d' | '30d' | '90d' | 'all';
export type RankedQueue = 'all' | 'solo' | 'team';

export const PERIODS: Period[] = ['24h', '7d', '30d', '90d', 'all'];

// ── Joueurs ───────────────────────────────────────────────────

export interface PlayerListItem {
  tag: string;
  slug: string;
  name: string;
  /** Couleur du pseudo choisie dans le jeu, au format de l'API (« 0xfff05637 »). */
  nameColor: string | null;
  iconId: number | null;
  isPrimary: boolean;
  colorSlot: number;
  trophies: number | null;
  clubName: string | null;
  lastPolledAt: string | null;
  lastBattleAt: string | null;
  lastError: string | null;
}

export interface PlayerProfileDto extends PlayerListItem {
  clubTag: string | null;
  highestTrophies: number | null;
  expLevel: number | null;
  expPoints: number | null;
  victories3v3: number | null;
  soloVictories: number | null;
  duoVictories: number | null;
  totalPrestigeLevel: number | null;
  fame: number | null;
  fameTierName: string | null;
  trackedSince: string;
}

// ── Sauvegardes ───────────────────────────────────────────────

export interface BackupDto {
  name: string;
  createdAt: string;
  sizeBytes: number;
}

// ── Statut de l'app ───────────────────────────────────────────

export type KeyMode = 'auto' | 'manual' | 'none' | 'demo';
export type KeyState = 'ok' | 'pending' | 'error' | 'missing';

export interface KeyStatusDto {
  mode: KeyMode;
  state: KeyState;
  /** IP de la clé active (auto) ou IP refusée détectée (manuel). */
  ip: string | null;
  message: string | null;
  updatedAt: string | null;
}

export interface StatusDto {
  demo: boolean;
  version: string;
  key: KeyStatusDto;
  poller: {
    running: boolean;
    lastRunAt: string | null;
    nextRunAt: string | null;
    lastError: string | null;
    activeSeconds: number;
    idleSeconds: number;
  };
  network: { host: string; port: number; lanUrls: string[] };
  data: { players: number; battles: number; snapshots: number; dbSizeBytes: number; since: string | null };
}

// ── Combats ───────────────────────────────────────────────────

export interface ParticipantDto {
  side: 'self' | 'ally' | 'enemy';
  team: number;
  tag: string;
  name: string;
  brawlerId: number | null;
  brawlerName: string | null;
  power: number | null;
  trophies: number | null;
}

export interface BattleDto {
  id: number;
  battleTime: string;
  eventId: number | null;
  mode: string;
  map: string | null;
  type: string;
  category: BattleCategory;
  outcome: Outcome | null;
  rank: number | null;
  trophyChange: number | null;
  duration: number | null;
  starPlayer: boolean;
  brawlerId: number | null;
  brawlerName: string | null;
  brawlerPower: number | null;
  brawlerTrophies: number | null;
  teamsCount: number | null;
  participants: ParticipantDto[];
}

export interface WinLoss {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  /** Victoires / (victoires + défaites), null sans partie décidée. */
  winRate: number | null;
}

export interface BreakdownRow extends WinLoss {
  key: string;
  label: string;
  /** Id du brawler quand la ligne en représente un. */
  id: number | null;
  sub: string | null;
  starPlayers: number;
  trophyNet: number | null;
  /** Points Ranked nets (sets mesurés uniquement), quand ils sont connus. */
  eloNet: number | null;
}

export interface StreakDto {
  kind: Outcome | null;
  count: number;
}

export interface SessionDto {
  start: string;
  end: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  trophyNet: number;
  rankedGames: number;
  brawlers: { id: number; name: string; games: number }[];
}

export interface BattleFilters {
  period: Period;
  category: BattleCategory | 'all';
  mode: string | null;
  brawlerId: number | null;
  map: string | null;
}

export interface BattleStatsResponse {
  filters: BattleFilters;
  summary: WinLoss & {
    starPlayerRate: number | null;
    avgDuration: number | null;
    trophyNet: number | null;
    longestWinStreak: number;
    streak: StreakDto;
  };
  byMode: BreakdownRow[];
  byMap: BreakdownRow[];
  byBrawler: BreakdownRow[];
  byCategory: BreakdownRow[];
  allies: BreakdownRow[];
  vsBrawlers: BreakdownRow[];
  sessions: SessionDto[];
  options: {
    modes: { key: string; label: string }[];
    maps: string[];
    brawlers: { id: number; name: string }[];
  };
}

export interface BattleListResponse {
  total: number;
  items: BattleDto[];
}

// ── Ranked ────────────────────────────────────────────────────

export type SetOutcome = 'win' | 'loss' | 'draw' | 'ongoing' | 'partial';

export interface RankedSetDto {
  id: string;
  start: string;
  end: string;
  type: string;
  mode: string;
  map: string | null;
  wins: number;
  losses: number;
  draws: number;
  outcome: SetOutcome;
  tier: number | null;
  /** Points Ranked gagnés ou perdus sur ce set (null si non mesurable). */
  eloChange: number | null;
  games: {
    battleTime: string;
    outcome: Outcome | null;
    brawlerId: number | null;
    brawlerName: string | null;
    starPlayer: boolean;
    duration: number | null;
  }[];
  self: ParticipantDto | null;
  allies: ParticipantDto[];
  enemies: ParticipantDto[];
}

export interface TierPoint {
  t: string;
  tier: number;
}

export interface MapPicksDto {
  map: string;
  mode: string;
  games: number;
  winRate: number | null;
  best: BreakdownRow[];
}

export interface RankedCore {
  games: WinLoss;
  /** Même durée, juste avant la période affichée (pour les écarts). */
  previous: WinLoss;
  sets: WinLoss & { detected: boolean };
  starPlayerRate: number | null;
  currentTier: number | null;
  bestTier: number | null;
  startTier: number | null;
  streak: StreakDto;
  timeline: TierPoint[];
}

/** Points (ELO) et records Ranked, tels que fournis par le profil du joueur. */
export interface RankedProfileDto {
  seasonId: number | null;
  elo: number | null;
  tier: number | null;
  seasonBestElo: number | null;
  seasonBestTier: number | null;
  allTimeBestElo: number | null;
  allTimeBestTier: number | null;
  /** Variation des points sur la période affichée. */
  eloDelta: number | null;
  eloSeries: SeriesPoint[];
  /** Rang suivant, seuil estimé et points restants. */
  nextTier: number | null;
  nextTierElo: number | null;
  pointsToNext: number | null;
  /** Moyenne des points par set sur les derniers sets mesurés. */
  avgEloPerSet: number | null;
  setsToNext: number | null;
}

export interface DuoPairDto extends WinLoss {
  myId: number;
  myName: string;
  allyId: number;
  allyName: string;
}

export interface DuoRow {
  tag: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number | null;
  withoutGames: number;
  withoutWinRate: number | null;
  sets: number;
  eloNet: number | null;
  pairs: DuoPairDto[];
}

export interface RankedResponse extends RankedCore {
  profile: RankedProfileDto;
  period: Period;
  queue: RankedQueue;
  byBrawler: BreakdownRow[];
  byMap: BreakdownRow[];
  byMode: BreakdownRow[];
  vsBrawlers: BreakdownRow[];
  allies: BreakdownRow[];
  duos: DuoRow[];
  recentSets: RankedSetDto[];
  mapPicks: MapPicksDto[];
}

// ── Session en direct ─────────────────────────────────────────

export interface LiveSessionResponse {
  /** Une partie a été jouée il y a moins de 30 min. */
  active: boolean;
  start: string | null;
  end: string | null;
  games: WinLoss;
  ranked: WinLoss;
  sets: WinLoss;
  recentSets: RankedSetDto[];
  eloStart: number | null;
  eloNow: number | null;
  eloDelta: number | null;
  tier: number | null;
  trophyNet: number;
  streak: StreakDto;
  next: Pick<RankedProfileDto, 'nextTier' | 'nextTierElo' | 'pointsToNext' | 'avgEloPerSet' | 'setsToNext'>;
  brawlers: { id: number; name: string; games: number; wins: number; losses: number }[];
  battles: BattleDto[];
  lastPolledAt: string | null;
}

// ── Trophées ──────────────────────────────────────────────────

export interface SeriesPoint {
  t: string;
  v: number;
}

export interface DailyDelta {
  day: string;
  delta: number;
  close: number;
}

export interface TrophyBrawlerRow {
  id: number;
  name: string;
  power: number;
  trophies: number;
  highestTrophies: number;
  prestige: number | null;
  delta: number | null;
  games: number;
  winRate: number | null;
  trophyNet: number | null;
  currentWinStreak: number | null;
  maxWinStreak: number | null;
}

export interface PrestigeCandidateDto {
  id: number;
  name: string;
  trophies: number;
  prestige: number | null;
  nextMilestone: number;
  remaining: number;
  games: number;
  winRate: number | null;
  avgPerGame: number | null;
  gamesToNext: number | null;
  currentWinStreak: number | null;
}

export interface TrophiesResponse {
  period: Period;
  current: number | null;
  highest: number | null;
  delta: number | null;
  series: SeriesPoint[];
  /** Date du premier relevé du dashboard quand la courbe a été reconstituée avant lui à partir des combats. */
  reconstructedUntil: string | null;
  daily: DailyDelta[];
  trophyGames: WinLoss & { trophyNet: number; avgPerGame: number | null };
  brawlers: TrophyBrawlerRow[];
  prestige: { total: number | null; candidates: PrestigeCandidateDto[] };
  streaks: { id: number; name: string; current: number; max: number | null }[];
}

// ── Collection ────────────────────────────────────────────────

export interface AccessoryDto {
  id: number;
  name: string;
  owned: boolean;
  level: number | null;
}

export interface CostDto {
  coins: number;
  powerPoints: number;
  maxed: boolean;
}

export interface BrawlerCardDto {
  id: number;
  name: string;
  owned: boolean;
  rarity: string | null;
  rarityRank: number | null;
  className: string | null;
  power: number | null;
  rank: number | null;
  trophies: number | null;
  highestTrophies: number | null;
  prestige: number | null;
  currentWinStreak: number | null;
  maxWinStreak: number | null;
  buffies: { gadget: boolean; starPower: boolean; hyperCharge: boolean } | null;
  gadgets: AccessoryDto[];
  starPowers: AccessoryDto[];
  hyperCharges: AccessoryDto[];
  gears: AccessoryDto[];
  cost: CostDto | null;
  games: number;
  winRate: number | null;
}

export interface CollectionResponse {
  catalogSource: 'api' | 'profile';
  totals: {
    owned: number;
    total: number | null;
    power11: number;
    maxed: number;
    gadgets: { owned: number; total: number | null };
    starPowers: { owned: number; total: number | null };
    hyperCharges: { owned: number; total: number | null };
    gears: number;
    buffies: { owned: number; total: number | null };
    coinsToMax: number;
    powerPointsToMax: number;
  };
  brawlers: BrawlerCardDto[];
  priorities: UpgradePriorityDto[];
}

/** Prochain achat conseillé : les brawlers que tu joues le plus et qui te réussissent. */
export interface UpgradePriorityDto {
  brawlerId: number;
  name: string;
  power: number;
  games: number;
  rankedGames: number;
  winRate: number | null;
  step: string;
  stepCoins: number;
  stepPowerPoints: number;
  remainingCoins: number;
  missingBuffies: number;
}

export interface CostLineDto {
  label: string;
  coins: number;
  powerPoints: number;
}

export interface BrawlerDetailResponse {
  card: BrawlerCardDto;
  history: SeriesPoint[];
  stats: WinLoss & { starPlayerRate: number | null; trophyNet: number | null };
  byMode: BreakdownRow[];
  byMap: BreakdownRow[];
  recent: BattleDto[];
  costLines: CostLineDto[];
}

// ── Rotation ──────────────────────────────────────────────────

export interface RecommendationDto {
  brawlerId: number;
  brawlerName: string;
  games: number;
  wins: number;
  winRate: number | null;
  score: number;
  basis: 'map' | 'mode';
  trophies: number | null;
  power: number | null;
}

export interface RotationEventDto {
  slotId: number | null;
  eventId: number | null;
  mode: string;
  map: string | null;
  startTime: string;
  endTime: string;
  history: WinLoss;
  recommendations: RecommendationDto[];
}

export interface RotationResponse {
  fetchedAt: string | null;
  events: RotationEventDto[];
}

// ── Objectifs ─────────────────────────────────────────────────

export type GoalKind =
  | 'trophies'
  | 'brawler_trophies'
  | 'ranked_tier'
  | 'ranked_elo'
  | 'power11'
  | 'brawlers_owned'
  | 'victories_3v3';

export interface GoalDto {
  id: number;
  kind: GoalKind;
  label: string;
  brawlerId: number | null;
  brawlerName: string | null;
  target: number;
  startValue: number;
  current: number | null;
  progress: number;
  createdAt: string;
  achievedAt: string | null;
  ratePerDay: number | null;
  etaDays: number | null;
  etaDate: string | null;
}

export interface CreateGoalInput {
  kind: GoalKind;
  target: number;
  brawlerId?: number | null;
}

// ── Accueil ───────────────────────────────────────────────────

export interface OverviewResponse {
  player: PlayerProfileDto;
  ranked: RankedCore & {
    profile: RankedProfileDto;
    recentSets: RankedSetDto[];
    topBrawlers: BreakdownRow[];
    topMaps: BreakdownRow[];
  };
  trophies: {
    current: number | null;
    highest: number | null;
    delta24h: number | null;
    delta7d: number | null;
    series: SeriesPoint[];
  };
  lastSession: SessionDto | null;
  goals: GoalDto[];
  collection: { owned: number; total: number | null; power11: number };
}

// ── Comparaison ───────────────────────────────────────────────

export interface ComparePlayerDto {
  tag: string;
  slug: string;
  name: string;
  nameColor: string | null;
  iconId: number | null;
  colorSlot: number;
  trophies: number | null;
  highestTrophies: number | null;
  expLevel: number | null;
  brawlersOwned: number;
  power11: number;
  victories3v3: number | null;
  soloVictories: number | null;
  duoVictories: number | null;
  trophyDelta7d: number | null;
  games7d: WinLoss;
  rankedTier: number | null;
  rankedElo: number | null;
  rankedWinRate30d: number | null;
  series: SeriesPoint[];
}

export interface CompareResponse {
  players: ComparePlayerDto[];
  brawlers: { id: number; name: string; values: (number | null)[] }[];
}
