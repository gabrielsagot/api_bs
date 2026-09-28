import { useState } from 'react';
import { tierName } from '../../../shared/labels';
import type { RankedProfileDto, TierPoint } from '../../../shared/types';
import { fmtDateTime, fmtInt } from '../lib/format';
import { ChartCard, TierChart, TimeSeriesChart } from './charts';
import { Segmented } from './ui';

/** « Mythique III · 5 746 » */
export function tierWithElo(tier: number | null, elo: number | null): string {
  if (tier === null && elo === null) return '—';
  return [tier !== null ? tierName(tier) : null, elo !== null ? fmtInt(elo) : null].filter(Boolean).join(' · ');
}

/**
 * Évolution Ranked : courbe des points (enregistrés par le dashboard à partir du
 * profil) ou marches du rang (lues dans les parties classées).
 */
export function RankedProgressCard({
  profile,
  timeline,
  subtitle,
  height = 280,
  className,
}: {
  profile: RankedProfileDto;
  timeline: TierPoint[];
  subtitle?: string;
  height?: number;
  className?: string;
}) {
  // La courbe des points n'a d'intérêt qu'une fois qu'ils ont bougé ; avant, on montre les marches du rang.
  const hasElo = new Set(profile.eloSeries.map((p) => p.v)).size > 1;
  const [view, setView] = useState<'elo' | 'tier'>('elo');
  const showElo = hasElo && view === 'elo';
  return (
    <ChartCard
      className={className}
      title="Évolution Ranked"
      subtitle={subtitle}
      action={
        hasElo ? (
          <Segmented
            label="Affichage"
            value={view}
            onChange={setView}
            options={[
              { value: 'elo', label: 'Points' },
              { value: 'tier', label: 'Rang' },
            ]}
          />
        ) : undefined
      }
      table={
        showElo
          ? { columns: ['Date', 'Points'], rows: [...profile.eloSeries].reverse().map((p) => [fmtDateTime(p.t), fmtInt(p.v)]) }
          : { columns: ['Date', 'Rang'], rows: [...timeline].reverse().map((p) => [fmtDateTime(p.t), tierName(p.tier)]) }
      }
    >
      {showElo ? (
        <TimeSeriesChart points={profile.eloSeries} label="Points Ranked" height={height} />
      ) : (
        <TierChart points={timeline} height={height} />
      )}
    </ChartCard>
  );
}
