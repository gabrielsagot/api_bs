import clsx from 'clsx';
import {
  BookOpen,
  CalendarClock,
  ChevronDown,
  CircleAlert,
  Ellipsis,
  House,
  LayoutGrid,
  LoaderCircle,
  Medal,
  Radio,
  RefreshCw,
  Settings,
  Swords,
  Target,
  Trophy,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router';
import type { PlayerListItem } from '../../../shared/types';
import { usePlayers, useRefresh, useStatus } from '../lib/api';
import { fmtInt, fmtRelative } from '../lib/format';
import { useNow } from '../lib/hooks';
import { PlayerIcon } from './avatars';
import { PlayerName } from './bs';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  scoped: boolean;
}

const NAV: NavItem[] = [
  { to: '', label: 'Accueil', icon: House, scoped: true },
  { to: 'direct', label: 'En direct', icon: Radio, scoped: true },
  { to: 'ranked', label: 'Ranked', icon: Medal, scoped: true },
  { to: 'trophees', label: 'Trophées', icon: Trophy, scoped: true },
  { to: 'combats', label: 'Combats', icon: Swords, scoped: true },
  { to: 'brawlers', label: 'Brawlers', icon: LayoutGrid, scoped: true },
  { to: 'rotation', label: 'Rotation', icon: CalendarClock, scoped: true },
  { to: 'objectifs', label: 'Objectifs', icon: Target, scoped: true },
  { to: '/comparer', label: 'Comparer', icon: Users, scoped: false },
  { to: '/documentation', label: 'Documentation', icon: BookOpen, scoped: false },
  { to: '/reglages', label: 'Réglages', icon: Settings, scoped: false },
];

const MOBILE_TABS = ['', 'direct', 'ranked', 'brawlers'];

function hrefFor(item: NavItem, slug: string | undefined): string {
  if (!item.scoped) return item.to;
  return slug ? `/p/${slug}${item.to ? `/${item.to}` : ''}` : '/';
}

/** Sélecteur de joueur : un <select> natif (roue iOS sur iPhone) sous un habillage sobre. */
function PlayerSwitcher({ players, current, compact = false }: { players: PlayerListItem[]; current?: PlayerListItem; compact?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  if (!current) return null;
  const switchTo = (slug: string) => {
    const rest = location.pathname.match(/^\/p\/[^/]+(\/[^/]+)?/)?.[1] ?? '';
    navigate(`/p/${slug}${rest}`);
  };
  return (
    <label className={clsx('relative flex min-w-0 cursor-pointer items-center gap-2.5 rounded-xl', compact ? 'py-1' : 'bg-fill px-2.5 py-2 hover:bg-[#ebebf0]')}>
      <PlayerIcon iconId={current.iconId} name={current.name} size={compact ? 30 : 34} />
      <span className="min-w-0 flex-1">
        <PlayerName name={current.name} color={current.nameColor} className="block truncate text-[14px] font-semibold leading-tight" />
        <span className="block truncate text-[12px] text-ink-2">
          {current.trophies !== null ? `${fmtInt(current.trophies)} trophées` : current.tag}
        </span>
      </span>
      {players.length > 1 && <ChevronDown className="size-4 shrink-0 text-ink-2" />}
      {players.length > 1 && (
        <select
          aria-label="Changer de joueur"
          value={current.slug}
          onChange={(event) => switchTo(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {players.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name} ({p.tag})
            </option>
          ))}
        </select>
      )}
    </label>
  );
}

function SyncStatus({ compact = false }: { compact?: boolean }) {
  const status = useStatus();
  const refresh = useRefresh();
  const now = useNow(15_000);
  const poller = status.data?.poller;
  const running = poller?.running || refresh.isPending;
  if (status.data?.demo) return compact ? null : <p className="px-2 text-[12px] text-ink-3">Mode démo</p>;
  return (
    <div className={clsx('flex items-center gap-2', !compact && 'px-2')}>
      {!compact && (
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">
          {running ? 'Mise à jour…' : `Mis à jour ${fmtRelative(poller?.lastRunAt, now)}`}
        </span>
      )}
      <button
        type="button"
        onClick={() => refresh.mutate(undefined)}
        disabled={running}
        aria-label="Actualiser maintenant"
        title="Actualiser maintenant"
        className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-fill hover:text-ink disabled:opacity-60"
      >
        {running ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      </button>
    </div>
  );
}

function Banners() {
  const status = useStatus().data;
  const location = useLocation();
  if (!status) return null;
  const { key } = status;
  const keyProblem = !status.demo && (key.state === 'error' || key.state === 'missing');
  return (
    <>
      {status.demo && (
        <div className="mb-5 rounded-2xl bg-accent-soft px-4 py-3 text-[13px] text-ink">
          <strong className="font-semibold">Mode démo.</strong> Données fictives générées localement. Lance{' '}
          <code className="rounded bg-white/70 px-1">npm start</code> pour suivre ton vrai compte.
        </div>
      )}
      {keyProblem && location.pathname !== '/reglages' && (
        <div className="mb-5 flex items-start gap-2.5 rounded-2xl bg-warn-soft px-4 py-3 text-[13px] text-ink">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <div className="min-w-0">
            <strong className="font-semibold">Accès à l’API impossible.</strong> {key.message}{' '}
            <Link to="/reglages" className="font-medium text-accent hover:underline">
              Réglages
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

export function Layout() {
  const params = useParams();
  const players = usePlayers().data ?? [];
  const primary = players.find((p) => p.isPrimary) ?? players[0];
  const current = players.find((p) => p.slug === params.tag) ?? primary;
  const slug = current?.slug;
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMoreOpen(false), [location.pathname]);
  useEffect(() => {
    // Les liens vers une section (#ancre) gèrent eux-mêmes le défilement.
    if (!location.hash) window.scrollTo({ top: 0 });
  }, [location.pathname, location.hash]);

  const isActive = (item: NavItem) => {
    const href = hrefFor(item, slug);
    return item.to === '' ? location.pathname === href : location.pathname.startsWith(href);
  };

  return (
    <div className="min-h-dvh lg:pl-[248px]">
      {/* Barre latérale (ordinateur) */}
      <aside className="fixed inset-y-0 left-0 hidden w-[248px] flex-col border-r border-line bg-canvas/80 px-3 pb-4 pt-5 backdrop-blur-xl lg:flex">
        <div className="mb-4 px-2 text-[13px] font-semibold tracking-tight text-ink-2">Brawl Dashboard</div>
        <PlayerSwitcher players={players} current={current} />
        <nav className="mt-4 flex flex-1 flex-col gap-0.5" aria-label="Navigation principale">
          {NAV.map((item) => (
            <NavLink
              key={item.label}
              to={hrefFor(item, slug)}
              end={item.to === ''}
              className={clsx(
                'flex items-center gap-3 rounded-[10px] px-2.5 py-[7px] text-[14px] font-medium transition-colors',
                isActive(item) ? 'bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : 'text-ink-2 hover:bg-black/[0.035] hover:text-ink',
              )}
            >
              <item.icon className={clsx('size-[18px]', isActive(item) ? 'text-accent' : 'text-ink-3')} strokeWidth={1.8} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <SyncStatus />
      </aside>

      {/* Barre du haut (mobile) */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-canvas/85 px-4 py-2 backdrop-blur-xl lg:hidden">
        <div className="min-w-0 flex-1">
          <PlayerSwitcher players={players} current={current} compact />
        </div>
        <SyncStatus compact />
      </header>

      <main className="mx-auto w-full max-w-[1240px] px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">
        <Banners />
        <Outlet />
      </main>

      {/* Onglets (mobile) */}
      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/90 backdrop-blur-xl lg:hidden"
        aria-label="Navigation"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.filter((item) => MOBILE_TABS.includes(item.to)).map((item) => (
            <NavLink
              key={item.label}
              to={hrefFor(item, slug)}
              end={item.to === ''}
              className={clsx(
                'flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10px] font-medium',
                isActive(item) ? 'text-accent' : 'text-ink-3',
              )}
            >
              <item.icon className="size-[22px]" strokeWidth={1.8} />
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={clsx(
              'flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10px] font-medium',
              NAV.some((item) => !MOBILE_TABS.includes(item.to) && isActive(item)) ? 'text-accent' : 'text-ink-3',
            )}
          >
            <Ellipsis className="size-[22px]" strokeWidth={1.8} />
            Plus
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Plus de pages">
          <button type="button" aria-label="Fermer" className="absolute inset-0 bg-black/20" onClick={() => setMoreOpen(false)} />
          <div className="safe-bottom absolute inset-x-0 bottom-0 rounded-t-[22px] bg-surface px-4 pb-4 pt-3 shadow-[0_-8px_32px_rgba(0,0,0,0.12)]">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[15px] font-semibold">Plus</span>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Fermer" className="grid size-8 place-items-center rounded-full bg-fill text-ink-2">
                <X className="size-4" />
              </button>
            </div>
            <ul>
              {NAV.filter((item) => !MOBILE_TABS.includes(item.to)).map((item) => (
                <li key={item.label}>
                  <Link to={hrefFor(item, slug)} className="flex items-center gap-3 rounded-xl px-2 py-3 text-[16px] active:bg-fill">
                    <item.icon className="size-5 text-accent" strokeWidth={1.8} />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
