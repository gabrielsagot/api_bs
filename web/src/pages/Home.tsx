import { Link } from 'react-router';
import { tierName } from '../../../shared/labels';
import type { StreakDto } from '../../../shared/types';
import { SetRow } from '../components/battles';
import { GoalsCard, SessionCard } from '../components/cards';
import { ChartCard, Sparkline, TierChart } from '../components/charts';
import { BreakdownTable } from '../components/tables';
import { Card, CardHeader, Delta, EmptyState, ErrorState, LoadingState, PageHeader, Refetching, StatTile } from '../components/ui';
import { useOverview } from '../lib/api';
import { fmtDateTime, fmtInt, fmtPct, fmtPts, fmtSigned } from '../lib/format';
import { useNow, usePlayerSlug } from '../lib/hooks';

export function streakLabel(streak: StreakDto, unit: 'set' | 'manche'): { value: string; sub: string } {
  if (!streak.kind || streak.count === 0) return { value: '—', sub: 'aucune série' };
  const words = { win: ['victoire', 'victoires'], loss: ['défaite', 'défaites'], draw: ['égalité', 'égalités'] }[streak.kind];
  return {
    value: `${streak.count} ${streak.count > 1 ? words[1] : words[0]}`,
    sub: unit === 'set' ? 'en sets, d’affilée' : 'en manches, d’affilée',
  };
}

export function HomePage() {
  const slug = usePlayerSlug();
  const { data, error, isLoading, isPlaceholderData } = useOverview(slug);
  const now = useNow();
  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;

  const { player, ranked, trophies, lastSession, goals, collection } = data;
  const hasRanked = ranked.games.games > 0 || ranked.currentTier !== null;
  const winRateDelta =
    ranked.games.winRate !== null && ranked.previous.winRate !== null ? ranked.games.winRate - ranked.previous.winRate : null;
  const streak = streakLabel(ranked.streak, ranked.sets.detected ? 'set' : 'manche');

  return (
    <Refetching active={isPlaceholderData}>
      <PageHeader
        title={player.name}
        subtitle={
          <>
            {player.tag}
            {player.clubName && ` · ${player.clubName}`}
            {player.expLevel !== null && ` · niveau ${player.expLevel}`}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="flex flex-col justify-between lg:col-span-5">
          <div className="text-[13px] font-medium text-ink-2">Rang Ranked</div>
          {hasRanked ? (
            <>
              <div className="mt-3 text-[44px] font-semibold leading-none tracking-[-0.03em] sm:text-[56px]">
                {tierName(ranked.currentTier)}
              </div>
              <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
                <div className="flex gap-1.5">
                  <dt className="text-ink-2">Meilleur sur 30 j</dt>
                  <dd className="font-medium">{tierName(ranked.bestTier)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-ink-2">Il y a 30 j</dt>
                  <dd className="font-medium">{tierName(ranked.startTier)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="mt-3 text-[15px] text-ink-2">
              Aucune partie classée enregistrée pour l’instant. Joue une partie en Ranked : elle apparaîtra ici à la prochaine
              collecte.
            </p>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-4 lg:col-span-7">
          <StatTile
            label="Winrate Ranked"
            value={fmtPct(ranked.games.winRate, 1)}
            delta={
              <Delta value={winRateDelta}>
                <span title="Écart avec les 30 jours précédents">{fmtPts(winRateDelta)}</span>
              </Delta>
            }
            sub={`${ranked.games.wins} V · ${ranked.games.losses} D sur 30 j`}
          />
          <StatTile
            label="Sets gagnés"
            value={ranked.sets.detected ? `${ranked.sets.wins} / ${ranked.sets.games}` : fmtInt(ranked.games.wins)}
            sub={ranked.sets.detected ? `${fmtPct(ranked.sets.winRate)} sur 30 j` : 'manches gagnées sur 30 j'}
          />
          <StatTile label="Série en cours" value={streak.value} sub={streak.sub} />
          <StatTile
            label="Trophées"
            value={fmtInt(trophies.current)}
            delta={<Delta value={trophies.delta7d}>{fmtSigned(trophies.delta7d)}</Delta>}
            sub="sur 7 jours"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <ChartCard
          className="lg:col-span-7"
          title="Évolution du rang"
          subtitle="30 derniers jours"
          table={{
            columns: ['Date', 'Rang'],
            rows: [...ranked.timeline].reverse().map((p) => [fmtDateTime(p.t), tierName(p.tier)]),
          }}
        >
          <TierChart points={ranked.timeline} height={310} />
        </ChartCard>
        <Card className="lg:col-span-5">
          <CardHeader
            title="Derniers sets"
            action={
              <Link to={`/p/${slug}/ranked`} className="text-[13px] font-medium text-accent hover:underline">
                Tout voir
              </Link>
            }
          />
          {ranked.recentSets.length ? (
            <ul className="-my-1 divide-y divide-line">
              {ranked.recentSets.slice(0, 6).map((set) => (
                <SetRow key={set.id} set={set} now={now} compact />
              ))}
            </ul>
          ) : (
            <EmptyState title="Aucun set sur 30 jours" />
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Tes brawlers en Ranked" subtitle="Les plus joués sur 30 jours" />
          <BreakdownTable rows={ranked.topBrawlers} kind="brawler" limit={5} playerSlug={slug} />
        </Card>
        <Card>
          <CardHeader title="Tes maps en Ranked" subtitle="Les plus jouées sur 30 jours" />
          <BreakdownTable rows={ranked.topMaps} kind="map" limit={5} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SessionCard session={lastSession} now={now} />
        <GoalsCard goals={goals} slug={slug} />
        <Card>
          <CardHeader
            title="Trophées"
            subtitle="7 derniers jours"
            action={
              <Link to={`/p/${slug}/trophees`} className="text-[13px] font-medium text-accent hover:underline">
                Détails
              </Link>
            }
          />
          <div className="flex items-baseline gap-3">
            <span className="text-[28px] font-semibold leading-none tracking-[-0.02em]">{fmtInt(trophies.current)}</span>
            <Delta value={trophies.delta24h} className="text-[13px]">
              {fmtSigned(trophies.delta24h)} sur 24 h
            </Delta>
          </div>
          <div className="mt-4">
            <Sparkline points={trophies.series} height={48} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[13px]">
            <div>
              <dt className="text-ink-2">Record</dt>
              <dd className="font-medium tnum">{fmtInt(trophies.highest)}</dd>
            </div>
            <div>
              <dt className="text-ink-2">Brawlers</dt>
              <dd className="font-medium tnum">
                {collection.owned}
                {collection.total !== null && ` / ${collection.total}`} · {collection.power11} niv. 11
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </Refetching>
  );
}
