import { useState } from 'react';
import { modeLabel, tierName } from '../../../shared/labels';
import type { DuoRow, RankedQueue } from '../../../shared/types';
import { BrawlerAvatar } from '../components/avatars';
import { SetRow } from '../components/battles';
import { EloChange, NextTierProgress, RankedProgressCard } from '../components/ranked';
import { DataTable, type Column } from '../components/tables';
import { BreakdownTable } from '../components/tables';
import {
  Card,
  CardHeader,
  Delta,
  DocLink,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  Meter,
  PageHeader,
  Refetching,
  Segmented,
  StatTile,
} from '../components/ui';
import { useRanked } from '../lib/api';
import { fmtInt, fmtPct, fmtPts, fmtSigned, plural } from '../lib/format';
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
      <PageHeader title="Ranked" subtitle="Tes parties classées, manche par manche et set par set." action={<DocLink section="ranked" />} />
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
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatTile
                label="Points Ranked"
                value={fmtInt(data.profile.elo)}
                delta={<Delta value={data.profile.eloDelta}>{fmtSigned(data.profile.eloDelta)}</Delta>}
                sub={data.profile.eloDelta !== null ? 'sur la période' : undefined}
              />
              <StatTile
                label="Rang actuel"
                value={tierName(data.currentTier)}
                sub={data.startTier !== null ? `au départ : ${tierName(data.startTier)}` : undefined}
              />
              <StatTile
                className="col-span-2 md:col-span-1"
                label="Record de la saison"
                value={tierName(data.profile.seasonBestTier ?? data.bestTier)}
                sub={data.profile.seasonBestElo !== null ? `${fmtInt(data.profile.seasonBestElo)} points` : 'sur la période'}
              />
              <StatTile
                className="col-span-2 md:col-span-1"
                label="Record absolu"
                value={tierName(data.profile.allTimeBestTier)}
                sub={data.profile.allTimeBestElo !== null ? `${fmtInt(data.profile.allTimeBestElo)} points` : undefined}
              />
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

            <div className="mt-4 grid gap-4 lg:grid-cols-12">
              <RankedProgressCard
                className="lg:col-span-8"
                subtitle="Points enregistrés par le dashboard, ou marches du rang lues dans tes parties."
                profile={data.profile}
                timeline={data.timeline}
                height={260}
              />
              <Card className="lg:col-span-4">
                <CardHeader title="Rang suivant" subtitle="Seuils estimés : 500 points par rang" />
                {data.profile.nextTier !== null && data.profile.pointsToNext !== null ? (
                  <NextTierProgress elo={data.profile.elo} next={data.profile} />
                ) : (
                  <EmptyState title="Seuil inconnu pour ce rang">Il apparaîtra quand tes points seront disponibles.</EmptyState>
                )}
                {data.profile.avgEloPerSet !== null && (
                  <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[13px]">
                    <div>
                      <dt className="text-ink-2">Points par set</dt>
                      <dd className="font-medium">
                        <EloChange value={Math.round(data.profile.avgEloPerSet)} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-2">Sets mesurés</dt>
                      <dd className="font-medium tnum">{data.recentSets.filter((set) => set.eloChange !== null).length}</dd>
                    </div>
                  </dl>
                )}
              </Card>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Par brawler" subtitle="Clique sur une colonne pour trier" />
                <BreakdownTable rows={data.byBrawler} kind="brawler" showStar showElo playerSlug={slug} />
              </Card>
              <Card>
                <CardHeader title="Par map" />
                <BreakdownTable rows={data.byMap} kind="map" showElo />
              </Card>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Brawlers adverses" subtitle="Ton winrate quand tu les affrontes (2 manches min.)" />
                <BreakdownTable rows={data.vsBrawlers} kind="opponent" />
              </Card>
              <Card>
                <CardHeader title="Par mode" />
                <BreakdownTable rows={data.byMode} kind="mode" showElo />
              </Card>
            </div>

            <Card className="mt-4">
              <CardHeader
                title="Avec tes coéquipiers"
                subtitle="Ton winrate avec chaque coéquipier régulier, comparé à tes parties sans lui, et vos meilleurs duos"
              />
              <DuoTable rows={data.duos} />
            </Card>

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

function DuoTable({ rows }: { rows: DuoRow[] }) {
  const columns: Column<DuoRow>[] = [
    {
      key: 'name',
      header: 'Coéquipier',
      render: (row) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium">{row.name}</span>
          <span className="block truncate text-[12px] text-ink-3">{row.tag}</span>
        </span>
      ),
      sort: (row) => row.name,
    },
    { key: 'games', header: 'Ensemble', align: 'right', render: (row) => row.games, sort: (row) => row.games },
    { key: 'winRate', header: 'Winrate ensemble', render: (row) => <Meter value={row.winRate} className="min-w-[120px]" />, sort: (row) => row.winRate },
    {
      key: 'without',
      header: 'Sans lui',
      align: 'right',
      wide: true,
      render: (row) => <span className="text-ink-2">{fmtPct(row.withoutWinRate)}</span>,
      sort: (row) => row.withoutWinRate,
    },
    {
      key: 'gap',
      header: 'Écart',
      align: 'right',
      render: (row) => {
        const gap = row.winRate !== null && row.withoutWinRate !== null ? row.winRate - row.withoutWinRate : null;
        return <Delta value={gap}>{fmtPts(gap)}</Delta>;
      },
      sort: (row) => (row.winRate !== null && row.withoutWinRate !== null ? row.winRate - row.withoutWinRate : null),
    },
    { key: 'elo', header: 'Points', align: 'right', wide: true, render: (row) => <EloChange value={row.eloNet} />, sort: (row) => row.eloNet },
    {
      key: 'pairs',
      header: 'Meilleurs duos',
      wide: true,
      render: (row) =>
        row.pairs.length ? (
          <span className="flex flex-col gap-1">
            {row.pairs.map((pair) => (
              <span key={`${pair.myId}-${pair.allyId}`} className="flex items-center gap-1.5 text-[12px]" title={`${pair.myName} + ${pair.allyName}`}>
                <BrawlerAvatar id={pair.myId} name={pair.myName} size={20} />
                <span className="text-ink-3">+</span>
                <BrawlerAvatar id={pair.allyId} name={pair.allyName} size={20} />
                <span className="font-medium tnum">{fmtPct(pair.winRate)}</span>
                <span className="text-ink-3 tnum">{pair.wins}–{pair.losses}</span>
              </span>
            ))}
          </span>
        ) : (
          <span className="text-[12px] text-ink-3">2 parties min. par duo</span>
        ),
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.tag}
      initialSort={{ key: 'games', desc: true }}
      empty="Aucun coéquipier retrouvé à plusieurs occasions sur la période."
    />
  );
}
