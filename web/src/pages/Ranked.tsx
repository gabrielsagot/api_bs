import { useState } from 'react';
import { modeLabel, tierName } from '../../../shared/labels';
import type { RankedQueue } from '../../../shared/types';
import { BrawlerAvatar } from '../components/avatars';
import { SetRow } from '../components/battles';
import { ChartCard, TierChart } from '../components/charts';
import { BreakdownTable } from '../components/tables';
import {
  Card,
  CardHeader,
  Delta,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  PageHeader,
  Refetching,
  Segmented,
  StatTile,
} from '../components/ui';
import { useRanked } from '../lib/api';
import { fmtDateTime, fmtInt, fmtPct, fmtPts, plural } from '../lib/format';
import { useNow, usePlayerSlug, useSearchParam } from '../lib/hooks';
import { streakLabel } from './Home';

export const PERIOD_OPTIONS = [
  { value: '7d', label: '7 j' },
  { value: '30d', label: '30 j' },
  { value: '90d', label: '90 j' },
  { value: 'all', label: 'Tout' },
] as const;

type RankedPeriod = (typeof PERIOD_OPTIONS)[number]['value'];

const QUEUE_OPTIONS: { value: RankedQueue; label: string }[] = [
  { value: 'all', label: 'Toutes les files' },
  { value: 'solo', label: 'Solo' },
  { value: 'team', label: 'En équipe' },
];

export function RankedPage() {
  const slug = usePlayerSlug();
  const now = useNow();
  const [period, setPeriod] = useSearchParam<RankedPeriod>('period', '30d', ['7d', '30d', '90d', 'all']);
  const [queue, setQueue] = useSearchParam<RankedQueue>('file', 'all', ['all', 'solo', 'team']);
  const [showAllSets, setShowAllSets] = useState(false);
  const { data, error, isLoading, isPlaceholderData } = useRanked(slug, period, queue);

  const filters = (
    <FilterBar>
      <Segmented label="Période" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
      <Segmented label="File" value={queue} onChange={setQueue} options={QUEUE_OPTIONS} />
    </FilterBar>
  );

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;

  const winRateDelta =
    data.games.winRate !== null && data.previous.winRate !== null ? data.games.winRate - data.previous.winRate : null;
  const streak = streakLabel(data.streak, data.sets.detected ? 'set' : 'manche');
  const sets = showAllSets ? data.recentSets : data.recentSets.slice(0, 12);

  return (
    <>
      <PageHeader title="Ranked" subtitle="Tes parties classées, manche par manche et set par set." />
      {filters}
      <Refetching active={isPlaceholderData}>
        {data.games.games === 0 ? (
          <Card>
            <EmptyState title="Aucune partie classée sur la période">
              Les manches Ranked apparaissent ici dès la collecte suivant ta partie. Essaie une période plus longue.
            </EmptyState>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6">
              <StatTile
                className="col-span-2 md:col-span-1"
                label="Rang actuel"
                value={tierName(data.currentTier)}
                sub={data.startTier !== null ? `au départ : ${tierName(data.startTier)}` : undefined}
              />
              <StatTile className="col-span-2 md:col-span-1" label="Meilleur rang" value={tierName(data.bestTier)} sub="sur la période" />
              <StatTile
                label="Winrate (manches)"
                value={fmtPct(data.games.winRate, 1)}
                delta={<Delta value={winRateDelta}>{fmtPts(winRateDelta)}</Delta>}
                sub={plural(data.games.games, 'manche')}
              />
              <StatTile
                label="Sets gagnés"
                value={data.sets.detected ? `${data.sets.wins} / ${data.sets.games}` : '—'}
                sub={data.sets.detected ? fmtPct(data.sets.winRate, 1) : 'sets non détectés'}
              />
              <StatTile label="Star player" value={fmtPct(data.starPlayerRate)} sub="des manches" />
              <StatTile label="Série en cours" value={streak.value} sub={streak.sub} />
            </div>

            <ChartCard
              className="mt-4"
              title="Évolution du rang"
              subtitle="Chaque marche correspond à un changement de rang."
              table={{
                columns: ['Date', 'Rang'],
                rows: [...data.timeline].reverse().map((p) => [fmtDateTime(p.t), tierName(p.tier)]),
              }}
            >
              <TierChart points={data.timeline} height={260} />
            </ChartCard>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Par brawler" subtitle="Clique sur une colonne pour trier" />
                <BreakdownTable rows={data.byBrawler} kind="brawler" showStar playerSlug={slug} />
              </Card>
              <Card>
                <CardHeader title="Par map" />
                <BreakdownTable rows={data.byMap} kind="map" />
              </Card>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Brawlers adverses" subtitle="Ton winrate quand tu les affrontes (2 manches min.)" />
                <BreakdownTable rows={data.vsBrawlers} kind="opponent" />
              </Card>
              <Card>
                <CardHeader title="Coéquipiers réguliers" subtitle="Joueurs retrouvés à plusieurs occasions" />
                <BreakdownTable rows={data.allies} kind="ally" empty="Aucun coéquipier régulier sur la période." />
              </Card>
            </div>

            {data.mapPicks.length > 0 && (
              <Card className="mt-4">
                <CardHeader title="Meilleurs picks par map" subtitle="Tes brawlers les plus efficaces sur chaque map (winrate lissé)" />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {data.mapPicks.map((pick) => (
                    <div key={`${pick.mode}|${pick.map}`} className="rounded-2xl bg-fill/70 p-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-semibold">{pick.map}</div>
                          <div className="truncate text-[12px] text-ink-2">{modeLabel(pick.mode)}</div>
                        </div>
                        <div className="shrink-0 text-right text-[12px] text-ink-2">
                          <span className="font-medium text-ink">{fmtPct(pick.winRate)}</span> · {plural(pick.games, 'manche')}
                        </div>
                      </div>
                      <ul className="mt-3 space-y-2">
                        {pick.best.map((row) => (
                          <li key={row.key} className="flex items-center gap-2 text-[13px]">
                            <BrawlerAvatar id={row.id} name={row.label} size={24} />
                            <span className="min-w-0 flex-1 truncate">{row.label}</span>
                            <span className="font-medium tnum">{fmtPct(row.winRate)}</span>
                            <span className="w-14 text-right text-ink-3 tnum">
                              {row.wins}–{row.losses}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card className="mt-4">
              <CardHeader
                title="Historique des sets"
                subtitle={data.sets.detected ? `${fmtInt(data.recentSets.length)} derniers sets` : 'Une ligne par match'}
              />
              <ul className="-my-1 divide-y divide-line">
                {sets.map((set) => (
                  <SetRow key={set.id} set={set} now={now} />
                ))}
              </ul>
              {data.recentSets.length > sets.length && (
                <button type="button" onClick={() => setShowAllSets(true)} className="mt-2 text-[13px] font-medium text-accent hover:underline">
                  Voir les {data.recentSets.length} sets
                </button>
              )}
            </Card>
          </>
        )}
      </Refetching>
    </>
  );
}
