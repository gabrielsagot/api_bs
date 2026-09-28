import clsx from 'clsx';
import { RefreshCw } from 'lucide-react';
import { BrawlerAvatar } from '../components/avatars';
import { BattleRow, SetRow } from '../components/battles';
import { TierLabel } from '../components/bs';
import { NextTierProgress } from '../components/ranked';
import { streakLabel } from './Home';
import { Button, Card, CardHeader, DocLink, EmptyState, ErrorState, LoadingState, PageHeader, Refetching, StatTile } from '../components/ui';
import { useLiveSession, useRefresh, useStatus } from '../lib/api';
import type { WinLoss } from '../../../shared/types';
import { fmtDuration, fmtInt, fmtPct, fmtRelative, fmtSigned, fmtTime, plural } from '../lib/format';
import { useNow, usePlayerSlug } from '../lib/hooks';

/**
 * Session en direct : l'écran à garder sur le téléphone pendant qu'on joue.
 * Il se rafraîchit tout seul ; la collecte passe à toutes les 2 min dès qu'une partie est détectée.
 */
/** « 3 sur 4 » : victoires en grand, total en plus discret. */
function WonOf({ wins, total }: { wins: number; total: number }) {
  return (
    <>
      {fmtInt(wins)}
      <span className="text-[0.6em] font-medium text-ink-3"> sur {fmtInt(total)}</span>
    </>
  );
}

/** Sous-titre des sets : défaites, taux de sets gagnés, sets en cours. */
function setsSub(sets: WinLoss, ongoing: number): string {
  if (!sets.games) return ongoing ? 'Set en cours, pas encore terminé' : 'Aucun set Ranked terminé';
  const parts = [plural(sets.losses, 'perdu', 'perdus'), `${fmtPct(sets.winRate)} gagnés`];
  if (ongoing) parts.push(plural(ongoing, 'en cours', 'en cours'));
  return parts.join(' · ');
}

export function LivePage() {
  const slug = usePlayerSlug();
  const now = useNow(10_000);
  const { data, error, isLoading, isPlaceholderData } = useLiveSession(slug);
  const refresh = useRefresh();
  const status = useStatus().data;

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;

  const streak = streakLabel(data.streak, data.sets.games ? 'set' : 'manche');
  const ongoingSets = data.recentSets.filter((set) => set.outcome === 'ongoing').length;
  const running = refresh.isPending || status?.poller.running;

  return (
    <Refetching active={isPlaceholderData}>
      <PageHeader
        title="En direct"
        subtitle={
          data.start ? (
            <span className="inline-flex items-center gap-2">
              <span
                className={clsx('size-2 rounded-full', data.active ? 'bg-good' : 'bg-line-strong')}
                aria-hidden
              />
              {data.active
                ? `Session en cours depuis ${fmtTime(data.start)} (${fmtDuration((now - Date.parse(data.start)) / 1000)})`
                : `Dernière session : ${fmtRelative(data.end, now)}`}
            </span>
          ) : (
            'Aucune partie cette semaine.'
          )
        }
        action={
          <>
            <DocLink section="en-direct" />
            {!status?.demo && (
              <Button onClick={() => refresh.mutate(undefined)} loading={running} icon={<RefreshCw className="size-4" />}>
                Actualiser
              </Button>
            )}
          </>
        }
      />

      <Card>
        <div className="text-[13px] font-medium text-ink-2">Points Ranked sur la session</div>
        <div
          className={clsx(
            'mt-2 text-[56px] font-semibold leading-none tracking-[-0.03em]',
            data.eloDelta === null ? 'text-ink' : data.eloDelta > 0 ? 'text-good' : data.eloDelta < 0 ? 'text-bad' : 'text-ink',
          )}
        >
          {data.eloDelta === null ? '—' : fmtSigned(data.eloDelta)}
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[14px] text-ink-2">
          {data.eloNow !== null ? (
            <>
              <span>
                {data.eloStart !== null ? `${fmtInt(data.eloStart)} → ${fmtInt(data.eloNow)}` : fmtInt(data.eloNow)} points ·
              </span>
              <TierLabel tier={data.tier} size={18} className="font-medium text-ink" />
              {data.eloStart === null && <span>(le point de départ de la session n’a pas été mesuré)</span>}
            </>
          ) : (
            'Points indisponibles.'
          )}
        </p>
        {data.next.pointsToNext !== null && (
          <div className="mt-5 border-t border-line pt-4">
            <NextTierProgress elo={data.eloNow} next={data.next} />
          </div>
        )}
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile
          label="Sets gagnés"
          value={data.sets.games ? <WonOf wins={data.sets.wins} total={data.sets.games} /> : '—'}
          sub={setsSub(data.sets, ongoingSets)}
        />
        <StatTile
          label="Manches gagnées"
          value={data.ranked.games ? <WonOf wins={data.ranked.wins} total={data.ranked.games} /> : '—'}
          sub={
            data.ranked.games
              ? `${plural(data.ranked.losses, 'perdue', 'perdues')} · ${fmtPct(data.ranked.winRate)} gagnées`
              : 'Aucune manche Ranked'
          }
        />
        <StatTile label="Série" value={streak.value} sub={streak.sub} />
        <StatTile label="Trophées" value={fmtSigned(data.trophyNet)} sub={`${data.games.games} parties au total`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader
            title="Sets Ranked de la session"
            subtitle="Un set se joue en 3 manches maximum : le premier à 2 manches gagnées l’emporte. Points gagnés ou perdus quand ils sont mesurés."
          />
          {data.recentSets.length ? (
            <ul className="-my-1 divide-y divide-line">
              {data.recentSets.map((set) => (
                <SetRow key={set.id} set={set} now={now} compact />
              ))}
            </ul>
          ) : (
            <EmptyState title="Pas encore de set classé sur cette session" />
          )}
        </Card>
        <Card className="lg:col-span-5">
          <CardHeader title="Brawlers joués" />
          {data.brawlers.length ? (
            <ul className="space-y-2.5">
              {data.brawlers.map((b) => (
                <li key={b.id} className="flex items-center gap-2.5 text-[14px]">
                  <BrawlerAvatar id={b.id} name={b.name} size={30} />
                  <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
                  <span className="text-ink-2 tnum">
                    {b.wins} V · {b.losses} D
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Aucune partie" />
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Dernières parties"
          subtitle={data.lastPolledAt ? `Dernière collecte ${fmtRelative(data.lastPolledAt, now)}` : undefined}
        />
        {data.battles.length ? (
          <ul>
            {data.battles.map((battle) => (
              <BattleRow key={battle.id} battle={battle} now={now} />
            ))}
          </ul>
        ) : (
          <EmptyState title="Aucune partie" />
        )}
      </Card>
    </Refetching>
  );
}
