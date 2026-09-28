import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';
import { fameLabel, modeLabel, rarityLabel, tierName } from '../../../shared/labels';
import { fameColor, modeColor, nameColor, rarityColor, readableColor, tierColor } from '../lib/bs';
import { ModeIcon, RankIcon } from './avatars';

// Éléments d'affichage aux couleurs de Brawl Stars, en restant sobres :
// pas de fond coloré, seulement la couleur du texte ou une pastille.

/** Pseudo dans la couleur choisie dans le jeu (couleur du texte par défaut si blanc). */
export function PlayerName({
  name,
  color,
  className,
  minContrast,
}: {
  name: ReactNode;
  color: string | null | undefined;
  className?: string;
  minContrast?: number;
}) {
  const css = nameColor(color, minContrast);
  return (
    <span className={className} style={css ? { color: css } : undefined}>
      {name}
    </span>
  );
}

/** Rang Ranked avec son emblème : « [emblème] Mythique III ». */
export function TierLabel({
  tier,
  size = 18,
  className,
  suffix,
}: {
  tier: number | null | undefined;
  size?: number;
  className?: string;
  suffix?: ReactNode;
}) {
  return (
    <span className={clsx('inline-flex min-w-0 max-w-full items-center gap-1.5 align-middle', className)}>
      <RankIcon tier={tier} size={size} />
      <span className="truncate">
        {tierName(tier)}
        {suffix}
      </span>
    </span>
  );
}

/** Couleur de texte lisible pour un rang (utile pour les grands titres). */
export function tierTextColor(tier: number | null | undefined): string | undefined {
  const color = tierColor(tier);
  return color ? readableColor(color, 3) : undefined;
}

/** Palier de gloire traduit, avec une pastille à sa couleur. */
export function FameBadge({ name, fame, className }: { name: string | null | undefined; fame?: number | null; className?: string }) {
  const label = fameLabel(name);
  if (!label) return null;
  const color = fameColor(name);
  return (
    <span
      className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap', className)}
      title={fame ? `${fame.toLocaleString('fr-FR')} points de gloire` : undefined}
    >
      {color && <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />}
      <span style={color ? { color: readableColor(color, 4.5) } : undefined}>{label}</span>
    </span>
  );
}

/** Rareté d'un brawler avec sa pastille de couleur. */
export function RarityTag({ rarity, className }: { rarity: string | null | undefined; className?: string }) {
  const label = rarityLabel(rarity);
  if (!label) return null;
  const color = rarityColor(rarity);
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      {color && <span className="size-2 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: color }} aria-hidden />}
      {label}
    </span>
  );
}

/** Mode de jeu avec son icône : « [icône] Braquage ». */
export function ModeLabel({
  mode,
  size = 14,
  className,
  style,
}: {
  mode: string | null | undefined;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={clsx('inline-flex min-w-0 items-center gap-1 align-middle', className)} style={style}>
      <ModeIcon mode={mode} size={size} />
      <span className="truncate">{modeLabel(mode)}</span>
    </span>
  );
}

/** Nom du mode dans sa couleur du jeu (assombrie pour rester lisible en petit). */
export function modeTextStyle(mode: string | null | undefined): CSSProperties | undefined {
  const color = modeColor(mode);
  return color ? { color: readableColor(color, 4.5) } : undefined;
}
