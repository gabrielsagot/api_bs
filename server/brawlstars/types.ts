// Formes des réponses de l'API officielle (https://developer.brawlstars.com).
// Les champs sont volontairement optionnels : Supercell en ajoute/retire au fil
// des mises à jour, et le code doit rester tolérant.

export interface ApiAccessory {
  id: number;
  name: string;
  level?: number;
}

export interface ApiPlayerBrawler {
  id: number;
  name: string;
  power: number;
  rank?: number;
  trophies: number;
  highestTrophies: number;
  prestigeLevel?: number;
  currentWinStreak?: number;
  buffies?: { gadget?: boolean; starPower?: boolean; hyperCharge?: boolean };
  maxWinStreak?: number;
  gears?: ApiAccessory[];
  starPowers?: ApiAccessory[];
  gadgets?: ApiAccessory[];
  hyperCharges?: ApiAccessory[];
  skin?: { id: number; name: string };
  [key: string]: unknown;
}

export interface ApiPlayer {
  tag: string;
  name: string;
  nameColor?: string;
  icon?: { id: number };
  trophies: number;
  highestTrophies: number;
  expLevel?: number;
  expPoints?: number;
  totalPrestigeLevel?: number;
  fame?: number;
  fameTierName?: string;
  /** Ranked : rang (1 = Bronze I … 22 = Pro) et points (ELO) de la saison en cours. */
  rankedSeasonId?: number;
  rankedRank?: number;
  rankedRankName?: string;
  rankedElo?: number;
  highestSeasonRankedRank?: number;
  highestSeasonRankedElo?: number;
  highestAllTimeRankedRank?: number;
  highestAllTimeRankedElo?: number;
  isQualifiedFromChampionshipChallenge?: boolean;
  '3vs3Victories'?: number;
  soloVictories?: number;
  duoVictories?: number;
  bestRoboRumbleTime?: number;
  bestTimeAsBigBrawler?: number;
  club?: { tag?: string; name?: string };
  brawlers: ApiPlayerBrawler[];
  [key: string]: unknown;
}

export interface ApiBattleBrawler {
  id: number;
  name: string;
  power?: number;
  trophies?: number;
  trophyChange?: number;
}

export interface ApiBattlePlayer {
  tag: string;
  name: string;
  brawler?: ApiBattleBrawler;
  /** Duels : chaque joueur aligne plusieurs brawlers. */
  brawlers?: ApiBattleBrawler[];
}

export interface ApiBattle {
  battleTime: string;
  event?: { id?: number; mode?: string; modeId?: number; map?: string | null };
  battle: {
    mode?: string;
    type?: string;
    result?: string;
    duration?: number;
    trophyChange?: number;
    rank?: number;
    starPlayer?: ApiBattlePlayer | null;
    teams?: ApiBattlePlayer[][];
    players?: ApiBattlePlayer[];
    [key: string]: unknown;
  };
}

export interface ApiBattleLog {
  items: ApiBattle[];
}

export interface ApiCatalogBrawler {
  id: number;
  name: string;
  starPowers?: ApiAccessory[];
  gadgets?: ApiAccessory[];
  hyperCharges?: ApiAccessory[];
  [key: string]: unknown;
}

export interface ApiEventSlot {
  startTime: string;
  endTime: string;
  slotId?: number;
  event: { id?: number; mode?: string; modeId?: number; map?: string };
}
