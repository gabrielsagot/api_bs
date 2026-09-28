import clsx from 'clsx';
import { useState } from 'react';
import { tierName } from '../../../shared/labels';
import type { RankedProfileDto, TierPoint } from '../../../shared/types';
import { fmtDateTime, fmtInt, fmtSigned } from '../lib/format';
import { TierLabel } from './bs';
import { ChartCard, TierChart, TimeSeriesChart } from './charts';
import { ProgressBar, Segmented } from './ui';

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

/** Points gagnés ou perdus, avec signe et couleur (jamais la couleur seule : le signe reste lisible). */
export function EloChange({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return <span className={clsx('text-ink-3', className)}>—</span>;
  return (
    <span className={clsx('font-medium tnum', value > 0 ? 'text-good' : value < 0 ? 'text-bad' : 'text-ink-2', className)}>
      {fmtSigned(value)}
    </span>
  );
}

/** Progression vers le rang suivant (seuils estimés : 500 points par rang). */
export function NextTierProgress({
  elo,
  next,
  compact = false,
}: {
  elo: number | null;
  next: Pick<RankedProfileDto, 'nextTier' | 'nextTierElo' | 'pointsToNext' | 'avgEloPerSet' | 'setsToNext'>;
  compact?: boolean;
}) {
  if (elo === null || next.nextTier === null || next.nextTierElo === null || next.pointsToNext === null) return null;
  const floor = next.nextTierElo - 500;
  const progress = Math.min(1, Math.max(0, (elo - floor) / 500));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-ink-2">
          Encore <strong className="font-semibold text-ink">{fmtInt(next.pointsToNext)} points</strong> avant{' '}
          <TierLabel tier={next.nextTier} size={16} className="font-medium text-ink" />
        </span>
        {!compact && <span className="shrink-0 text-ink-3 tnum">{fmtInt(next.nextTierElo)}</span>}
      </div>
      <div className="mt-2">
        <ProgressBar value={progress} />
      </div>
      <p className="mt-1.5 text-[12px] text-ink-2">
        {next.setsToNext !== null && next.avgEloPerSet !== null
          ? `≈ ${fmtInt(next.setsToNext)} set${next.setsToNext > 1 ? 's' : ''} à ton rythme actuel (${fmtSigned(next.avgEloPerSet)} points par set en moyenne)`
          : next.avgEloPerSet !== null
            ? `Rythme récent : ${fmtSigned(next.avgEloPerSet)} points par set en moyenne`
            : 'Le rythme s’affichera après quelques sets mesurés.'}
      </p>
    </div>
  );
}
