import clsx from 'clsx';
import { Check, ChevronLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { rarityLabel } from '../../../shared/labels';
import type { AccessoryDto } from '../../../shared/types';
import { BrawlerAvatar } from '../components/avatars';
import { BattleRow } from '../components/battles';
import { ChartCard, TimeSeriesChart } from '../components/charts';
import { BreakdownTable } from '../components/tables';
import { Card, CardHeader, EmptyState, ErrorState, LoadingState, Pill, Refetching, StatTile } from '../components/ui';
import { useBrawler } from '../lib/api';
import { fmtDateTime, fmtInt, fmtPct, fmtSigned, plural } from '../lib/format';
import { useNow, usePlayerSlug } from '../lib/hooks';

function Equipment({ title, items, emptyText }: { title: string; items: AccessoryDto[]; emptyText: string }) {
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-medium text-ink-2">{title}</h3>
      {items.length ? (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-[14px]">
              <span
                className={clsx('grid size-5 shrink-0 place-items-center rounded-full', item.owned ? 'bg-good-soft text-good' : 'bg-fill text-ink-3')}
                aria-label={item.owned ? 'Possédé' : 'Manquant'}
              >
                {item.owned ? <Check className="size-3" strokeWidth={3} /> : <span className="size-1.5 rounded-full bg-current" />}
              </span>
              <span className={clsx('truncate', !item.owned && 'text-ink-2')}>{item.name}</span>
              {item.level !== null && <span className="ml-auto text-[12px] text-ink-3">niv. {item.level}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-3">{emptyText}</p>
      )}
    </div>
  );
}

export function BrawlerDetailPage() {
  const slug = usePlayerSlug();
  const { id = '' } = useParams();
  const now = useNow();
  const { data, error, isLoading, isPlaceholderData } = useBrawler(slug, id);

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;
  const { card, stats } = data;
  const totalCost = data.costLines.reduce(
    (sum, line) => ({ coins: sum.coins + line.coins, powerPoints: sum.powerPoints + line.powerPoints }),
    { coins: 0, powerPoints: 0 },
  );

  return (
    <Refetching active={isPlaceholderData}>
      <Link to={`/p/${slug}/brawlers`} className="mb-4 inline-flex items-center gap-0.5 text-[14px] font-medium text-accent hover:underline">
        <ChevronLeft className="size-4" /> Brawlers
      </Link>
      <header className="mb-6 flex items-center gap-4">
        <BrawlerAvatar id={card.id} name={card.name} size={72} muted={!card.owned} />
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[32px]">{card.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {card.owned ? <Pill tone="accent">Niveau {card.power}</Pill> : <Pill>À débloquer</Pill>}
            {card.rarity && <Pill>{rarityLabel(card.rarity)}</Pill>}
            {card.prestige ? <Pill>Prestige {card.prestige}</Pill> : null}
            {card.cost?.maxed && <Pill tone="good">Complet</Pill>}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Trophées" value={fmtInt(card.trophies)} sub={card.highestTrophies !== null ? `record ${fmtInt(card.highestTrophies)}` : undefined} />
        <StatTile label="Parties enregistrées" value={fmtInt(stats.games)} sub={`${stats.wins} V · ${stats.losses} D`} />
        <StatTile label="Winrate" value={fmtPct(stats.winRate, 1)} sub={`star player ${fmtPct(stats.starPlayerRate)}`} />
        <StatTile
          label="Trophées nets"
          value={fmtSigned(stats.trophyNet)}
          sub={card.maxWinStreak !== null ? `série max. ${card.maxWinStreak}` : 'sur les parties enregistrées'}
        />
      </div>

      <ChartCard
        className="mt-4"
        title="Trophées dans le temps"
        table={{ columns: ['Date', 'Trophées'], rows: [...data.history].reverse().map((p) => [fmtDateTime(p.t), fmtInt(p.v)]) }}
      >
        <TimeSeriesChart points={data.history} emptyText="Pas encore d’évolution enregistrée pour ce brawler." />
      </ChartCard>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Par mode" />
          <BreakdownTable rows={data.byMode} kind="mode" showTrophies empty="Aucune partie enregistrée avec ce brawler." />
        </Card>
        <Card>
          <CardHeader title="Par map" />
          <BreakdownTable rows={data.byMap} kind="map" showTrophies empty="Aucune partie enregistrée avec ce brawler." />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Équipement" />
          <div className="grid gap-5 sm:grid-cols-2">
            <Equipment title="Gadgets" items={card.gadgets} emptyText="Aucun gadget connu." />
            <Equipment title="Star powers" items={card.starPowers} emptyText="Aucune star power connue." />
            <Equipment title="Hypercharge" items={card.hyperCharges} emptyText="Pas d’hypercharge connue." />
            <Equipment title="Gears" items={card.gears} emptyText="Aucun gear équipé." />
            {card.buffies && (
              <Equipment
                title="Buffies"
                emptyText=""
                items={(
                  [
                    ['gadget', 'Gadget'],
                    ['starPower', 'Star power'],
                    ['hyperCharge', 'Hypercharge'],
                  ] as const
                ).map(([key, name], index) => ({ id: index, name, owned: card.buffies![key], level: null }))}
              />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Coût restant"
            subtitle={card.owned ? 'Niveaux, gadgets, star powers et hypercharge manquants' : 'Brawler pas encore débloqué'}
          />
          {data.costLines.length ? (
            <table className="w-full text-[13px] tnum">
              <thead>
                <tr className="text-[12px] text-ink-3">
                  <th className="pb-2 text-left font-medium">Étape</th>
                  <th className="pb-2 text-right font-medium">Pièces</th>
                  <th className="pb-2 text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody>
                {data.costLines.map((line) => (
                  <tr key={line.label} className="border-t border-line">
                    <td className="py-1.5 pr-2 text-ink-2">{line.label}</td>
                    <td className="py-1.5 text-right">{fmtInt(line.coins)}</td>
                    <td className="py-1.5 text-right">{line.powerPoints ? fmtInt(line.powerPoints) : '—'}</td>
                  </tr>
                ))}
                <tr className="border-t border-line-strong font-semibold">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right">{fmtInt(totalCost.coins)}</td>
                  <td className="py-2 text-right">{fmtInt(totalCost.powerPoints)}</td>
                </tr>
              </tbody>
            </table>
          ) : card.owned ? (
            <EmptyState title="Rien à acheter : ce brawler est au maximum." />
          ) : (
            <EmptyState title="Débloque-le d’abord" />
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Dernières parties" subtitle={plural(data.recent.length, 'partie')} />
        {data.recent.length ? (
          <ul>
            {data.recent.map((battle) => (
              <BattleRow key={battle.id} battle={battle} now={now} />
            ))}
          </ul>
        ) : (
          <EmptyState title="Aucune partie enregistrée avec ce brawler" />
        )}
      </Card>
    </Refetching>
  );
}
