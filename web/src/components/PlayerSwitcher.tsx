import clsx from 'clsx';
import {
  Check,
  ChevronDown,
  Plus,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router';
import type { PlayerListItem } from '../../../shared/types';
import { seriesColor } from '../lib/colors';
import { fmtInt } from '../lib/format';
import { PlayerIcon } from './avatars';
import { PlayerName } from './bs';

interface PlayerSwitcherProps {
  players: PlayerListItem[];
  current?: PlayerListItem;
  compact?: boolean;
}

export function PlayerSwitcher({ players, current, compact = false }: PlayerSwitcherProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const hasMultiple = players.length > 1;

  const switchTo = useCallback(
    (targetSlug: string) => {
      // Préserve la sous-page actuelle (ex: /combats, /ranked, /brawlers)
      const match = location.pathname.match(/^\/p\/[^/]+(.*)$/);
      const rest = match ? match[1] : '';
      navigate({
        pathname: `/p/${targetSlug}${rest}`,
        search: location.search,
        hash: location.hash,
      });
      setIsOpen(false);
    },
    [location.pathname, location.search, location.hash, navigate],
  );

  // Fermer sur clic en dehors (Desktop popover)
  useEffect(() => {
    if (!isOpen || compact) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, compact]);

  // Fermer sur Échap
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Bloquer le scroll d'arrière-plan sur mobile quand le tiroir est ouvert
  useEffect(() => {
    if (isOpen && compact) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [isOpen, compact]);

  if (!current) return null;

  // ── Mode compact (Barre d'en-tête mobile) ──────────────────────────
  if (compact) {
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => hasMultiple && setIsOpen(!isOpen)}
          aria-expanded={hasMultiple ? isOpen : undefined}
          aria-haspopup={hasMultiple ? 'dialog' : undefined}
          aria-label={
            hasMultiple
              ? `Compte suivi : ${current.name}. ${players.length} comptes disponibles. Appuyer pour changer.`
              : `Compte suivi : ${current.name}`
          }
          className={clsx(
            'group relative flex w-full max-w-full items-center gap-2 rounded-xl text-left transition-colors',
            hasMultiple
              ? 'cursor-pointer bg-fill/80 px-2.5 py-1.5 active:bg-line'
              : 'cursor-default py-1',
          )}
        >
          {/* Avatar avec bague de couleur */}
          <div className="relative shrink-0">
            <div
              className="rounded-full p-[1.5px]"
              style={{
                background: seriesColor(current.colorSlot),
              }}
            >
              <div className="rounded-full bg-surface p-[0.5px]">
                <PlayerIcon iconId={current.iconId} name={current.name} size={28} />
              </div>
            </div>
          </div>

          {/* Nom et trophées */}
          <div className="min-w-0 flex-1">
            <PlayerName
              name={current.name}
              color={current.nameColor}
              nameStyle={current.nameStyle}
              className="block truncate text-[13px] font-semibold leading-tight text-ink"
            />
            <div className="flex items-center gap-1 text-[11px] text-ink-2">
              {current.trophies !== null ? (
                <span className="font-medium tnum text-ink-2">
                  {fmtInt(current.trophies)}
                </span>
              ) : (
                <span className="truncate">{current.tag}</span>
              )}
            </div>
          </div>

          {/* Badge du nombre de comptes & Chevron */}
          {hasMultiple && (
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink-2 shadow-xs">
              <span className="tnum">{players.length}</span>
              <ChevronDown className="size-3 text-ink-3 transition-transform duration-200" />
            </div>
          )}
        </button>

        {/* Tiroir coulissant (Bottom Sheet) pour Mobile via Portal */}
        {hasMultiple &&
          isOpen &&
          createPortal(
            <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Changer de compte suivi">
              {/* Fond obscurci semi-transparent avec flou */}
              <div
                className="animate-fade-overlay fixed inset-0 bg-black/40 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
                aria-hidden="true"
              />

              {/* Contenu du tiroir coulissant */}
              <div className="safe-bottom animate-sheet-up fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-[28px] bg-surface shadow-[0_-12px_40px_rgba(0,0,0,0.18)]">
                {/* Poignée tactile */}
                <div className="flex justify-center pb-1 pt-3">
                  <div className="h-1 w-10 rounded-full bg-ink-3/25" />
                </div>

                {/* En-tête du tiroir */}
                <div className="flex items-center justify-between border-b border-line/60 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[17px] font-semibold text-ink">Changer de compte</h2>
                    <span className="rounded-full bg-fill px-2 py-0.5 text-[12px] font-semibold text-ink-2">
                      {players.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="Fermer"
                    className="grid size-8 place-items-center rounded-full bg-fill text-ink-2 transition-colors active:bg-line"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Liste des comptes */}
                <div className="flex-1 space-y-2 overflow-y-auto p-4">
                  {players.map((p) => {
                    const isSelected = p.slug === current.slug;
                    return (
                      <button
                        key={p.slug}
                        type="button"
                        onClick={() => switchTo(p.slug)}
                        className={clsx(
                          'flex w-full items-center gap-3.5 rounded-2xl p-3 text-left transition-all',
                          isSelected
                            ? 'bg-accent-soft/85 ring-1.5 ring-accent/30 shadow-xs'
                            : 'bg-fill/60 active:bg-fill',
                        )}
                      >
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          <div
                            className="rounded-full p-[2px]"
                            style={{
                              background: isSelected ? 'var(--color-accent)' : seriesColor(p.colorSlot),
                            }}
                          >
                            <div className="rounded-full bg-surface p-[1px]">
                              <PlayerIcon iconId={p.iconId} name={p.name} size={42} />
                            </div>
                          </div>
                        </div>

                        {/* Informations */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <PlayerName
                              name={p.name}
                              color={p.nameColor}
                              nameStyle={p.nameStyle}
                              className="truncate text-[15px] font-semibold text-ink"
                            />
                            {p.isPrimary && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                Principal
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
                            {p.trophies !== null && (
                              <span className="font-medium tnum">
                                {fmtInt(p.trophies)} trophées
                              </span>
                            )}
                            <span>· {p.tag}</span>
                            {p.clubName && <span>· {p.clubName}</span>}
                          </div>
                        </div>

                        {/* Checkmark pour le compte actif */}
                        {isSelected && (
                          <div className="shrink-0">
                            <div className="grid size-6 place-items-center rounded-full bg-accent text-white shadow-xs">
                              <Check className="size-3.5" strokeWidth={2.8} />
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Actions en bas de feuille */}
                <div className="grid grid-cols-2 gap-3 border-t border-line/60 bg-canvas/40 p-4">
                  <Link
                    to="/comparer"
                    onClick={() => setIsOpen(false)}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-[14px] font-medium text-ink shadow-xs transition-colors active:bg-fill"
                  >
                    <Users className="size-4 text-accent" />
                    <span>Comparer</span>
                  </Link>
                  <Link
                    to="/reglages"
                    onClick={() => setIsOpen(false)}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl bg-accent text-[14px] font-medium text-white shadow-xs transition-colors active:bg-accent-hover"
                  >
                    <Settings className="size-4" />
                    <span>Gérer les comptes</span>
                  </Link>
                </div>
              </div>
            </div>,
            document.body,
          )}
      </>
    );
  }

  // ── Mode complet (Barre latérale ordinateur) ──────────────────────
  return (
    <div ref={containerRef} className="relative">
      {/* Carte déclencheur du compte actif */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => hasMultiple && setIsOpen(!isOpen)}
        aria-expanded={hasMultiple ? isOpen : undefined}
        aria-haspopup={hasMultiple ? 'dialog' : undefined}
        aria-label={
          hasMultiple
            ? `Compte suivi : ${current.name}. ${players.length} comptes disponibles. Cliquer pour changer.`
            : `Compte suivi : ${current.name}`
        }
        className={clsx(
          'group relative flex w-full items-center gap-2.5 rounded-2xl border text-left transition-all duration-200',
          hasMultiple
            ? clsx(
                'cursor-pointer bg-surface/90 p-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:bg-surface hover:shadow-[0_4px_14px_rgba(0,0,0,0.07)]',
                isOpen
                  ? 'border-accent/40 bg-surface ring-2 ring-accent/20'
                  : 'border-line/90 hover:border-line-strong',
              )
            : 'cursor-default border-transparent bg-fill/70 p-2.5',
        )}
      >
        {/* Avatar avec anneau coloré dynamique (seriesColor) */}
        <div className="relative shrink-0">
          <div
            className="rounded-full p-[2px] transition-transform duration-200 group-hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${seriesColor(current.colorSlot)}, ${seriesColor(current.colorSlot)}99)`,
            }}
          >
            <div className="rounded-full bg-surface p-[1px]">
              <PlayerIcon iconId={current.iconId} name={current.name} size={36} />
            </div>
          </div>
        </div>

        {/* Détails du joueur */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <PlayerName
              name={current.name}
              color={current.nameColor}
              nameStyle={current.nameStyle}
              className="block truncate text-[14px] font-semibold leading-tight text-ink"
            />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-2">
            {current.trophies !== null ? (
              <span className="font-medium tnum text-ink-2">
                {fmtInt(current.trophies)}
              </span>
            ) : (
              <span className="truncate">{current.tag}</span>
            )}
          </div>
        </div>

        {/* Badge multi-comptes et Chevron animé */}
        {hasMultiple && (
          <div className="flex shrink-0 items-center gap-1 rounded-full bg-fill/80 px-2 py-1 text-[11px] font-medium text-ink-2 transition-colors group-hover:bg-accent-soft group-hover:text-accent">
            <span className="tnum font-semibold">{players.length}</span>
            <ChevronDown
              className={clsx(
                'size-3.5 transition-transform duration-200',
                isOpen ? 'rotate-180 text-accent' : 'text-ink-3 group-hover:text-accent',
              )}
            />
          </div>
        )}
      </button>

      {/* Barre d'accès rapide multi-comptes en 1 clic (pour 2 à 5 comptes) */}
      {hasMultiple && players.length <= 5 && (
        <div className="mt-2 flex items-center justify-between px-1 py-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3 select-none">
            Changer :
          </span>
          <div className="flex items-center gap-1.5">
            {players.map((p) => {
              const isSelected = p.slug === current.slug;
              return (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => switchTo(p.slug)}
                  title={`${p.name} (${p.trophies !== null ? `${fmtInt(p.trophies)} trophées` : p.tag})`}
                  className={clsx(
                    'group/avatar relative rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    isSelected
                      ? 'scale-105 ring-2 ring-accent ring-offset-2 ring-offset-canvas shadow-xs'
                      : 'opacity-65 hover:opacity-100 hover:scale-110',
                  )}
                >
                  <div
                    className="rounded-full p-[1.5px]"
                    style={{
                      background: isSelected ? 'var(--color-accent)' : seriesColor(p.colorSlot),
                    }}
                  >
                    <div className="rounded-full bg-surface p-[1px]">
                      <PlayerIcon iconId={p.iconId} name={p.name} size={22} />
                    </div>
                  </div>
                </button>
              );
            })}
            <Link
              to="/reglages"
              title="Ajouter ou gérer les comptes dans les Réglages"
              className="grid size-6 place-items-center rounded-full border border-dashed border-line-strong text-ink-3 transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
            >
              <Plus className="size-3" />
            </Link>
          </div>
        </div>
      )}

      {/* Menu Popover déroulant élégant (Desktop) */}
      {hasMultiple && isOpen && (
        <div
          role="menu"
          aria-label="Sélectionner un compte suivi"
          className={clsx(
            'animate-popover-in absolute left-0 top-full z-50 mt-2 w-[285px] origin-top-left',
            'rounded-2xl border border-line-strong/60 bg-surface/95 p-2 shadow-[0_16px_48px_rgba(0,0,0,0.14),0_2px_6px_rgba(0,0,0,0.06)] backdrop-blur-2xl ring-1 ring-black/[0.04]',
          )}
        >
          {/* En-tête du Popover */}
          <div className="mb-2 flex items-center justify-between border-b border-line/60 px-2.5 pb-2 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-ink">Comptes suivis</span>
              <span className="rounded-full bg-fill px-2 py-0.5 text-[11px] font-semibold text-ink-2">
                {players.length}
              </span>
            </div>
            <Link
              to="/reglages"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-accent transition-colors hover:bg-accent-soft"
              title="Gérer les comptes dans les Réglages"
            >
              <Settings className="size-3.5" />
              <span>Gérer</span>
            </Link>
          </div>

          {/* Liste des comptes suivis */}
          <div className="no-scrollbar max-h-[320px] space-y-1 overflow-y-auto pr-0.5">
            {players.map((p) => {
              const isSelected = p.slug === current.slug;
              return (
                <button
                  key={p.slug}
                  type="button"
                  role="menuitem"
                  onClick={() => switchTo(p.slug)}
                  className={clsx(
                    'group/item flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-all duration-150',
                    isSelected
                      ? 'bg-accent-soft/75 text-ink ring-1 ring-accent/25'
                      : 'text-ink-2 hover:bg-fill/80 hover:text-ink',
                  )}
                >
                  {/* Avatar avec bague dynamique */}
                  <div className="relative shrink-0">
                    <div
                      className="rounded-full p-[1.5px]"
                      style={{
                        background: isSelected ? 'var(--color-accent)' : seriesColor(p.colorSlot),
                      }}
                    >
                      <div className="rounded-full bg-surface p-[1px]">
                        <PlayerIcon iconId={p.iconId} name={p.name} size={34} />
                      </div>
                    </div>
                  </div>

                  {/* Pseudo et Trophées */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <PlayerName
                        name={p.name}
                        color={p.nameColor}
                        nameStyle={p.nameStyle}
                        className="truncate text-[13px] font-semibold text-ink"
                      />
                      {p.isPrimary && (
                        <span className="rounded bg-amber-50 px-1 py-[1px] text-[10px] font-medium text-amber-700">
                          Principal
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
                      {p.trophies !== null && (
                        <span className="font-medium tnum text-ink-2">
                          {fmtInt(p.trophies)}
                        </span>
                      )}
                      <span>·</span>
                      <span className="truncate">{p.tag}</span>
                      {p.clubName && (
                        <>
                          <span>·</span>
                          <span className="truncate">{p.clubName}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Coche du compte sélectionné */}
                  {isSelected && (
                    <div className="shrink-0">
                      <div className="grid size-5 place-items-center rounded-full bg-accent text-white shadow-xs">
                        <Check className="size-3" strokeWidth={2.8} />
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Pied de Popover : actions rapides */}
          <div className="mt-2 grid grid-cols-2 gap-1.5 border-t border-line/60 pt-2">
            <Link
              to="/comparer"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-fill/80 px-2 py-1.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-fill hover:text-ink"
            >
              <Users className="size-3.5 text-accent" />
              <span>Comparer</span>
            </Link>
            <Link
              to="/reglages"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-fill/80 px-2 py-1.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-fill hover:text-ink"
            >
              <Plus className="size-3.5 text-accent" />
              <span>Ajouter</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
