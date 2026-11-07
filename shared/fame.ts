// Définitions complètes de la Voie de la Gloire (Fame Road) de Brawl Stars.
import { FAME_TIERS, type FameTier, parseFame } from './labels';

export type FameLevel = 'I' | 'II' | 'III';
export type FameRewardType = 'card' | 'icon' | 'pin';

export interface FameReward {
  type: FameRewardType;
  title: string;
  shortTitle: string;
  description: string;
  imageUrl: string;
}

export interface FameMilestone {
  index: number;
  tier: FameTier;
  level: FameLevel;
  tierNameFr: string;
  planetName: string;
  fullNameFr: string;
  cost: number;
  cumulativePoints: number;
  reward: FameReward;
}

export interface PlanetDefinition {
  tier: FameTier;
  name: string;
  planetName: string;
  subtitle: string;
  description: string;
  pointsPerLevel: number;
  startPoints: number;
  endPoints: number;
  imageUrl: string;
  colors: {
    primary: string;
    secondary: string;
    glow: string;
    border: string;
    accent: string;
    badgeBg: string;
  };
  milestones: [FameMilestone, FameMilestone, FameMilestone];
}

export const MAX_FAME_POINTS = 524_100;
export const TOTAL_FAME_LEVELS = 24;

export function getPlanetImageUrl(tier: string | null | undefined): string {
  const map: Record<string, string> = {
    GLOBAL: '/img/fame/GlobalFame.png',
    LUNAR: '/img/fame/LunarFame.png',
    MARTIAN: '/img/fame/MartianFame.png',
    SATURNIAN: '/img/fame/SaturnianFame.png',
    SOLAR: '/img/fame/SolarFame.png',
    METEORIC: '/img/fame/MeteoricFame.png',
    ALIEN: '/img/fame/AlienFame.png',
    'STARR FORCE': '/img/fame/StarrForceFame.png',
  };
  return (tier && map[tier]) || '/img/fame/GlobalFame.png';
}

export function getRewardImageUrl(tier: string | null | undefined, type: FameRewardType): string {
  const key = tier || 'GLOBAL';
  const pinMap: Record<string, string> = {
    GLOBAL: '/img/fame/Fame_Pin-Global.png',
    LUNAR: '/img/fame/Fame_Pin-Lunar.png',
    MARTIAN: '/img/fame/Fame_Pin-Martian.png',
    SATURNIAN: '/img/fame/Fame_Pin-Saturnian.png',
    SOLAR: '/img/fame/Fame_Pin-Solar.png',
    METEORIC: '/img/fame/Fame_Pin-Meteoric.png',
    ALIEN: '/img/fame/Fame_Pin-Alien.png',
    'STARR FORCE': '/img/fame/Fame_Pin-Starr_Force.png',
  };
  const iconMap: Record<string, string> = {
    GLOBAL: '/img/fame/Global_Fame-pfp.png',
    LUNAR: '/img/fame/Lunar_Fame-pfp.png',
    MARTIAN: '/img/fame/Martian_Fame-pfp.png',
    SATURNIAN: '/img/fame/Saturnian_Fame-pfp.png',
    SOLAR: '/img/fame/Solar_Fame-pfp.png',
    METEORIC: '/img/fame/Meteoric_Fame-pfp.png',
    ALIEN: '/img/fame/Alien_Fame-pfp.png',
    'STARR FORCE': '/img/fame/Starr_Force_Fame-pfp.png',
  };
  const cardMap: Record<string, string> = {
    GLOBAL: '/img/fame/Battle_Card-Global_Fame.png',
    LUNAR: '/img/fame/Battle_Card-Lunar_Fame.png',
    MARTIAN: '/img/fame/Battle_Card-Martian_Fame.png',
    SATURNIAN: '/img/fame/Battle_Card-Saturnian_Fame.png',
    SOLAR: '/img/fame/Battle_Card-Solar_Fame.png',
    METEORIC: '/img/fame/Battle_Card-Meteoric_Fame.png',
    ALIEN: '/img/fame/Battle_Card-Alien_Fame.png',
    'STARR FORCE': '/img/fame/Battle_Card-Starr_Force_Fame.png',
  };

  if (type === 'pin') return pinMap[key] || pinMap.GLOBAL;
  if (type === 'icon') return iconMap[key] || iconMap.GLOBAL;
  return cardMap[key] || cardMap.GLOBAL;
}

const PLANET_METADATA: Record<
  FameTier,
  {
    nameFr: string;
    planetName: string;
    subtitle: string;
    description: string;
    pointsPerLevel: number;
    startPoints: number;
    colors: PlanetDefinition['colors'];
  }
> = {
  GLOBAL: {
    nameFr: 'mondiale',
    planetName: 'Terre',
    subtitle: 'Point de départ galactique',
    description: 'Le berceau de l’humanité. Débloqué dès que tous les brawlers sont acquis.',
    pointsPerLevel: 2_000,
    startPoints: 0,
    colors: {
      primary: '#2e8fe0',
      secondary: '#3cc56b',
      glow: 'rgba(46, 143, 224, 0.45)',
      border: '#2a9d55',
      accent: '#64d2ff',
      badgeBg: 'rgba(46, 143, 224, 0.15)',
    },
  },
  LUNAR: {
    nameFr: 'lunaire',
    planetName: 'Lune',
    subtitle: 'Premier pas hors d’orbite',
    description: 'L’astre argenté et ses mers de poussière silencieuse.',
    pointsPerLevel: 3_200,
    startPoints: 6_000,
    colors: {
      primary: '#d4d7dd',
      secondary: '#9aa0aa',
      glow: 'rgba(212, 215, 221, 0.45)',
      border: '#6f7580',
      accent: '#e5e7eb',
      badgeBg: 'rgba(212, 215, 221, 0.15)',
    },
  },
  MARTIAN: {
    nameFr: 'martienne',
    planetName: 'Mars',
    subtitle: 'La frontière rouge des pionniers',
    description: 'Déserts d’oxyde de fer, canyons abyssaux et tempêtes écarlates.',
    pointsPerLevel: 4_500,
    startPoints: 15_600,
    colors: {
      primary: '#e8453c',
      secondary: '#b3261e',
      glow: 'rgba(232, 69, 60, 0.5)',
      border: '#d32f2f',
      accent: '#ff8a80',
      badgeBg: 'rgba(232, 69, 60, 0.15)',
    },
  },
  SATURNIAN: {
    nameFr: 'saturnienne',
    planetName: 'Saturne',
    subtitle: 'Le seigneur des anneaux d’or',
    description: 'Une géante gazeuse couronnée d’anneaux de glace et de poussière dorée.',
    pointsPerLevel: 8_000,
    startPoints: 29_100,
    colors: {
      primary: '#f39a2e',
      secondary: '#c4671a',
      glow: 'rgba(243, 154, 46, 0.5)',
      border: '#d9791c',
      accent: '#ffd180',
      badgeBg: 'rgba(243, 154, 46, 0.15)',
    },
  },
  SOLAR: {
    nameFr: 'solaire',
    planetName: 'Soleil',
    subtitle: 'L’étoile de fusion pure',
    description: 'Un brasier colossal de lumière irradiante, de plasma et d’éruptions stellaires.',
    pointsPerLevel: 12_000,
    startPoints: 53_100,
    colors: {
      primary: '#f8cb1c',
      secondary: '#e3a012',
      glow: 'rgba(248, 203, 28, 0.55)',
      border: '#c98a00',
      accent: '#ffe57f',
      badgeBg: 'rgba(248, 203, 28, 0.18)',
    },
  },
  METEORIC: {
    nameFr: 'météorique',
    planetName: 'Météore',
    subtitle: 'Le bolide incandescent',
    description: 'Un astéroïde ténébreux traversant l’espace enveloppé de flammes ardentes.',
    pointsPerLevel: 20_000,
    startPoints: 89_100,
    colors: {
      primary: '#2b2a2e',
      secondary: '#f2661d',
      glow: 'rgba(242, 102, 29, 0.6)',
      border: '#e2404f',
      accent: '#ff6e40',
      badgeBg: 'rgba(242, 102, 29, 0.2)',
    },
  },
  ALIEN: {
    nameFr: 'extraterrestre',
    planetName: 'Planète Alien',
    subtitle: 'Les mystères des confins profonds',
    description: 'Un monde inconnu phosphorescent aux végétations bioluminescentes vertes.',
    pointsPerLevel: 50_000,
    startPoints: 149_100,
    colors: {
      primary: '#8fdc2c',
      secondary: '#4a9e1f',
      glow: 'rgba(143, 220, 44, 0.55)',
      border: '#4a9e1f',
      accent: '#b9f6ca',
      badgeBg: 'rgba(143, 220, 44, 0.18)',
    },
  },
  'STARR FORCE': {
    nameFr: 'Starr Force',
    planetName: 'Starr Force',
    subtitle: 'L’apogée suprême de la galaxie',
    description: 'Le quartier général interstellaire frappé du sceau doré Supercell Starr.',
    pointsPerLevel: 75_000,
    startPoints: 299_100,
    colors: {
      primary: '#b640e0',
      secondary: '#f5c518',
      glow: 'rgba(182, 64, 224, 0.6)',
      border: '#b640e0',
      accent: '#ea80fc',
      badgeBg: 'rgba(182, 64, 224, 0.2)',
    },
  },
};

const REWARD_DESCRIPTIONS: Record<FameRewardType, (tierFr: string, planet: string) => { title: string; short: string; desc: string }> = {
  card: (tierFr, planet) => ({
    title: `Fond de carte de combat — Gloire ${tierFr}`,
    short: `Fond de carte`,
    desc: `Arrière-plan cosmique aux couleurs de ${planet} affiché lors du début de combat.`,
  }),
  icon: (tierFr, planet) => ({
    title: `Photo de profil — Gloire ${tierFr}`,
    short: `Photo de profil`,
    desc: `Icône d’avatar officielle représentant l’emblème céleste de ${planet}.`,
  }),
  pin: (tierFr, planet) => ({
    title: `Émoticône Collector — Gloire ${tierFr}`,
    short: `Émoticône`,
    desc: `Pin animé exclusif serti de bordures dorées de la collection ${planet}.`,
  }),
};

function buildMilestones(): { planets: PlanetDefinition[]; milestones: FameMilestone[] } {
  const milestones: FameMilestone[] = [];
  const planets: PlanetDefinition[] = [];

  let currentIndex = 0;
  for (const tier of FAME_TIERS) {
    const meta = PLANET_METADATA[tier];
    const tierLevels: FameLevel[] = ['I', 'II', 'III'];
    const planetMilestones: FameMilestone[] = [] as unknown as FameMilestone[];

    for (let i = 0; i < tierLevels.length; i++) {
      const level = tierLevels[i];
      const rewardType: FameRewardType = i === 0 ? 'card' : i === 1 ? 'icon' : 'pin';
      const rewardInfo = REWARD_DESCRIPTIONS[rewardType](meta.nameFr, meta.planetName);
      const cumulativePoints = meta.startPoints + i * meta.pointsPerLevel;

      const milestone: FameMilestone = {
        index: currentIndex,
        tier,
        level,
        tierNameFr: meta.nameFr,
        planetName: meta.planetName,
        fullNameFr: `Gloire ${meta.nameFr} ${level}`,
        cost: meta.pointsPerLevel,
        cumulativePoints,
        reward: {
          type: rewardType,
          title: rewardInfo.title,
          shortTitle: rewardInfo.short,
          description: rewardInfo.desc,
          imageUrl: getRewardImageUrl(tier, rewardType),
        },
      };

      milestones.push(milestone);
      planetMilestones.push(milestone);
      currentIndex++;
    }

    const endPoints = meta.startPoints + 3 * meta.pointsPerLevel;
    planets.push({
      tier,
      name: meta.nameFr,
      planetName: meta.planetName,
      subtitle: meta.subtitle,
      description: meta.description,
      pointsPerLevel: meta.pointsPerLevel,
      startPoints: meta.startPoints,
      endPoints,
      imageUrl: getPlanetImageUrl(tier),
      colors: meta.colors,
      milestones: planetMilestones as [FameMilestone, FameMilestone, FameMilestone],
    });
  }

  return { planets, milestones };
}

const BUILT = buildMilestones();
export const FAME_PLANETS: readonly PlanetDefinition[] = BUILT.planets;
export const FAME_MILESTONES: readonly FameMilestone[] = BUILT.milestones;

export interface FameProgress {
  currentTier: FameTier;
  currentLevel: FameLevel;
  milestoneIndex: number;
  currentMilestone: FameMilestone;
  totalPoints: number;
  levelMinPoints: number;
  levelMaxPoints: number;
  pointsInLevel: number;
  pointsNeededForNext: number;
  levelProgressPercent: number;
  globalProgressPercent: number;
  unlockedMilestonesCount: number;
  totalMilestonesCount: number;
  nextMilestone: FameMilestone | null;
  isMaxTier: boolean;
}

/**
 * Calcule avec exactitude la progression du joueur sur la Voie de la Gloire.
 * Gère à la fois le cas où l'API renvoie le cumul total des crédits ou les points du palier.
 */
export function computeFameProgress(famePoints: number | null | undefined, fameTierName: string | null | undefined): FameProgress {
  const parsed = parseFame(fameTierName);
  const tier: FameTier = parsed.tier ?? 'GLOBAL';
  const level: FameLevel = (parsed.level as FameLevel) || 'I';

  // Retrouver le jalon courant
  const matchIndex = FAME_MILESTONES.findIndex((m) => m.tier === tier && m.level === level);
  const milestoneIndex = matchIndex >= 0 ? matchIndex : 0;
  const currentMilestone = FAME_MILESTONES[milestoneIndex];

  const levelMinPoints = currentMilestone.cumulativePoints;
  const levelCost = currentMilestone.cost;
  const levelMaxPoints = levelMinPoints + levelCost;

  // Calcul des points totaux et points dans le niveau actuel
  let totalPoints = levelMinPoints;
  let pointsInLevel = 0;

  if (typeof famePoints === 'number' && Number.isFinite(famePoints)) {
    if (famePoints >= levelMinPoints) {
      // Cumul total
      totalPoints = famePoints;
      pointsInLevel = Math.max(0, Math.min(famePoints - levelMinPoints, levelCost));
    } else if (famePoints >= 0 && famePoints <= levelCost) {
      // Points dans le niveau en cours
      pointsInLevel = famePoints;
      totalPoints = levelMinPoints + famePoints;
    } else {
      // Donnée hors échelle (ex: démo avec échelle relative)
      totalPoints = Math.max(levelMinPoints, famePoints);
      pointsInLevel = Math.max(0, Math.min(totalPoints - levelMinPoints, levelCost));
    }
  }

  const nextMilestone = milestoneIndex < FAME_MILESTONES.length - 1 ? FAME_MILESTONES[milestoneIndex + 1] : null;
  const isMaxTier = milestoneIndex === FAME_MILESTONES.length - 1 && pointsInLevel >= levelCost;
  const pointsNeededForNext = nextMilestone ? Math.max(0, levelCost - pointsInLevel) : 0;

  const levelProgressPercent = Math.min(100, Math.max(0, Math.round((pointsInLevel / levelCost) * 100)));
  const globalProgressPercent = Math.min(100, Math.max(0, Math.round((totalPoints / MAX_FAME_POINTS) * 100)));

  return {
    currentTier: tier,
    currentLevel: level,
    milestoneIndex,
    currentMilestone,
    totalPoints,
    levelMinPoints,
    levelMaxPoints,
    pointsInLevel,
    pointsNeededForNext,
    levelProgressPercent,
    globalProgressPercent,
    unlockedMilestonesCount: milestoneIndex + 1,
    totalMilestonesCount: TOTAL_FAME_LEVELS,
    nextMilestone,
    isMaxTier,
  };
}
