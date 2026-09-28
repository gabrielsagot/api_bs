import { Check } from 'lucide-react';
import { Link } from 'react-router';
import type { GoalDto, SessionDto } from '../../../shared/types';
import { fmtDate, fmtDuration, fmtInt, fmtRelative, fmtSigned, plural } from '../lib/format';
import { BrawlerAvatar } from './avatars';
import { Card, CardHeader, EmptyState, ProgressBar } from './ui';

export function goalEta(goal: GoalDto): string {
  if (goal.achievedAt) return `Atteint le ${fmtDate(goal.achievedAt)}`;
  if (goal.etaDays !== null && goal.etaDate) {
    const days = Math.max(1, Math.round(goal.etaDays));
    return `À ce rythme : ~${plural(days, 'jour')} (${fmtDate(goal.etaDate)})`;
  }
  if (goal.ratePerDay !== null && goal.ratePerDay <= 0) return 'Pas de progression ces derniers jours';
  return 'Pas encore assez d’historique pour estimer une date';
}

export function GoalProgress({ goal }: { goal: GoalDto }) {
  const done = Boolean(goal.achievedAt);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[14px] font-medium">
          {done && <Check className="mr-1 inline size-4 text-good" aria-label="Atteint" />}
          {goal.label}
        </span>
        <span className="shrink-0 text-[13px] text-ink-2 tnum">
          {goal.kind === 'ranked_tier' ? `${Math.round(goal.progress * 100)} %` : `${fmtInt(goal.current)} / ${fmtInt(goal.target)}`}
        </span>
      </div>
      <div className="mt-2">
        <ProgressBar value={goal.progress} tone={done ? 'good' : 'accent'} />
      </div>
      <p className="mt-1.5 text-[12px] text-ink-2">{goalEta(goal)}</p>
    </div>
  );
}

export function GoalsCard({ goals, slug }: { goals: GoalDto[]; slug: string }) {
  return (
    <Card>
      <CardHeader
        title="Objectifs"
        action={
          <Link to={`/p/${slug}/objectifs`} className="text-[13px] font-medium text-accent hover:underline">
            Gérer
          </Link>
        }
      />
      {goals.length ? (
        <div className="space-y-5">
          {goals.map((goal) => (
            <GoalProgress key={goal.id} goal={goal} />
          ))}
        </div>
      ) : (
        <EmptyState title="Aucun objectif en cours">
          <Link to={`/p/${slug}/objectifs`} className="text-accent hover:underline">
            Fixe-toi un objectif
          </Link>{' '}
          : trophées, rang Ranked, brawler…
        </EmptyState>
      )}
    </Card>
  );
}

export function SessionCard({ session, now, title = 'Dernière session' }: { session: SessionDto | null; now: number; title?: string }) {
  if (!session) {
    return (
      <Card>
        <CardHeader title={title} />
        <EmptyState title="Aucune partie cette semaine" />
      </Card>
    );
  }
  const duration = (Date.parse(session.end) - Date.parse(session.start)) / 1000;
  return (
    <Card>
      <CardHeader title={title} subtitle={`${fmtRelative(session.end, now)} · ${fmtDuration(duration + 150)}`} />
      <div className="flex items-baseline gap-2">
        <span className="text-[28px] font-semibold leading-none tracking-[-0.02em]">
          {session.wins}
          <span className="text-ink-3"> – </span>
          {session.losses}
        </span>
        <span className="text-[13px] text-ink-2">sur {plural(session.games, 'partie')}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
        <div>
          <dt className="text-ink-2">Ranked</dt>
          <dd className="font-medium">{plural(session.rankedGames, 'manche')}</dd>
        </div>
        <div>
          <dt className="text-ink-2">Trophées</dt>
          <dd className={session.trophyNet > 0 ? 'font-medium text-good' : session.trophyNet < 0 ? 'font-medium text-bad' : 'font-medium'}>
            {fmtSigned(session.trophyNet)}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {session.brawlers.slice(0, 8).map((b) => (
          <span key={b.id} className="relative" title={`${b.name} · ${plural(b.games, 'partie')}`}>
            <BrawlerAvatar id={b.id} name={b.name} size={30} />
          </span>
        ))}
      </div>
    </Card>
  );
}
