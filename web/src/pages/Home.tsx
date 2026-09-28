import { Link } from 'react-router';
import { tierName } from '../../../shared/labels';
import type { StreakDto } from '../../../shared/types';
import { SetRow } from '../components/battles';
import { GoalsCard, SessionCard } from '../components/cards';
import { Sparkline } from '../components/charts';
import { PlayerIcon, RankIcon } from '../components/avatars';
import { FameBadge, PlayerName, TierLabel } from '../components/bs';
import { NextTierProgress, RankedProgressCard } from '../components/ranked';
import { BreakdownTable } from '../components/tables';
import { Card, CardHeader, Delta, DocLink, EmptyState, ErrorState, LoadingState, PageHeader, Refetching, StatTile } from '../components/ui';
import { useOverview } from '../lib/api';
import { fmtInt, fmtPct, fmtPts, fmtSigned } from '../lib/format';
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
        action={<DocLink section="accueil" />}
        title={
          <span className="flex min-w-0 items-center gap-3">
            <PlayerIcon iconId={player.iconId} name={player.name} size={44} />
            <PlayerName name={player.name} color={player.nameColor} className="truncate" />
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-1.5">
            <span>{player.tag}</span>
            {player.clubName && <span>· {player.clubName}</span>}
            {player.expLevel !== null && <span>· niveau {player.expLevel}</span>}
            {player.fameTierName && (
              <>
                <span>·</span>
                <FameBadge name={player.fameTierName} fame={player.fame} />
              </>
            )}
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="flex flex-col justify-between lg:col-span-5">
          <div className="flex items-baseline justify-between gap-2 text-[13px] font-medium text-ink-2">
            <span>Rang Ranked</span>
            {ranked.profile.seasonId !== null && <span className="text-ink-3">Saison {ranked.profile.seasonId}</span>}
          </div>
          {hasRanked ? (
            <>
              <div className="mt-3 flex items-center gap-3 text-[36px] font-semibold leading-none tracking-[-0.03em] sm:text-[44px]">
                <RankIcon tier={ranked.currentTier} size={52} className="-my-1" />
                <span className="min-w-0 whitespace-nowrap">{tierName(ranked.currentTier)}</span>
              </div>
              {ranked.profile.elo !== null && (
                <div className="mt-3 flex flex-wrap items-baseline gap-x-2 text-[15px]">
                  <span className="font-semibold">{fmtInt(ranked.profile.elo)} points</span>
                  <Delta value={ranked.profile.eloDelta} className="text-[13px]">
                    {fmtSigned(ranked.profile.eloDelta)} sur 30 j
                  </Delta>
                </div>
              )}
              <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
                {ranked.profile.seasonBestElo !== null ? (
                  <>
                    <div className="flex gap-1.5">
                      <dt className="text-ink-2">Record saison</dt>
                      <dd className="font-medium">
                        <TierLabel
                          tier={ranked.profile.seasonBestTier}
                          size={16}
                          suffix={ranked.profile.seasonBestElo !== null ? ` · ${fmtInt(ranked.profile.seasonBestElo)}` : null}
                        />
                      </dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="text-ink-2">Record absolu</dt>
                      <dd className="font-medium">
                        <TierLabel
                          tier={ranked.profile.allTimeBestTier}
                          size={16}
                          suffix={ranked.profile.allTimeBestElo !== null ? ` · ${fmtInt(ranked.profile.allTimeBestElo)}` : null}
                        />
                      </dd>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex gap-1.5">
                      <dt className="text-ink-2">Meilleur sur 30 j</dt>
                      <dd className="font-medium">
                        <TierLabel tier={ranked.bestTier} size={16} />
                      </dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="text-ink-2">Il y a 30 j</dt>
                      <dd className="font-medium">
                        <TierLabel tier={ranked.startTier} size={16} />
                      </dd>
                    </div>
                  </>
                )}
              </dl>
              {ranked.profile.pointsToNext !== null && (
                <div className="mt-5 border-t border-line pt-4">
                  <NextTierProgress elo={ranked.profile.elo} next={ranked.profile} compact />
                </div>
              )}
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
        <RankedProgressCard
          className="lg:col-span-7"
          subtitle="30 derniers jours"
          profile={ranked.profile}
          timeline={ranked.timeline}
          height={310}
        />
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
