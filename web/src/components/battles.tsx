import clsx from 'clsx';
import { ChevronDown, Star } from 'lucide-react';
import { useState } from 'react';
import { battleTypeLabel, modeLabel, tierName } from '../../../shared/labels';
import type { BattleDto, ParticipantDto, RankedSetDto } from '../../../shared/types';
import { fmtDateTime, fmtDuration, fmtRelative, fmtSigned } from '../lib/format';
import { BrawlerAvatar, ModeIcon, RankIcon } from './avatars';
import { EloChange } from './ranked';
import { Pill, ResultBadge, SetBadge } from './ui';

/** Rangée de portraits d'une équipe. */
export function TeamStrip({ players, size = 24, highlightSelf = false }: { players: ParticipantDto[]; size?: number; highlightSelf?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      {players.map((p) => (
        <span key={p.tag} title={`${p.name} · ${p.brawlerName ?? '?'}`} className={clsx(highlightSelf && p.side === 'self' && 'rounded-[26%] ring-2 ring-accent ring-offset-1')}>
          <BrawlerAvatar id={p.brawlerId} name={p.brawlerName} size={size} />
        </span>
      ))}
    </span>
  );
}

/** Un set classé : score, brawler joué, map, compositions. */
export function SetRow({ set, now, compact = false }: { set: RankedSetDto; now: number; compact?: boolean }) {
  const myTeam = [set.self, ...set.allies].filter((p): p is ParticipantDto => p !== null);
  const brawler = set.games[set.games.length - 1];
  return (
    <li className="flex items-center gap-3 py-2.5">
      <SetBadge outcome={set.outcome} wins={set.wins} losses={set.losses} />
      {set.eloChange !== null && <EloChange value={set.eloChange} className="w-9 shrink-0 text-right text-[13px]" />}
      <BrawlerAvatar id={brawler?.brawlerId} name={brawler?.brawlerName} size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{set.map ?? modeLabel(set.mode)}</div>
        <div className="flex min-w-0 items-center gap-1 text-[12px] text-ink-2">
          <ModeIcon mode={set.mode} size={14} />
          <span className="truncate">
            {modeLabel(set.mode)}
            {set.type === 'teamRanked' && ' · en équipe'}
          </span>
          {set.tier !== null && (
            <>
              <span aria-hidden>·</span>
              <RankIcon tier={set.tier} size={14} />
              <span className="shrink-0">{tierName(set.tier)}</span>
            </>
          )}
        </div>
      </div>
      {!compact && (
        <div className="hidden items-center gap-2 md:flex">
          <TeamStrip players={myTeam} highlightSelf />
          <span className="text-[11px] text-ink-3">contre</span>
          <TeamStrip players={set.enemies} />
        </div>
      )}
      <time className="w-[76px] shrink-0 text-right text-[12px] text-ink-3" dateTime={set.end} title={fmtDateTime(set.end)}>
        {fmtRelative(set.end, now)}
      </time>
    </li>
  );
}

function Teams({ battle }: { battle: BattleDto }) {
  const teams = new Map<number, ParticipantDto[]>();
  for (const p of battle.participants) teams.set(p.team, [...(teams.get(p.team) ?? []), p]);
  const ordered = [...teams.entries()].sort(([, a], [, b]) => Number(b.some((p) => p.side === 'self')) - Number(a.some((p) => p.side === 'self')));
  return (
    <div className="grid gap-3 pb-3 pl-2 pt-1 sm:grid-cols-2">
      {ordered.slice(0, battle.teamsCount && battle.teamsCount > 2 ? 10 : 2).map(([team, players]) => (
        <div key={team} className="rounded-xl bg-fill/70 p-3">
          <div className="mb-2 text-[12px] font-medium text-ink-2">
            {players.some((p) => p.side === 'self') ? 'Ton équipe' : battle.teamsCount && battle.teamsCount > 2 ? `Équipe ${team + 1}` : 'Adversaires'}
          </div>
          <ul className="space-y-1.5">
            {players.map((p) => (
              <li key={p.tag} className="flex items-center gap-2 text-[13px]">
                <BrawlerAvatar id={p.brawlerId} name={p.brawlerName} size={22} />
                <span className={clsx('truncate', p.side === 'self' && 'font-semibold')}>{p.name}</span>
                <span className="truncate text-ink-3">{p.brawlerName}</span>
                {p.power !== null && <span className="ml-auto shrink-0 text-[12px] text-ink-3 tnum">Niv. {p.power}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Une ligne de l'historique des combats (dépliable pour voir les équipes). */
export function BattleRow({ battle, now }: { battle: BattleDto; now: number }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-line first:border-t-0">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 py-2.5 text-left">
        <ResultBadge outcome={battle.outcome} rank={battle.rank} />
        <BrawlerAvatar id={battle.brawlerId} name={battle.brawlerName} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-medium">{battle.map ?? modeLabel(battle.mode)}</span>
            {battle.starPlayer && <Star className="size-3.5 shrink-0 fill-[#eda100] text-[#eda100]" aria-label="Star player" />}
          </div>
          <div className="flex min-w-0 items-center gap-1 text-[12px] text-ink-2">
            <ModeIcon mode={battle.mode} size={14} />
            <span className="truncate">
              {modeLabel(battle.mode)} · {battle.brawlerName ?? '—'}
              {battle.duration ? ` · ${fmtDuration(battle.duration)}` : ''}
            </span>
          </div>
        </div>
        <span className="hidden sm:block">
          <Pill tone={battle.category === 'ranked' ? 'accent' : 'neutral'}>{battleTypeLabel(battle.type)}</Pill>
        </span>
        <span
          className={clsx(
            'w-10 shrink-0 text-right text-[13px] font-medium tnum',
            battle.trophyChange === null ? 'text-ink-3' : battle.trophyChange > 0 ? 'text-good' : battle.trophyChange < 0 ? 'text-bad' : 'text-ink-2',
          )}
        >
          {battle.trophyChange === null ? '' : fmtSigned(battle.trophyChange)}
        </span>
        <time className="hidden w-[84px] shrink-0 text-right text-[12px] text-ink-3 sm:block" dateTime={battle.battleTime} title={fmtDateTime(battle.battleTime)}>
          {fmtRelative(battle.battleTime, now)}
        </time>
        <ChevronDown className={clsx('size-4 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <Teams battle={battle} />}
    </li>
  );
}
