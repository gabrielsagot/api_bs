import clsx from 'clsx';
import { Search } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { ComparePlayerDto } from '../../../shared/types';
import { BrawlerAvatar, PlayerIcon } from '../components/avatars';
import { PlayerName, TierLabel } from '../components/bs';
import { MultiSeriesChart } from '../components/charts';
import {
  Card,
  CardHeader,
  DocLink,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Refetching,
  Segmented,
} from '../components/ui';
import { useCompare, usePlayers } from '../lib/api';
import { seriesColor } from '../lib/colors';
import { fmtInt, fmtPct, fmtSigned } from '../lib/format';

const MAX_SELECTED = 4;

interface Metric {
  label: string;
  value: (p: ComparePlayerDto) => number | null;
  format: (v: number | null) => ReactNode;
}

const METRICS: Metric[] = [
  { label: 'Trophées', value: (p) => p.trophies, format: fmtInt },
  { label: 'Record', value: (p) => p.highestTrophies, format: fmtInt },
  { label: 'Variation sur 7 j', value: (p) => p.trophyDelta7d, format: (v) => fmtSigned(v) },
  { label: 'Rang Ranked', value: (p) => p.rankedTier, format: (v) => (v === null ? '—' : <TierLabel tier={v} size={16} className="justify-end" />) },
  { label: 'Points Ranked', value: (p) => p.rankedElo, format: fmtInt },
  { label: 'Winrate Ranked · 30 j', value: (p) => p.rankedWinRate30d, format: (v) => fmtPct(v, 1) },
  { label: 'Parties sur 7 j', value: (p) => p.games7d.games, format: fmtInt },
  { label: 'Winrate sur 7 j', value: (p) => p.games7d.winRate, format: (v) => fmtPct(v, 1) },
  { label: 'Niveau', value: (p) => p.expLevel, format: fmtInt },
  { label: 'Brawlers débloqués', value: (p) => p.brawlersOwned, format: fmtInt },
  { label: 'Brawlers niveau 11', value: (p) => p.power11, format: fmtInt },
  { label: 'Victoires 3v3', value: (p) => p.victories3v3, format: fmtInt },
  { label: 'Victoires en solo', value: (p) => p.soloVictories, format: fmtInt },
  { label: 'Victoires en duo', value: (p) => p.duoVictories, format: fmtInt },
];

export function ComparePage() {
  const players = usePlayers();
  const [selected, setSelected] = useState<string[] | null>(null);
  const [mode, setMode] = useState<'absolute' | 'relative'>('relative');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const all = players.data ?? [];
  const chosen = selected ?? all.slice(0, MAX_SELECTED).map((p) => p.slug);
  const compare = useCompare(chosen);

  const brawlers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (compare.data?.brawlers ?? []).filter((b) => !query || b.name.toLowerCase().includes(query));
  }, [compare.data, search]);

  if (players.isLoading || compare.isLoading) return <LoadingState />;
  if (all.length < 2) {
    return (
      <>
        <PageHeader title="Comparer" />
        <Card>
          <EmptyState title="Il faut au moins deux joueurs">
            Ajoute tes autres comptes ou tes potes dans les{' '}
            <Link to="/reglages" className="text-accent hover:underline">
              Réglages
            </Link>{' '}
            pour les comparer.
          </EmptyState>
        </Card>
      </>
    );
  }
  if (compare.error || !compare.data) return <ErrorState error={compare.error} />;

  const data = compare.data;
  const toggle = (slug: string) => {
    const next = chosen.includes(slug) ? chosen.filter((s) => s !== slug) : [...chosen, slug].slice(-MAX_SELECTED);
    if (next.length) setSelected(next);
  };
  const best = (metric: Metric) => {
    const values = data.players.map(metric.value).filter((v): v is number => v !== null);
    return values.length > 1 ? Math.max(...values) : null;
  };
  const visibleBrawlers = showAll ? brawlers : brawlers.slice(0, 20);

  return (
    <>
      <PageHeader title="Comparer" subtitle="Tes comptes et ceux de tes potes, côte à côte." action={<DocLink section="comparer" />} />
      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Joueurs comparés">
        {all.map((p) => {
          const active = chosen.includes(p.slug);
          return (
            <button
              key={p.slug}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(p.slug)}
              className={clsx(
                'inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[13px] font-medium ring-1 transition-colors',
                active ? 'bg-surface text-ink ring-black/10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]' : 'bg-transparent text-ink-3 ring-line hover:text-ink',
              )}
            >
              <PlayerIcon iconId={p.iconId} name={p.name} size={24} />
              <PlayerName name={p.name} color={p.nameColor} nameStyle={p.nameStyle} minContrast={2.5} className={active ? undefined : 'opacity-60'} />
              <span className="size-2 rounded-full" style={{ background: active ? seriesColor(p.colorSlot) : '#d2d2d7' }} aria-hidden />
            </button>
          );
        })}
      </div>

      <Refetching active={compare.isPlaceholderData}>
        <Card>
          <CardHeader title="En chiffres" subtitle="La meilleure valeur de chaque ligne est en gras" />
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[480px] text-[14px]">
              <thead>
                <tr>
                  <th className="px-2 pb-3 text-left text-[12px] font-medium text-ink-3" />
                  {data.players.map((p) => (
                    <th key={p.slug} className="px-2 pb-3 text-right text-[13px] font-semibold">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-[2px] w-3 rounded-full" style={{ background: seriesColor(p.colorSlot) }} aria-hidden />
                        <PlayerName name={p.name} color={p.nameColor} nameStyle={p.nameStyle} minContrast={2.5} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((metric) => {
                  const top = best(metric);
                  return (
                    <tr key={metric.label} className="border-t border-line">
                      <td className="px-2 py-2 text-[13px] text-ink-2">{metric.label}</td>
                      {data.players.map((p) => {
                        const value = metric.value(p);
                        return (
                          <td key={p.slug} className={clsx('px-2 py-2 text-right tnum', top !== null && value === top ? 'font-semibold text-ink' : 'text-ink-2')}>
                            {metric.format(value)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="mt-4">
          <CardHeader
            title="Trophées sur 30 jours"
            subtitle={mode === 'relative' ? 'Progression depuis le début de la période' : 'Valeurs absolues'}
            action={
              <Segmented
                label="Échelle"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'relative', label: 'Progression' },
                  { value: 'absolute', label: 'Absolu' },
                ]}
              />
            }
          />
          <MultiSeriesChart
            relative={mode === 'relative'}
            series={data.players.map((p) => ({ key: p.slug, label: p.name, color: seriesColor(p.colorSlot), points: p.series }))}
          />
        </Card>

        <Card className="mt-4">
          <CardHeader
            title="Brawler par brawler"
            subtitle="Trophées de chacun, le meilleur en gras"
            action={
              <label className="relative flex items-center">
                <Search className="pointer-events-none absolute left-2.5 size-3.5 text-ink-3" />
                <span className="sr-only">Rechercher un brawler</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher"
                  className="h-[31px] w-36 rounded-[10px] bg-[#e9e9ee] pl-8 pr-3 text-[13px] outline-none placeholder:text-ink-3"
                />
              </label>
            }
          />
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-[13px] tnum">
              <thead>
                <tr>
                  <th className="px-2 pb-2 text-left text-[12px] font-medium text-ink-3">Brawler</th>
                  {data.players.map((p) => (
                    <th key={p.slug} className="px-2 pb-2 text-right text-[12px] font-medium text-ink-3">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleBrawlers.map((b) => {
                  const top = Math.max(...b.values.map((v) => v ?? -1));
                  return (
                    <tr key={b.id} className="border-t border-line">
                      <td className="px-2 py-1.5">
                        <span className="flex items-center gap-2">
                          <BrawlerAvatar id={b.id} name={b.name} size={24} />
                          <span className="truncate font-medium">{b.name}</span>
                        </span>
                      </td>
                      {b.values.map((value, index) => (
                        <td key={data.players[index].slug} className={clsx('px-2 py-1.5 text-right', value === top && value !== null ? 'font-semibold' : 'text-ink-2')}>
                          {value === null ? '—' : fmtInt(value)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {brawlers.length > visibleBrawlers.length && (
            <button type="button" onClick={() => setShowAll(true)} className="mt-2 text-[13px] font-medium text-accent hover:underline">
              Voir les {brawlers.length} brawlers
            </button>
          )}
        </Card>
      </Refetching>
    </>
  );
}
