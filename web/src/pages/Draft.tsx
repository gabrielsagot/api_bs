import clsx from 'clsx';
import { RotateCcw, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { modeLabel } from '../../../shared/labels';
import type { DraftBrawlerDto, DraftPickDto, DraftReasonDto } from '../../../shared/types';
import { BrawlerAvatar, MapImage } from '../components/avatars';
import { Button, Card, CardHeader, DocLink, EmptyState, ErrorState, LoadingState, PageHeader, Segmented } from '../components/ui';
import { useDraft, useDraftRecommend } from '../lib/api';
import { fmtInt, fmtPct, fmtRelative } from '../lib/format';
import { useNow, usePlayerSlug } from '../lib/hooks';

// Simulateur de draft Ranked : map, bans, picks dans l'ordre 1-2-2-1, et le
// meilleur choix pour ton pick d'après les parties classées de la communauté.

/** Ordre de pick 1-2-2-1 : l'équipe A choisit en 1, 4 et 5 ; l'équipe B en 2, 3 et 6. */
const TEAM_OF_SLOT = [0, 1, 1, 0, 0, 1] as const;
const SLOTS = [0, 1, 2, 3, 4, 5];

type Target = { kind: 'ban' | 'pick'; index: number };

interface DraftState {
  mapKey: string;
  mySlot: number;
  bans: (number | null)[];
  picks: (number | null)[];
  target: Target | null;
}

const EMPTY: Omit<DraftState, 'mapKey' | 'mySlot'> = {
  bans: [null, null, null, null, null, null],
  picks: [null, null, null, null, null, null],
  target: { kind: 'ban', index: 0 },
};

const STORAGE_KEY = 'draft.preferences';

function loadPreferences(): { mapKey: string; mySlot: number; onlyOwned: boolean; personal: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    return {
      mapKey: typeof saved.mapKey === 'string' ? saved.mapKey : '',
      mySlot: typeof saved.mySlot === 'number' ? saved.mySlot : 0,
      onlyOwned: saved.onlyOwned !== false,
      personal: saved.personal !== false,
    };
  } catch {
    return { mapKey: '', mySlot: 0, onlyOwned: true, personal: true };
  }
}

/** Prochaine case vide : les bans d'abord, puis les picks dans l'ordre du draft. */
function nextTarget(bans: (number | null)[], picks: (number | null)[]): Target | null {
  const ban = bans.findIndex((id) => id === null);
  if (ban !== -1) return { kind: 'ban', index: ban };
  const pick = picks.findIndex((id) => id === null);
  return pick !== -1 ? { kind: 'pick', index: pick } : null;
}

const ordinal = (slot: number) => (slot === 0 ? '1er' : `${slot + 1}e`);

export function DraftPage() {
  const slug = usePlayerSlug();
  const now = useNow(30_000);
  const overview = useDraft(slug);
  const [prefs] = useState(loadPreferences);
  const [onlyOwned, setOnlyOwned] = useState(prefs.onlyOwned);
  const [personal, setPersonal] = useState(prefs.personal);
  const [state, setState] = useState<DraftState>({ mapKey: prefs.mapKey, mySlot: prefs.mySlot, ...EMPTY });
  const [search, setSearch] = useState('');

  const maps = overview.data?.maps ?? [];
  const map = maps.find((m) => `${m.mode}|${m.map}` === state.mapKey) ?? null;

  // Première visite : la map la mieux documentée.
  useEffect(() => {
    if (!map && maps.length) setState((s) => ({ ...s, mapKey: `${maps[0].mode}|${maps[0].map}` }));
  }, [map, maps]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mapKey: state.mapKey, mySlot: state.mySlot, onlyOwned, personal }));
    } catch {
      // Stockage indisponible (navigation privée) : on garde les réglages en mémoire.
    }
  }, [state.mapKey, state.mySlot, onlyOwned, personal]);

  const myTeam = TEAM_OF_SLOT[state.mySlot];
  const allies = SLOTS.filter((slot) => slot !== state.mySlot && TEAM_OF_SLOT[slot] === myTeam)
    .map((slot) => state.picks[slot])
    .filter((id): id is number => id !== null);
  const enemies = SLOTS.filter((slot) => TEAM_OF_SLOT[slot] !== myTeam)
    .map((slot) => state.picks[slot])
    .filter((id): id is number => id !== null);
  const enemyPicksAfter = SLOTS.filter((slot) => slot > state.mySlot && TEAM_OF_SLOT[slot] !== myTeam && state.picks[slot] === null).length;
  const bans = state.bans.filter((id): id is number => id !== null);

  const recommend = useDraftRecommend(
    slug,
    map
      ? {
          map: map.map,
          mode: map.mode,
          bans: bans.join(','),
          allies: allies.join(','),
          enemies: enemies.join(','),
          after: enemyPicksAfter,
          owned: onlyOwned ? 1 : 0,
          personal: personal ? 1 : 0,
        }
      : null,
  );

  const brawlers = overview.data?.brawlers ?? [];
  const byId = useMemo(() => new Map(brawlers.map((b) => [b.id, b])), [brawlers]);
  const used = new Set([...bans, ...state.picks.filter((id): id is number => id !== null)]);

  if (overview.isLoading) return <LoadingState />;
  if (overview.error || !overview.data) return <ErrorState error={overview.error} />;

  const place = (id: number) => {
    setState((s) => {
      if (!s.target) return s;
      const bansNext = [...s.bans];
      const picksNext = [...s.picks];
      if (s.target.kind === 'ban') bansNext[s.target.index] = id;
      else picksNext[s.target.index] = id;
      return { ...s, bans: bansNext, picks: picksNext, target: nextTarget(bansNext, picksNext) };
    });
    setSearch('');
  };
  const clear = (target: Target) =>
    setState((s) => {
      const bansNext = [...s.bans];
      const picksNext = [...s.picks];
      if (target.kind === 'ban') bansNext[target.index] = null;
      else picksNext[target.index] = null;
      return { ...s, bans: bansNext, picks: picksNext, target };
    });
  const select = (target: Target) => setState((s) => ({ ...s, target }));
  const reset = () => setState((s) => ({ ...s, ...EMPTY }));
  const isTarget = (target: Target) => state.target?.kind === target.kind && state.target.index === target.index;

  const crawler = overview.data.crawler;
  const sample = recommend.data?.sample;
  const targetLabel = !state.target
    ? 'Draft complet'
    : state.target.kind === 'ban'
      ? `Ban ${state.target.index + 1}`
      : state.target.index === state.mySlot
        ? 'Ton pick'
        : `Pick ${state.target.index + 1} (${TEAM_OF_SLOT[state.target.index] === myTeam ? 'allié' : 'adversaire'})`;

  // Bans conseillés d'abord pendant la phase de bans, puis les picks.
  const banAdvice = (
    <>
    {recommend.data && bans.length < 6 && (
      <Card>
        <CardHeader title="Bans conseillés" subtitle="Les plus forts sur cette map (l’API ne dit pas ce qui est banni : c’est une estimation)" />
        <ul className="space-y-2">
          {recommend.data.bans.slice(0, 6).map((ban) => (
            <li key={ban.brawlerId}>
              <button
                type="button"
                onClick={() => {
                  const index = state.bans.findIndex((id) => id === null);
                  if (index === -1) return;
                  setState((s) => {
                    const bansNext = [...s.bans];
                    bansNext[index] = ban.brawlerId;
                    return { ...s, bans: bansNext, target: nextTarget(bansNext, s.picks) };
                  });
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-1 py-1 text-left hover:bg-fill"
                title="Ajouter aux bans"
              >
                <BrawlerAvatar id={ban.brawlerId} name={ban.name} size={30} />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{ban.name}</span>
                <span className="text-[12px] text-ink-2 tnum">
                  {fmtPct(ban.mapWinRate)} · choisi {fmtPct(ban.presence)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    )}
    </>
  );
  const pickAdvice = (
    <Card className="lg:sticky lg:top-8">
      <CardHeader
        title={state.picks[state.mySlot] !== null ? 'Ton pick est fait' : `Pour ton pick (${ordinal(state.mySlot)})`}
        subtitle={
          enemyPicksAfter > 0
            ? `L’adversaire choisit encore ${enemyPicksAfter} fois après toi : les brawlers faciles à contrer sont pénalisés.`
            : 'L’adversaire a fini de choisir : seuls la map, tes alliés et les ennemis comptent.'
        }
      />
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
        <Toggle checked={onlyOwned} onChange={setOnlyOwned} label="Seulement mes brawlers" />
        <Toggle checked={personal} onChange={setPersonal} label="Tenir compte de mon historique" />
      </div>
      {recommend.isLoading || !recommend.data ? (
        <LoadingState />
      ) : (
        <>
          <ol className={clsx('space-y-2', recommend.isPlaceholderData && 'opacity-60')}>
            {recommend.data.picks.slice(0, 8).map((pick, index) => (
              <PickRow key={pick.brawlerId} pick={pick} rank={index + 1} onPick={state.picks[state.mySlot] === null ? () => {
                setState((s) => {
                  const picksNext = [...s.picks];
                  picksNext[s.mySlot] = pick.brawlerId;
                  return { ...s, picks: picksNext, target: nextTarget(s.bans, picksNext) };
                });
              } : undefined} />
            ))}
          </ol>
          {sample && (
            <p className="mt-3 text-[12px] text-ink-3">
              D’après {fmtInt(sample.mapMatches)} manches sur cette map et {fmtInt(sample.modeMatches)} en{' '}
              {modeLabel(recommend.data.mode)} ({sample.minTier !== null ? 'Mythique et plus' : 'tous rangs'}, {sample.days} derniers
              jours). Pourcentages indicatifs.
              {sample.mapMatches < 150 && (
                <span className="text-warn"> Encore peu de parties sur cette map : les conseils vont s’affiner.</span>
              )}
            </p>
          )}
        </>
      )}
    </Card>
  );
  const advice = bans.length < 6 ? (
    <>
      {banAdvice}
      {pickAdvice}
    </>
  ) : (
    pickAdvice
  );
  const collectNote = (
    <>
    {crawler && (
      <p className="px-1 text-[12px] text-ink-3">
        Collecte : {fmtInt(crawler.matches)} manches enregistrées, dont {fmtInt(crawler.matches24h)} sur les dernières 24 h ·{' '}
        {fmtInt(crawler.queue)} joueurs suivis
        {crawler.lastRunAt && ` · dernière lecture ${fmtRelative(crawler.lastRunAt, now)}`}
        {crawler.lastError && <span className="text-warn"> · {crawler.lastError}</span>}
      </p>
    )}
    </>
  );

  return (
    <>
      <PageHeader
        title="Draft"
        subtitle="Entre la map, les bans et les picks au fil du draft : le meilleur choix pour ton pick s’affiche en direct."
        action={<DocLink section="draft" />}
      />

      {maps.length === 0 ? (
        <Card>
          <EmptyState title="Pas encore de parties classées collectées">
            {crawler?.enabled
              ? 'La collecte vient de démarrer : les premières statistiques apparaissent au bout de quelques heures, et deviennent fiables après quelques jours.'
              : 'La collecte des parties de la communauté est désactivée (META_CRAWL_SECONDS=0 dans le fichier .env).'}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <Card>
              <div className="flex flex-wrap items-center gap-3">
                {map && <MapImage eventId={map.eventId} className="size-12 shrink-0" />}
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-[12px] font-medium text-ink-2">Map</span>
                  <select
                    value={state.mapKey}
                    onChange={(event) => setState((s) => ({ ...s, mapKey: event.target.value }))}
                    className="h-[36px] w-full rounded-[10px] bg-[#e9e9ee] px-3 text-[14px] font-medium outline-none"
                  >
                    {maps.map((m) => (
                      <option key={`${m.mode}|${m.map}`} value={`${m.mode}|${m.map}`}>
                        {m.map} · {modeLabel(m.mode)} ({fmtInt(m.matches)} parties)
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-4">
                <div className="mb-1.5 text-[12px] font-medium text-ink-2">Ton ordre de pick</div>
                <Segmented
                  label="Ton ordre de pick"
                  value={String(state.mySlot)}
                  onChange={(value) => setState((s) => ({ ...s, mySlot: Number(value) }))}
                  options={SLOTS.map((slot) => ({ value: String(slot), label: ordinal(slot) }))}
                />
                <p className="mt-1.5 text-[12px] text-ink-3">
                  Ordre 1-2-2-1 : une équipe choisit en 1, 4 et 5, l’autre en 2, 3 et 6.
                </p>
              </div>
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-[13px] text-ink-2">
                  À remplir : <span className="font-semibold text-ink">{targetLabel}</span>
                </div>
                <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={reset}>
                  Recommencer
                </Button>
              </div>

              <div className="mb-1.5 text-[12px] font-medium text-ink-2">Bans</div>
              <div className="flex flex-wrap gap-1.5">
                {state.bans.map((id, index) => (
                  <Slot
                    key={`ban-${index}`}
                    brawler={id !== null ? byId.get(id) : undefined}
                    brawlerId={id}
                    label={`Ban ${index + 1}`}
                    active={isTarget({ kind: 'ban', index })}
                    banned
                    compact
                    onSelect={() => select({ kind: 'ban', index })}
                    onClear={() => clear({ kind: 'ban', index })}
                  />
                ))}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {[myTeam, 1 - myTeam].map((team) => (
                  <div key={team}>
                    <div className="mb-1.5 text-[12px] font-medium text-ink-2">{team === myTeam ? 'Ton équipe' : 'Adversaires'}</div>
                    <div className="space-y-1.5">
                      {SLOTS.filter((slot) => TEAM_OF_SLOT[slot] === team).map((slot) => (
                        <Slot
                          key={slot}
                          brawler={state.picks[slot] !== null ? byId.get(state.picks[slot]!) : undefined}
                          brawlerId={state.picks[slot]}
                          label={slot === state.mySlot ? `Pick ${slot + 1} · toi` : `Pick ${slot + 1}`}
                          mine={slot === state.mySlot}
                          active={isTarget({ kind: 'pick', index: slot })}
                          onSelect={() => select({ kind: 'pick', index: slot })}
                          onClear={() => clear({ kind: 'pick', index: slot })}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <div className="space-y-4 lg:hidden">{advice}</div>

            <Card>
              <label className="relative mb-3 flex items-center">
                <Search className="pointer-events-none absolute left-2.5 size-3.5 text-ink-3" />
                <span className="sr-only">Chercher un brawler</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={state.target ? `${targetLabel} : chercher un brawler` : 'Draft complet'}
                  className="h-[34px] w-full rounded-[10px] bg-[#e9e9ee] pl-8 pr-3 text-[14px] outline-none placeholder:text-ink-3"
                />
              </label>
              <BrawlerGrid
                brawlers={brawlers}
                search={search}
                used={used}
                disabled={!state.target}
                onPick={place}
              />
            </Card>
            <div className="lg:hidden">{collectNote}</div>
          </div>

          <div className="hidden space-y-4 lg:col-span-5 lg:block">
            {advice}
            {collectNote}
          </div>
        </div>
      )}
    </>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-ink-2">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-[var(--color-accent)]" />
      {label}
    </label>
  );
}

function Slot({
  brawler,
  brawlerId,
  label,
  active,
  mine = false,
  banned = false,
  compact = false,
  onSelect,
  onClear,
}: {
  brawler: DraftBrawlerDto | undefined;
  brawlerId: number | null;
  label: string;
  active: boolean;
  mine?: boolean;
  banned?: boolean;
  compact?: boolean;
  onSelect: () => void;
  onClear: () => void;
}) {
  const filled = brawlerId !== null;
  return (
    <div
      className={clsx(
        'relative flex min-w-0 items-center rounded-xl ring-1 transition-colors',
        compact ? 'size-11 shrink-0 justify-center' : 'gap-2 px-2 py-1.5',
        active ? 'bg-accent-soft ring-2 ring-accent' : mine ? 'bg-fill ring-accent/40' : 'bg-fill/60 ring-line',
      )}
    >
      <button type="button" onClick={onSelect} className={clsx('flex min-w-0 flex-1 items-center', compact ? 'justify-center' : 'gap-2')} aria-label={label}>
        {filled ? (
          <span className={clsx('relative', banned && 'opacity-60 grayscale')}>
            <BrawlerAvatar id={brawlerId} name={brawler?.name} size={compact ? 30 : 32} />
          </span>
        ) : (
          <span
            className={clsx(
              'grid shrink-0 place-items-center rounded-[24%] border border-dashed text-[11px]',
              compact ? 'size-[30px]' : 'size-8',
              active ? 'border-accent text-accent' : 'border-line-strong text-ink-3',
            )}
          >
            +
          </span>
        )}
        {!compact && (
          <span className="min-w-0 text-left">
            <span className={clsx('block truncate text-[11px]', mine ? 'font-semibold text-accent' : 'text-ink-3')}>{label}</span>
            <span className="block truncate text-[13px] font-medium">{brawler?.name ?? (filled ? `#${brawlerId}` : '—')}</span>
          </span>
        )}
      </button>
      {filled && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Retirer (${label})`}
          className={clsx(
            'grid place-items-center rounded-full bg-surface text-ink-3 shadow-sm ring-1 ring-line hover:text-bad',
            compact ? 'absolute -right-1 -top-1 size-4' : 'size-6 shrink-0',
          )}
        >
          <X className={compact ? 'size-2.5' : 'size-3.5'} />
        </button>
      )}
    </div>
  );
}

function BrawlerGrid({
  brawlers,
  search,
  used,
  disabled,
  onPick,
}: {
  brawlers: DraftBrawlerDto[];
  search: string;
  used: Set<number>;
  disabled: boolean;
  onPick: (id: number) => void;
}) {
  const query = search.trim().toLowerCase();
  const list = query ? brawlers.filter((b) => b.name.toLowerCase().includes(query)) : brawlers;
  return (
    <div className="grid max-h-[340px] grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1.5 overflow-y-auto pr-1">
      {list.map((brawler) => {
        const taken = used.has(brawler.id);
        return (
          <button
            key={brawler.id}
            type="button"
            disabled={disabled || taken}
            onClick={() => onPick(brawler.id)}
            title={brawler.name}
            className="flex flex-col items-center gap-0.5 rounded-lg p-1 hover:bg-fill disabled:opacity-30"
          >
            <BrawlerAvatar id={brawler.id} name={brawler.name} size={40} muted={!brawler.owned} />
            <span className="w-full truncate text-center text-[10px] text-ink-2">{brawler.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function reasonText(reason: DraftReasonDto): string {
  const pts = `${reason.points >= 0 ? '+' : '−'}${Math.abs(reason.points).toFixed(0)}`;
  switch (reason.kind) {
    case 'map':
      return `${fmtPct(reason.rate ?? null)} sur la map (${fmtInt(reason.games ?? 0)} parties)`;
    case 'synergy':
      return `${reason.points >= 0 ? 'Duo avec' : 'Mauvais duo avec'} ${reason.brawlerName} ${pts}`;
    case 'counter':
      return `${reason.points >= 0 ? 'Bat' : 'Craint'} ${reason.brawlerName} ${pts}`;
    case 'risk':
      return `Contrable par ${reason.brawlerName} ${pts}`;
    case 'mastery':
      return `Toi : ${fmtPct(reason.rate ?? null)} sur ${reason.games} parties ${pts}`;
  }
}

function PickRow({ pick, rank, onPick }: { pick: DraftPickDto; rank: number; onPick?: () => void }) {
  return (
    // Sur téléphone, les 5 premiers suffisent pendant le draft.
    <li className={clsx('items-start gap-3 rounded-xl py-1.5', rank > 5 ? 'hidden lg:flex' : 'flex')}>
      <span className="w-4 pt-2 text-right text-[12px] text-ink-3 tnum">{rank}</span>
      <BrawlerAvatar id={pick.brawlerId} name={pick.name} size={40} muted={!pick.owned} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-semibold">{pick.name}</span>
          <span className="shrink-0 text-[15px] font-semibold tnum">{fmtPct(pick.estimate)}</span>
        </div>
        <ul className="mt-1 flex flex-wrap gap-1">
          {pick.reasons.map((reason, index) => (
            <li
              key={index}
              className={clsx(
                'rounded-full px-2 py-0.5 text-[11px]',
                reason.kind === 'map'
                  ? 'bg-fill text-ink-2'
                  : reason.points >= 0
                    ? 'bg-good-soft text-good'
                    : 'bg-bad-soft text-bad',
              )}
            >
              {reasonText(reason)}
            </li>
          ))}
          {!pick.owned && <li className="rounded-full bg-fill px-2 py-0.5 text-[11px] text-ink-3">non débloqué</li>}
        </ul>
      </div>
      {onPick && (
        <button type="button" onClick={onPick} className="mt-1 shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium text-accent hover:bg-accent-soft">
          Choisir
        </button>
      )}
    </li>
  );
}

