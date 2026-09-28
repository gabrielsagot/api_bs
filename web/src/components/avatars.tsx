import clsx from 'clsx';
import { useState } from 'react';
import { modeLabel, tierName } from '../../../shared/labels';
import { imageUrl } from '../lib/api';
import { modeIconId, tierIconId } from '../lib/bs';

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

function Fallback({ name, size, round }: { name: string | null | undefined; size: number; round?: boolean }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.34) }}
      className={clsx(
        'inline-grid shrink-0 place-items-center bg-fill font-semibold text-ink-2',
        round ? 'rounded-full' : 'rounded-[24%]',
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Portrait du brawler (image locale mise en cache par le serveur, initiales sinon). */
export function BrawlerAvatar({
  id,
  name,
  size = 32,
  muted = false,
  className,
}: {
  id: number | null | undefined;
  name?: string | null;
  size?: number;
  muted?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!id || failed) return <Fallback name={name} size={size} />;
  return (
    <img
      src={imageUrl('brawler', id)}
      alt=""
      title={name ?? undefined}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className={clsx('shrink-0 rounded-[24%] bg-fill object-cover', muted && 'opacity-40 grayscale', className)}
    />
  );
}

export function PlayerIcon({ iconId, name, size = 32 }: { iconId: number | null | undefined; name?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!iconId || failed) return <Fallback name={name} size={size} round />;
  return (
    <img
      src={imageUrl('icon', iconId)}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full bg-fill object-cover"
    />
  );
}

export function MapImage({ eventId, className }: { eventId: number | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!eventId || failed) return null;
  return (
    <img
      src={imageUrl('map', eventId)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={clsx('rounded-xl bg-fill object-cover', className)}
    />
  );
}

/** Petite image sans fond (emblème, icône de mode) : rien si elle manque. */
function Glyph({ src, size, title, className }: { src: string; size: number; title?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={src}
      alt=""
      title={title}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className={clsx('inline-block shrink-0 object-contain', className)}
    />
  );
}

/** Emblème officiel du rang Ranked (Bronze I … Pro). */
export function RankIcon({ tier, size = 20, className }: { tier: number | null | undefined; size?: number; className?: string }) {
  const id = tierIconId(tier);
  if (id === null) return null;
  return <Glyph src={imageUrl('rank', id)} size={size} title={tierName(tier)} className={className} />;
}

/** Icône du mode de jeu (Razzia de gemmes, Brawlball…). */
export function ModeIcon({ mode, size = 16, className }: { mode: string | null | undefined; size?: number; className?: string }) {
  const id = modeIconId(mode);
  if (id === null) return null;
  return <Glyph src={imageUrl('mode', id)} size={size} title={modeLabel(mode)} className={className} />;
}
