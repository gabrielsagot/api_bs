import clsx from 'clsx';
import { Link } from 'react-router';
import type { TrophyBrawlerRow } from '../../../shared/types';
import { BrawlerAvatar } from '../components/avatars';
import { ChartCard, DailyDeltaChart, TimeSeriesChart } from '../components/charts';
import { DataTable, type Column } from '../components/tables';
import {
  Card,
  CardHeader,
  Delta,
  ErrorState,
  FilterBar,
  LoadingState,
  Meter,
  PageHeader,
  Refetching,
  Segmented,
  StatTile,
} from '../components/ui';
import { useTrophies } from '../lib/api';
import { fmtDateTime, fmtDayKey, fmtInt, fmtSigned, plural } from '../lib/format';
import { usePlayerSlug, useSearchParam } from '../lib/hooks';

const PERIODS = [
  { value: '24h', label: '24 h' },
  { value: '7d', label: '7 j' },
  { value: '30d', label: '30 j' },
  { value: '90d', label: '90 j' },
  { value: 'all', label: 'Tout' },
] as const;

type TrophyPeriod = (typeof PERIODS)[number]['value'];

export function TrophiesPage() {
  const slug = usePlayerSlug();
  const [period, setPeriod] = useSearchParam<TrophyPeriod>('period', '30d', ['24h', '7d', '30d', '90d', 'all']);
  const { data, error, isLoading, isPlaceholderData } = useTrophies(slug, period);

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;

  const columns: Column<TrophyBrawlerRow>[] = [
    {
      key: 'name',
      header: 'Brawler',
      render: (row) => (
        <Link to={`/p/${slug}/brawlers/${row.id}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
          <BrawlerAvatar id={row.id} name={row.name} size={28} />
          <span className="truncate font-medium">{row.name}</span>
        </Link>
      ),
      sort: (row) => row.name,
    },
    { key: 'power', header: 'Niveau', align: 'right', wide: true, render: (row) => row.power, sort: (row) => row.power },
    { key: 'trophies', header: 'Trophées', align: 'right', render: (row) => fmtInt(row.trophies), sort: (row) => row.trophies },
    {
      key: 'delta',
      header: 'Variation',
      align: 'right',
      render: (row) => (
        <span className={clsx(!row.delta ? 'text-ink-3' : row.delta > 0 ? 'text-good' : 'text-bad')}>
          {row.delta === null ? '—' : fmtSigned(row.delta)}
        </span>
      ),
      sort: (row) => row.delta,
    },
    {
      key: 'highest',
      header: 'Record',
      align: 'right',
      wide: true,
      render: (row) => <span className="text-ink-2">{fmtInt(row.highestTrophies)}</span>,
      sort: (row) => row.highestTrophies,
    },
    { key: 'games', header: 'Parties', align: 'right', wide: true, render: (row) => row.games || '—', sort: (row) => row.games },
    {
      key: 'winRate',
      header: 'Winrate',
      wide: true,
      render: (row) => (row.games ? <Meter value={row.winRate} className="min-w-[110px]" /> : <span className="text-ink-3">—</span>),
      sort: (row) => row.winRate,
    },
  ];

  return (
    <>
      <PageHeader title="Trophées" subtitle="Ta progression sur le Trophy Road, jour après jour." />
      <FilterBar>
        <Segmented label="Période" value={period} onChange={setPeriod} options={PERIODS} />
      </FilterBar>
      <Refetching active={isPlaceholderData}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <StatTile label="Trophées" value={fmtInt(data.current)} />
          <StatTile
            label="Variation"
            value={<Delta value={data.delta}>{fmtSigned(data.delta)}</Delta>}
            sub="sur la période"
          />
          <StatTile label="Record" value={fmtInt(data.highest)} />
          <StatTile
            label="Parties de trophées"
            value={fmtInt(data.trophyGames.games)}
            sub={`${data.trophyGames.wins} V · ${data.trophyGames.losses} D`}
          />
          <StatTile
            label="Moyenne par partie"
            value={data.trophyGames.avgPerGame === null ? '—' : fmtSigned(data.trophyGames.avgPerGame, 1)}
            sub={`${fmtSigned(data.trophyGames.trophyNet)} au total`}
          />
        </div>

        <ChartCard
          className="mt-4"
          title="Évolution des trophées"
          subtitle="Chaque point est une mesure prise par le dashboard."
          table={{
            columns: ['Date', 'Trophées'],
            rows: [...data.series].reverse().map((p) => [fmtDateTime(p.t), fmtInt(p.v)]),
          }}
        >
          <TimeSeriesChart points={data.series} height={280} />
        </ChartCard>

        <ChartCard
          className="mt-4"
          title="Variation par jour"
          subtitle="Trophées gagnés ou perdus chaque jour"
          table={{
            columns: ['Jour', 'Variation', 'Total en fin de journée'],
            rows: [...data.daily].reverse().map((d) => [fmtDayKey(d.day), fmtSigned(d.delta), fmtInt(d.close)]),
          }}
        >
          <DailyDeltaChart days={data.daily} />
        </ChartCard>

        <Card className="mt-4">
          <CardHeader title="Par brawler" subtitle={`${plural(data.brawlers.length, 'brawler')} · variation sur la période`} />
          <DataTable
            rows={data.brawlers}
            columns={columns}
            rowKey={(row) => String(row.id)}
            limit={15}
            initialSort={{ key: 'trophies', desc: true }}
          />
        </Card>
      </Refetching>
    </>
  );
}
