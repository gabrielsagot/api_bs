import clsx from 'clsx';
import { Check, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { rarityLabel } from '../../../shared/labels';
import type { AccessoryDto, BrawlerCardDto } from '../../../shared/types';
import { BrawlerAvatar } from '../components/avatars';
import { RarityTag } from '../components/bs';
import {
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
import { useCollection } from '../lib/api';
import { fmtCompact, fmtInt, fmtPct } from '../lib/format';
import { usePlayerSlug, useSearchParam } from '../lib/hooks';

type Ownership = 'all' | 'owned' | 'missing';
type SortKey = 'trophies' | 'power' | 'name' | 'cost' | 'winrate' | 'rarity' | 'streak';

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'trophies', label: 'Trier : trophées' },
  { value: 'power', label: 'Trier : niveau' },
  { value: 'cost', label: 'Trier : coût restant' },
  { value: 'winrate', label: 'Trier : winrate' },
  { value: 'rarity', label: 'Trier : rareté' },
  { value: 'streak', label: 'Trier : série max' },
  { value: 'name', label: 'Trier : nom' },
];

function sortValue(brawler: BrawlerCardDto, key: SortKey): number | string {
  switch (key) {
    case 'trophies':
      return brawler.trophies ?? -1;
    case 'power':
      return (brawler.power ?? -1) * 10_000 + (brawler.trophies ?? 0);
    case 'cost':
      return brawler.cost ? brawler.cost.coins : -1;
    case 'winrate':
      return brawler.games >= 3 ? (brawler.winRate ?? -1) : -1;
    case 'rarity':
      return (brawler.rarityRank ?? -1) * 10_000 + (brawler.trophies ?? 0);
    case 'streak':
      return brawler.maxWinStreak ?? -1;
    case 'name':
      return brawler.name;
  }
}

/** Petits points « possédé / manquant » (avec libellé accessible). */
function Dots({ items, label }: { items: AccessoryDto[]; label: string }) {
  if (!items.length) return null;
  const owned = items.filter((i) => i.owned).length;
  return (
    <span className="flex items-center gap-1" title={`${label} : ${owned}/${items.length}`}>
      <span className="text-[10px] font-semibold text-ink-3">{label}</span>
      {items.map((item) => (
        <span key={item.id} className={clsx('size-[7px] rounded-full', item.owned ? 'bg-ink' : 'bg-line-strong')} aria-hidden />
      ))}
      <span className="sr-only">
        {owned} sur {items.length}
      </span>
    </span>
  );
}

function BrawlerTile({ brawler, slug }: { brawler: BrawlerCardDto; slug: string }) {
  return (
    <Link
      to={`/p/${slug}/brawlers/${brawler.id}`}
      className="group flex flex-col rounded-[var(--radius-card)] bg-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ring-1 ring-black/[0.05] transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
    >
      <div className="flex items-start gap-3">
        <BrawlerAvatar id={brawler.id} name={brawler.name} size={48} muted={!brawler.owned} />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold leading-snug group-hover:underline">{brawler.name}</div>
          <div className="text-[12px] leading-tight text-ink-2">
            {brawler.owned && <div>Niv. {brawler.power}</div>}
            <RarityTag rarity={brawler.rarity} className="mt-0.5 max-w-full" />
          </div>
        </div>
      </div>
      {brawler.owned ? (
        <>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-[17px] font-semibold tnum">{fmtInt(brawler.trophies)}</span>
            {brawler.prestige ? <span className="text-[12px] text-ink-2">Prestige {brawler.prestige}</span> : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <Dots items={brawler.gadgets} label="G" />
            <Dots items={brawler.starPowers} label="SP" />
            <Dots items={brawler.hyperCharges} label="HC" />
          </div>
          <div className="mt-3 border-t border-line pt-2 text-[12px] text-ink-2">
            {brawler.cost?.maxed ? (
              <span className="inline-flex items-center gap-1 font-medium text-good">
                <Check className="size-3.5" /> Complet
              </span>
            ) : (
              <span>Reste {fmtCompact(brawler.cost?.coins ?? 0)} pièces</span>
            )}
          </div>
        </>
      ) : (
        <div className="mt-3 text-[13px] text-ink-3">À débloquer</div>
      )}
    </Link>
  );
}

export function BrawlersPage() {
  const slug = usePlayerSlug();
  const { data, error, isLoading, isPlaceholderData } = useCollection(slug);
  const [ownership, setOwnership] = useSearchParam<Ownership>('filtre', 'all', ['all', 'owned', 'missing']);
  const [sort, setSort] = useSearchParam<SortKey>('tri', 'trophies', ['trophies', 'power', 'name', 'cost', 'winrate', 'rarity', 'streak']);
  const [rarity, setRarity] = useSearchParam<string>('rarete', '');
  const [search, setSearch] = useState('');

  const rarities = useMemo(
    () =>
      [...new Map((data?.brawlers ?? []).filter((b) => b.rarity).map((b) => [b.rarity!, b.rarityRank ?? 0])).entries()]
        .sort((a, b) => a[1] - b[1])
        .map(([value]) => value),
    [data],
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.brawlers ?? [])
      .filter((b) => (ownership === 'owned' ? b.owned : ownership === 'missing' ? !b.owned : true))
      .filter((b) => !rarity || b.rarity === rarity)
      .filter((b) => !query || b.name.toLowerCase().includes(query))
      .sort((a, b) => {
        const va = sortValue(a, sort);
        const vb = sortValue(b, sort);
        if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb), 'fr');
        return vb - va || a.name.localeCompare(b.name, 'fr');
      });
  }, [data, ownership, rarity, search, sort]);

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;
  const { totals } = data;
  const ratio = (owned: number, total: number | null) => (total ? `${fmtInt(owned)} / ${fmtInt(total)}` : fmtInt(owned));

  return (
    <>
      <PageHeader title="Brawlers" subtitle="Ta collection, et ce qu’il reste à débloquer et à améliorer." action={<DocLink section="brawlers" />} />
      <Refetching active={isPlaceholderData}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6">
          <StatTile
            label="Brawlers"
            value={ratio(totals.owned, totals.total)}
            sub={totals.total ? `${fmtPct(totals.owned / totals.total)} de la collection` : undefined}
          />
          <StatTile label="Niveau 11" value={fmtInt(totals.power11)} sub={`dont ${fmtInt(totals.maxed)} complets`} />
          <StatTile label="Gadgets" value={ratio(totals.gadgets.owned, totals.gadgets.total)} />
          <StatTile label="Star powers" value={ratio(totals.starPowers.owned, totals.starPowers.total)} />
          <StatTile
            label="Hypercharges"
            value={ratio(totals.hyperCharges.owned, totals.hyperCharges.total)}
            sub={totals.buffies.total !== null ? `buffies : ${ratio(totals.buffies.owned, totals.buffies.total)}` : undefined}
          />
          <StatTile
            label="Pour tout maxer"
            value={`${fmtCompact(totals.coinsToMax)} pièces`}
            sub={`${fmtCompact(totals.powerPointsToMax)} points de puissance`}
          />
        </div>
        {data.catalogSource === 'profile' && (
          <p className="mt-3 text-[13px] text-ink-2">
            Catalogue complet indisponible pour l’instant : seuls tes brawlers débloqués sont listés.
          </p>
        )}

        {data.priorities.length > 0 && (
          <Card className="mt-4">
            <CardHeader
              title="À améliorer en priorité"
              subtitle="Tes brawlers les plus joués ces 60 derniers jours (le Ranked compte davantage) et les plus efficaces, avec leur prochaine étape"
            />
            <ul className="-my-1 divide-y divide-line">
              {data.priorities.map((row) => (
                <li key={row.brawlerId}>
                  <Link to={`/p/${slug}/brawlers/${row.brawlerId}`} className="flex items-center gap-3 py-2.5 hover:bg-fill/60">
                    <BrawlerAvatar id={row.brawlerId} name={row.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium">{row.name}</div>
                      <div className="truncate text-[12px] text-ink-2">
                        Niv. {row.power} · {row.games} parties{row.rankedGames ? ` (dont ${row.rankedGames} en Ranked)` : ''} · {fmtPct(row.winRate)}
                        {row.missingBuffies > 0 ? ` · ${row.missingBuffies} buffie${row.missingBuffies > 1 ? 's' : ''} à débloquer` : ''}
                      </div>
                    </div>
                    <div className="min-w-0 max-w-[45%] text-right">
                      <div className="truncate text-[13px] font-medium">{row.step}</div>
                      <div className="text-[12px] text-ink-2 tnum">
                        {fmtInt(row.stepCoins)} pièces{row.stepPowerPoints ? ` · ${fmtInt(row.stepPowerPoints)} PP` : ''}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="mt-6">
          <FilterBar>
            <label className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 size-3.5 text-ink-3" />
              <span className="sr-only">Rechercher un brawler</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher"
                className="h-[31px] w-44 rounded-[10px] bg-[#e9e9ee] pl-8 pr-3 text-[13px] outline-none placeholder:text-ink-3"
              />
            </label>
            <Segmented
              label="Filtrer"
              value={ownership}
              onChange={setOwnership}
              options={[
                { value: 'all', label: 'Tous' },
                { value: 'owned', label: 'Débloqués' },
                { value: 'missing', label: 'À débloquer' },
              ]}
            />
            <Select label="Tri" value={sort} onChange={(value) => setSort(value as SortKey)} options={SORTS} />
            {rarities.length > 0 && (
              <Select
                label="Rareté"
                value={rarity}
                onChange={(value) => setRarity(value || null)}
                options={[{ value: '', label: 'Toutes les raretés' }, ...rarities.map((r) => ({ value: r, label: rarityLabel(r) ?? r }))]}
              />
            )}
          </FilterBar>
        </div>

        {visible.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map((brawler) => (
              <BrawlerTile key={brawler.id} brawler={brawler} slug={slug} />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState title="Aucun brawler ne correspond" />
          </Card>
        )}
      </Refetching>
    </>
  );
}
