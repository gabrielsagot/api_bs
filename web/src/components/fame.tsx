import clsx from 'clsx';
import { Trophy, X } from 'lucide-react';
import {
  FAME_PLANETS,
  getPlanetImageUrl,
  getRewardImageUrl,
  type FameMilestone,
  type FameRewardType,
} from '../../../shared/fame';
import type { BrawlerCardDto, PlayerProfileDto } from '../../../shared/types';
import { BrawlerAvatar, PlayerIcon } from './avatars';
import { PlayerName } from './bs';

/**
 * Flèche en biais ↗ (identique au repère fourni par l'utilisateur).
 */
export function DiagonalArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx('inline-block shrink-0', className)}
      aria-hidden="true"
    >
      <line x1="6" y1="18" x2="18" y2="6" />
      <polyline points="9 6 18 6 18 15" />
    </svg>
  );
}

/**
 * Rendu officiel de chaque planète / corps céleste Brawl Stars avec asset du jeu.
 */
export function PlanetVisual({
  tier,
  size = 64,
  className,
  alt,
}: {
  tier: string;
  size?: number;
  className?: string;
  alt?: string;
}) {
  const imageUrl = getPlanetImageUrl(tier);

  return (
    <div
      className={clsx('relative inline-flex items-center justify-center shrink-0 select-none', className)}
      style={{ width: size, height: size }}
    >
      <img
        src={imageUrl}
        alt={alt || `Planète Gloire ${tier}`}
        className="size-full object-contain filter drop-shadow-md select-none transition-transform hover:scale-105 duration-200"
        loading="lazy"
        draggable={false}
      />
    </div>
  );
}

/**
 * Rendu officiel de chaque type de récompense cosmétique (Fond de carte, Icône de profil, Émoticône).
 */
export function CosmeticRewardBadge({
  type,
  tier,
  size = 'md',
  unlocked = false,
}: {
  type: FameRewardType;
  tier: string;
  size?: 'sm' | 'md' | 'lg';
  unlocked?: boolean;
}) {
  const isSm = size === 'sm';
  const isLg = size === 'lg';
  const imageUrl = getRewardImageUrl(tier, type);

  if (type === 'card') {
    return (
      <div
        className={clsx(
          'relative rounded-xl border flex items-center justify-center overflow-hidden transition-all',
          isSm ? 'w-10 h-10 p-0.5' : isLg ? 'w-24 h-24 p-1.5' : 'w-14 h-14 p-1',
          unlocked
            ? 'bg-surface border-line-strong shadow-xs hover:scale-105 ring-1 ring-black/[0.04]'
            : 'bg-fill/60 border-line/60 opacity-45 grayscale',
        )}
        title={unlocked ? 'Fond de carte débloqué' : 'Fond de carte verrouillé'}
      >
        <img
          src={imageUrl}
          alt={`Fond de carte Gloire ${tier}`}
          className="size-full object-contain select-none filter drop-shadow-xs"
          loading="lazy"
          draggable={false}
        />
      </div>
    );
  }

  if (type === 'icon') {
    return (
      <div
        className={clsx(
          'relative rounded-xl border-2 flex items-center justify-center overflow-hidden shrink-0 transition-all',
          isSm ? 'size-8' : isLg ? 'size-20' : 'size-12',
          unlocked
            ? 'bg-surface border-amber-400 shadow-xs hover:scale-105'
            : 'bg-fill/60 border-line/60 opacity-45 grayscale',
        )}
        title={unlocked ? 'Photo de profil débloquée' : 'Photo de profil verrouillée'}
      >
        <img
          src={imageUrl}
          alt={`Photo de profil Gloire ${tier}`}
          className="size-full object-cover select-none"
          loading="lazy"
          draggable={false}
        />
      </div>
    );
  }

  // Pin (Émoticône)
  return (
    <div
      className={clsx(
        'relative rounded-xl border flex items-center justify-center shrink-0 overflow-hidden transition-all',
        isSm ? 'size-8 p-0.5' : isLg ? 'size-20 p-1.5' : 'size-12 p-1',
        unlocked
          ? 'bg-surface border-amber-300 shadow-xs hover:scale-110 ring-1 ring-amber-300/40'
          : 'bg-fill/60 border-line/60 opacity-45 grayscale',
      )}
      title={unlocked ? 'Émoticône collector débloquée' : 'Émoticône verrouillée'}
    >
      <img
        src={imageUrl}
        alt={`Émoticône Gloire ${tier}`}
        className="size-full object-contain select-none filter drop-shadow-xs"
        loading="lazy"
        draggable={false}
      />
    </div>
  );
}

/**
 * Simulateur interactif de Carte de Combat (Battle Card) Brawl Stars avec assets officiels.
 */
export function BattleCardSimulator({
  player,
  milestone,
  brawler,
  onClose,
}: {
  player: PlayerProfileDto;
  milestone: FameMilestone;
  brawler?: BrawlerCardDto;
  onClose?: () => void;
}) {
  const planet = FAME_PLANETS.find((p) => p.tier === milestone.tier)!;
  const cardUrl = getRewardImageUrl(milestone.tier, 'card');
  const iconUrl = getRewardImageUrl(milestone.tier, 'icon');
  const pinUrl = getRewardImageUrl(milestone.tier, 'pin');

  return (
    <div className="relative overflow-hidden rounded-3xl bg-surface text-ink border border-line p-5 sm:p-7 shadow-2xl max-w-xl w-full">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 rounded-full p-2 text-ink-2 hover:text-ink hover:bg-fill transition-colors z-20"
          aria-label="Fermer"
        >
          <X className="size-5" />
        </button>
      )}

      <div className="text-xs font-semibold uppercase tracking-wider text-ink-2 mb-4">
        Aperçu de la Carte de Combat
      </div>

      {/* Cadre de la Battle Card façon Brawl Stars avec le fond officiel du jeu */}
      <div
        className="relative rounded-2xl overflow-hidden p-5 sm:p-6 border-2 shadow-xl transition-all text-white"
        style={{
          borderColor: planet.colors.border,
          boxShadow: `0 8px 30px ${planet.colors.glow}`,
          background: `radial-gradient(ellipse at top, ${planet.colors.badgeBg} 0%, #0e1222 100%)`,
        }}
      >
        {/* Fond de Carte de Combat officiel superposé en filigrane d'ambiance */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
          <img
            src={cardUrl}
            alt=""
            className="size-full object-cover object-center mix-blend-screen scale-110"
            draggable={false}
          />
        </div>

        {/* Emblème officiel de la planète en fond */}
        <div className="absolute -right-6 -bottom-6 opacity-25 pointer-events-none">
          <PlanetVisual tier={milestone.tier} size={170} />
        </div>

        <div className="relative z-10 flex items-center justify-between gap-4">
          {/* Avatar du joueur et titre */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative shrink-0">
              <PlayerIcon iconId={player.iconId} name={player.name} size={58} />
              {/* Badge d'icône de profil officiel de la gloire en coin */}
              <div className="absolute -bottom-1 -right-1 rounded-full bg-black/90 ring-1 ring-amber-400 p-0.5">
                <img
                  src={iconUrl}
                  alt="Icon"
                  className="size-5 rounded-full object-cover"
                  draggable={false}
                />
              </div>
            </div>

            <div className="min-w-0">
              <PlayerName
                name={player.name}
                color={player.nameColor}
                nameStyle={player.nameStyle}
                className="text-[18px] font-black leading-tight truncate block"
              />
              <div className="flex items-center gap-1.5 text-xs text-white/80 mt-1">
                <span>{player.clubName || player.tag}</span>
                <span>·</span>
                <span className="font-bold" style={{ color: planet.colors.accent }}>
                  {milestone.fullNameFr}
                </span>
              </div>
            </div>
          </div>

          {/* Rang Ranked / Trophées + Émoticône Pin officiel équipé */}
          <div className="shrink-0 flex items-center gap-3">
            {/* Pin officiel de la gloire */}
            <div className="relative rounded-xl bg-black/40 p-1 border border-amber-400/40 shadow-md">
              <img
                src={pinUrl}
                alt="Fame Pin"
                className="size-9 object-contain filter drop-shadow hover:scale-110 transition-transform"
                title={`Émoticône officielle Gloire ${planet.name}`}
                draggable={false}
              />
            </div>

            {player.highestTrophies !== null && (
              <div className="text-right hidden sm:block">
                <div className="flex items-center justify-end gap-1 text-xs text-amber-300 font-bold">
                  <Trophy className="size-3.5 fill-amber-300" />
                  <span>{player.trophies?.toLocaleString('fr-FR') ?? '—'}</span>
                </div>
                <div className="text-[11px] text-white/70">Record {player.highestTrophies.toLocaleString('fr-FR')}</div>
              </div>
            )}
          </div>
        </div>

        {/* Section Brawler et Maîtrise */}
        {brawler && (
          <div className="relative z-10 mt-5 pt-3.5 border-t border-white/15 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BrawlerAvatar id={brawler.id} name={brawler.name} size={40} />
              <div>
                <span className="font-bold text-sm block leading-none">{brawler.name}</span>
                <span className="text-[11px] text-white/75">Rang {brawler.rank} · {brawler.trophies} trophées</span>
              </div>
            </div>

            <span className="rounded-full px-2.5 py-0.5 text-[11px] font-black tracking-wider uppercase bg-white/15 text-white border border-white/20">
              Niveau 11
            </span>
          </div>
        )}

        {/* Bannière basse de la carte : récompense sélectionnée */}
        <div className="relative z-10 mt-3 pt-2 text-center text-[11px] font-semibold tracking-wide uppercase text-white/80">
          <span>{milestone.reward.title}</span>
        </div>
      </div>

      {/* Galerie des 3 cosmétiques officiels du palier */}
      <div className="mt-5 pt-4 border-t border-line">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-3 block mb-2.5">
          Cosmétiques officiels de la Gloire {planet.name}
        </span>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-fill p-3 flex flex-col items-center text-center border border-line">
            <img
              src={cardUrl}
              alt="Fond de carte"
              className="size-12 object-contain filter drop-shadow mb-1.5"
              draggable={false}
            />
            <span className="text-xs font-bold text-ink block">Fond de carte</span>
            <span className="text-[10px] text-ink-3">Niveau I</span>
          </div>

          <div className="rounded-2xl bg-fill p-3 flex flex-col items-center text-center border border-line">
            <img
              src={iconUrl}
              alt="Photo de profil"
              className="size-12 rounded-xl object-cover filter drop-shadow mb-1.5 ring-2 ring-amber-400"
              draggable={false}
            />
            <span className="text-xs font-bold text-ink block">Photo de profil</span>
            <span className="text-[10px] text-ink-3">Niveau II</span>
          </div>

          <div className="rounded-2xl bg-fill p-3 flex flex-col items-center text-center border border-line">
            <img
              src={pinUrl}
              alt="Émoticône"
              className="size-12 object-contain filter drop-shadow mb-1.5"
              draggable={false}
            />
            <span className="text-xs font-bold text-ink block">Émoticône Pin</span>
            <span className="text-[10px] text-ink-3">Niveau III</span>
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-ink-2 space-y-1">
        <p>
          <strong className="text-ink">Débloqué à :</strong>{' '}
          {milestone.cumulativePoints === 0
            ? 'Tous les brawlers débloqués'
            : `${milestone.cumulativePoints.toLocaleString('fr-FR')} points de gloire`}
        </p>
        <p className="leading-relaxed">{milestone.reward.description}</p>
      </div>
    </div>
  );
}
