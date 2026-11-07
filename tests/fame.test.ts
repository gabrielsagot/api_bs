import { describe, expect, it } from 'vitest';
import {
  FAME_MILESTONES,
  FAME_PLANETS,
  MAX_FAME_POINTS,
  TOTAL_FAME_LEVELS,
  computeFameProgress,
} from '../shared/fame';

describe('Voie de la Gloire (Fame Road)', () => {
  it('contient 8 planètes et 24 niveaux', () => {
    expect(FAME_PLANETS).toHaveLength(8);
    expect(FAME_MILESTONES).toHaveLength(TOTAL_FAME_LEVELS);
    expect(TOTAL_FAME_LEVELS).toBe(24);
    expect(MAX_FAME_POINTS).toBe(524_100);
  });

  it('valide les seuils et récompenses du palier Météorique', () => {
    const meteoricI = FAME_MILESTONES.find((m) => m.tier === 'METEORIC' && m.level === 'I');
    expect(meteoricI).toBeDefined();
    expect(meteoricI?.cumulativePoints).toBe(89_100);
    expect(meteoricI?.cost).toBe(20_000);
    expect(meteoricI?.reward.type).toBe('card');

    const meteoricII = FAME_MILESTONES.find((m) => m.tier === 'METEORIC' && m.level === 'II');
    expect(meteoricII?.cumulativePoints).toBe(109_100);
    expect(meteoricII?.reward.type).toBe('icon');

    const meteoricIII = FAME_MILESTONES.find((m) => m.tier === 'METEORIC' && m.level === 'III');
    expect(meteoricIII?.cumulativePoints).toBe(129_100);
    expect(meteoricIII?.reward.type).toBe('pin');
  });

  it('calcule la progression pour Gloire météorique I avec points cumulés', () => {
    const progress = computeFameProgress(94_500, 'METEORIC FAME I');
    expect(progress.currentTier).toBe('METEORIC');
    expect(progress.currentLevel).toBe('I');
    expect(progress.milestoneIndex).toBe(15);
    expect(progress.totalPoints).toBe(94_500);
    expect(progress.pointsInLevel).toBe(5_400);
    expect(progress.pointsNeededForNext).toBe(14_600);
    expect(progress.levelProgressPercent).toBe(27);
    expect(progress.nextMilestone?.fullNameFr).toBe('Gloire météorique II');
    expect(progress.unlockedMilestonesCount).toBe(16);
  });

  it('calcule la progression pour Gloire météorique I avec points de palier relatifs', () => {
    const progress = computeFameProgress(5_400, 'METEORIC FAME I');
    expect(progress.currentTier).toBe('METEORIC');
    expect(progress.currentLevel).toBe('I');
    expect(progress.totalPoints).toBe(89_100 + 5_400);
    expect(progress.pointsInLevel).toBe(5_400);
    expect(progress.pointsNeededForNext).toBe(14_600);
    expect(progress.levelProgressPercent).toBe(27);
  });

  it('gère les cas limites (null, vide, palier max)', () => {
    const def = computeFameProgress(null, null);
    expect(def.currentTier).toBe('GLOBAL');
    expect(def.currentLevel).toBe('I');
    expect(def.totalPoints).toBe(0);

    const maxProgress = computeFameProgress(524_100, 'STARR FORCE FAME III');
    expect(maxProgress.currentTier).toBe('STARR FORCE');
    expect(maxProgress.currentLevel).toBe('III');
    expect(maxProgress.isMaxTier).toBe(true);
    expect(maxProgress.nextMilestone).toBeNull();
    expect(maxProgress.pointsNeededForNext).toBe(0);
  });
});
