import { useState } from 'react';
import { CATEGORY_LABELS, modeLabel, type BattleCategory } from '../../../shared/labels';
import { BrawlerAvatar } from '../components/avatars';
import { BattleRow } from '../components/battles';
import { BreakdownTable } from '../components/tables';
import {
  Button,
  Card,
  CardHeader,
  DocLink,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  PageHeader,
  Refetching,
  Segmented,
  Select,
  StatTile,
} from '../components/ui';
import { Download } from 'lucide-react';
import { exportUrl, useBattleList, useBattleStats } from '../lib/api';
import { fmtDateTime, fmtDuration, fmtInt, fmtPct, fmtSigned, plural } from '../lib/format';
import { useNow, usePlayerSlug, useSearchParam } from '../lib/hooks';

const PERIODS = [
  { value: '24h', label: '24 h' },
  { value: '7d', label: '7 j' },
  { value: '30d', label: '30 j' },
  { value: '90d', label: '90 j' },
  { value: 'all', label: 'Tout' },
] as const;
type BattlePeriod = (typeof PERIODS)[number]['value'];

const CATEGORIES: { value: BattleCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'Tout' },
  ...(Object.entries(CATEGORY_LABELS) as [BattleCategory, string][]).map(([value, label]) => ({ value, label })),
];

export function BattlesPage() {
  const slug = usePlayerSlug();
  const now = useNow();
  const [period, setPeriod] = useSearchParam<BattlePeriod>('period', '7d', ['24h', '7d', '30d', '90d', 'all']);
  const [category, setCategory] = useSearchParam<BattleCategory | 'all'>('type', 'all', ['all', 'ranked', 'trophies', 'friendly', 'other']);
  const [mode, setMode] = useSearchParam<string>('mode', '');
  const [brawler, setBrawler] = useSearchParam<string>('brawler', '');
  const [map, setMap] = useSearchParam<string>('map', '');
  const [limit, setLimit] = useState(30);

  const filters = { period, category, mode: mode || null, brawler: brawler || null, map: map || null };
  const stats = useBattleStats(slug, filters);
  const list = useBattleList(slug, filters, limit);

  if (stats.isLoading) return <LoadingState />;
  if (stats.error || !stats.data) return <ErrorState error={stats.error} />;
  const data = stats.data;
  const { summary, options } = data;
  const hasFilters = category !== 'all' || mode || brawler || map;

  return (
    <>
      <PageHeader
        title="Combats"
        subtitle="Toutes tes parties enregistrées, à filtrer et à décortiquer."
        action={
          <>
            <DocLink section="combats" />
            <a href={exportUrl(slug, 'combats.csv')} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[13px] font-medium text-accent hover:bg-accent-soft">
              <Download className="size-4" /> Exporter en CSV
            </a>
          </>
        }
      />
      <FilterBar>
        <Segmented label="Période" value={period} onChange={setPeriod} options={PERIODS} />
        <Segmented label="Type de combat" value={category} onChange={setCategory} options={CATEGORIES} />
        <Select
          label="Mode"
          value={mode}
          onChange={(value) => setMode(value || null)}
          options={[{ value: '', label: 'Tous les modes' }, ...options.modes.map((m) => ({ value: m.key, label: modeLabel(m.key) }))]}
        />
        <Select
          label="Brawler"
          value={brawler}
          onChange={(value) => setBrawler(value || null)}
          options={[{ value: '', label: 'Tous les brawlers' }, ...options.brawlers.map((b) => ({ value: String(b.id), label: b.name }))]}
        />
        <Select
          label="Map"
          value={map}
          onChange={(value) => setMap(value || null)}
          options={[{ value: '', label: 'Toutes les maps' }, ...options.maps.map((m) => ({ value: m, label: m }))]}
        />
        {hasFilters && (
          <Button
            variant="ghost"
            onClick={() => {
              setCategory(null);
              setMode(null);
              setBrawler(null);
              setMap(null);
            }}
          >
            Réinitialiser
          </Button>
        )}
      </FilterBar>

      <Refetching active={stats.isPlaceholderData}>
        {summary.games === 0 ? (
          <Card>
            <EmptyState title="Aucun combat ne correspond">Élargis la période ou retire des filtres.</EmptyState>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6">
              <StatTile label="Parties" value={fmtInt(summary.games)} sub={`${summary.wins} V · ${summary.losses} D${summary.draws ? ` · ${summary.draws} N` : ''}`} />
              <StatTile label="Winrate" value={fmtPct(summary.winRate, 1)} />
              <StatTile label="Star player" value={fmtPct(summary.starPlayerRate)} sub="en 3c3" />
              <StatTile label="Trophées nets" value={fmtSigned(summary.trophyNet)} />
              <StatTile label="Durée moyenne" value={fmtDuration(summary.avgDuration)} />
              <StatTile label="Meilleure série" value={plural(summary.longestWinStreak, 'victoire')} sub="d’affilée" />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Par mode" />
                <BreakdownTable rows={data.byMode} kind="mode" showTrophies />
              </Card>
              <Card>
                <CardHeader title="Par brawler" />
                <BreakdownTable rows={data.byBrawler} kind="brawler" showStar playerSlug={slug} />
              </Card>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Par map" />
                <BreakdownTable rows={data.byMap} kind="map" showTrophies />
              </Card>
              <Card>
                <CardHeader title="Brawlers adverses" subtitle="Ton winrate face à eux (3 parties min.)" />
                <BreakdownTable rows={data.vsBrawlers} kind="opponent" />
              </Card>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Coéquipiers réguliers" subtitle="Joueurs retrouvés à plusieurs occasions" />
                <BreakdownTable rows={data.allies} kind="ally" empty="Aucun coéquipier régulier sur la période." />
              </Card>
              <Card>
                <CardHeader title="Sessions" subtitle="Une session = des parties espacées de moins de 30 min" />
                <ul className="-my-1 divide-y divide-line">
                  {data.sessions.slice(0, 8).map((session) => (
                    <li key={session.start} className="flex items-center gap-3 py-2.5 text-[13px]">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{fmtDateTime(session.start)}</div>
                        <div className="text-ink-2">
                          {plural(session.games, 'partie')} · {session.wins} V – {session.losses} D
                        </div>
                      </div>
                      <div className="hidden -space-x-1.5 sm:flex">
                        {session.brawlers.slice(0, 4).map((b) => (
                          <span key={b.id} className="rounded-[26%] ring-2 ring-surface">
                            <BrawlerAvatar id={b.id} name={b.name} size={24} />
                          </span>
                        ))}
                      </div>
                      <span
                        className={
                          session.trophyNet > 0 ? 'w-12 text-right font-medium text-good tnum' : session.trophyNet < 0 ? 'w-12 text-right font-medium text-bad tnum' : 'w-12 text-right text-ink-3 tnum'
                        }
                      >
                        {session.trophyNet ? fmtSigned(session.trophyNet) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            <Card className="mt-4">
              <CardHeader title="Historique" subtitle={`${plural(list.data?.total ?? summary.games, 'combat')} · touche une ligne pour voir les équipes`} />
              <ul>
                {(list.data?.items ?? []).map((battle) => (
                  <BattleRow key={battle.id} battle={battle} now={now} />
                ))}
              </ul>
              {list.data && list.data.total > list.data.items.length && (
                <div className="mt-3 flex justify-center">
                  <Button onClick={() => setLimit(limit + 50)} loading={list.isFetching}>
                    Afficher plus
                  </Button>
                </div>
              )}
            </Card>
          </>
        )}
      </Refetching>
    </>
  );
}
