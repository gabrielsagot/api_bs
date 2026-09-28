import clsx from 'clsx';
import { CircleAlert, CircleCheck, LoaderCircle, Palette, Trash2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { NAME_STYLES, guessNameStyle } from '../../../shared/nameStyles';
import { normalizeTag } from '../../../shared/tags';
import type { KeyStatusDto, PlayerListItem } from '../../../shared/types';
import { PlayerIcon } from '../components/avatars';
import { PlayerName } from '../components/bs';
import { Button, Card, CardHeader, DocLink, ErrorState, LoadingState, PageHeader, Pill } from '../components/ui';
import {
  exportUrl,
  useAddPlayer,
  useBackups,
  useCreateBackup,
  usePlayers,
  useRefresh,
  useRemovePlayer,
  useRenewKey,
  useSetNameStyle,
  useSetPrimary,
  useStatus,
} from '../lib/api';
import { fmtBytes, fmtDate, fmtDateTime, fmtInt, fmtRelative } from '../lib/format';
import { useNow } from '../lib/hooks';

const KEY_MODES: Record<KeyStatusDto['mode'], string> = {
  auto: 'Automatique (compte développeur)',
  manual: 'Clé manuelle',
  none: 'Non configurée',
  demo: 'Mode démo',
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-line py-2.5 text-[14px] first:border-t-0 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-44 shrink-0 text-[13px] text-ink-2">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function AddPlayerForm({ onAdded, autoFocus = false }: { onAdded?: (slug: string) => void; autoFocus?: boolean }) {
  const add = useAddPlayer();
  const [tag, setTag] = useState('');
  const normalized = normalizeTag(tag);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!normalized) return;
    add.mutate(normalized, {
      onSuccess: (player) => {
        setTag('');
        onAdded?.(player.slug);
      },
    });
  };
  return (
    <form onSubmit={submit}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex-1">
          <span className="sr-only">Tag du joueur</span>
          <input
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            placeholder="#2PP0YC8"
            autoFocus={autoFocus}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="h-[40px] w-full rounded-[12px] bg-[#e9e9ee] px-3.5 text-[15px] uppercase outline-none placeholder:normal-case placeholder:text-ink-3"
          />
        </label>
        <Button type="submit" variant="primary" loading={add.isPending} disabled={!normalized} className="h-[40px]">
          Suivre ce joueur
        </Button>
      </div>
      <p className={clsx('mt-2 text-[13px]', add.error ? 'text-bad' : 'text-ink-2')}>
        {add.error
          ? add.error.message
          : tag && !normalized
            ? 'Un tag ne contient que les caractères 0 2 8 9 P Y L Q G R J C U V.'
            : 'Le tag est affiché sous ton pseudo, dans ton profil en jeu.'}
      </p>
    </form>
  );
}

export function SettingsPage() {
  const status = useStatus();
  const players = usePlayers();
  const remove = useRemovePlayer();
  const setPrimary = useSetPrimary();
  const [styling, setStyling] = useState<string | null>(null);
  const refresh = useRefresh();
  const renew = useRenewKey();
  const now = useNow(10_000);

  if (status.isLoading || players.isLoading) return <LoadingState />;
  if (status.error || !status.data) return <ErrorState error={status.error} />;
  const { key, poller, network, data, demo } = status.data;
  const keyOk = key.state === 'ok';

  return (
    <>
      <PageHeader title="Réglages" action={<DocLink section="reglages" />} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader title="Joueurs suivis" subtitle="Tes comptes et ceux de tes potes. Le joueur principal s’ouvre par défaut." />
          <ul>
            {(players.data ?? []).map((player) => (
              <li key={player.slug} className="border-t border-line py-3 first:border-t-0 first:pt-0">
               <div className="flex items-center gap-3">
                <PlayerIcon iconId={player.iconId} name={player.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <PlayerName name={player.name} color={player.nameColor} nameStyle={player.nameStyle} minContrast={2.5} className="truncate text-[15px] font-medium" />
                    {player.isPrimary && <Pill tone="accent">Principal</Pill>}
                  </div>
                  <div className="truncate text-[13px] text-ink-2">
                    {player.tag}
                    {player.trophies !== null && ` · ${fmtInt(player.trophies)} trophées`}
                    {player.lastError && <span className="text-bad"> · {player.lastError}</span>}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  icon={<Palette className="size-4" />}
                  aria-expanded={styling === player.slug}
                  aria-label="Couleur du pseudo"
                  onClick={() => setStyling(styling === player.slug ? null : player.slug)}
                >
                  <span className="hidden sm:inline">Couleur du pseudo</span>
                </Button>
                {!player.isPrimary && (
                  <Button variant="ghost" onClick={() => setPrimary.mutate(player.slug)} className="hidden sm:inline-flex">
                    Définir principal
                  </Button>
                )}
                {!demo && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Ne plus suivre ${player.name} ? Son historique enregistré sera supprimé.`)) remove.mutate(player.slug);
                    }}
                    aria-label={`Ne plus suivre ${player.name}`}
                    title="Ne plus suivre"
                    className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-bad-soft hover:text-bad"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
               </div>
               {styling === player.slug && <NameStylePicker player={player} />}
              </li>
            ))}
          </ul>
          {!demo && (
            <div className="mt-4 border-t border-line pt-4">
              <div className="mb-2 text-[13px] font-medium">Ajouter un joueur</div>
              <AddPlayerForm />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Clé API" />
          <dl>
            <Row label="Gestion">{KEY_MODES[key.mode]}</Row>
            <Row label="État">
              <span className={clsx('inline-flex items-center gap-1.5 font-medium', keyOk ? 'text-good' : key.state === 'pending' ? 'text-ink-2' : 'text-bad')}>
                {keyOk ? <CircleCheck className="size-4" /> : key.state === 'pending' ? <LoaderCircle className="size-4 animate-spin" /> : <CircleAlert className="size-4" />}
                {keyOk ? 'Fonctionnelle' : key.state === 'pending' ? 'En attente' : key.state === 'missing' ? 'Absente' : 'Erreur'}
              </span>
            </Row>
            {key.ip && <Row label={keyOk ? 'IP autorisée' : 'IP à autoriser'}>{key.ip}</Row>}
            {key.message && <Row label="Détail">{key.message}</Row>}
            {key.updatedAt && <Row label="Mise à jour">{fmtDateTime(key.updatedAt)}</Row>}
          </dl>
          {key.mode === 'auto' && (
            <div className="mt-3">
              <Button onClick={() => renew.mutate(undefined)} loading={renew.isPending}>
                Recréer la clé maintenant
              </Button>
            </div>
          )}
          {key.mode === 'none' && (
            <p className="mt-3 rounded-xl bg-fill px-3 py-2.5 text-[13px] text-ink-2">
              Copie <code>.env.example</code> en <code>.env</code>, renseigne l’email et le mot de passe de ton compte
              developer.brawlstars.com, puis relance l’app.
            </p>
          )}
        </Card>

        <Card>
          <CardHeader title="Collecte" subtitle="L’API ne garde que les 25 derniers combats : le dashboard les enregistre au fil de l’eau." />
          <dl>
            <Row label="Dernière collecte">{poller.lastRunAt ? `${fmtRelative(poller.lastRunAt, now)} (${fmtDateTime(poller.lastRunAt)})` : '—'}</Row>
            <Row label="Prochaine">{poller.running ? 'En cours…' : poller.nextRunAt ? fmtRelative(poller.nextRunAt, now) : '—'}</Row>
            <Row label="Fréquence">
              toutes les {Math.round(poller.activeSeconds / 60)} min en session de jeu, {Math.round(poller.idleSeconds / 60)} min au repos
            </Row>
            {poller.lastError && (
              <Row label="Dernière erreur">
                <span className="text-bad">{poller.lastError}</span>
              </Row>
            )}
          </dl>
          {!demo && (
            <div className="mt-3">
              <Button onClick={() => refresh.mutate(undefined)} loading={refresh.isPending || poller.running}>
                Actualiser maintenant
              </Button>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Sur ton téléphone" subtitle="Même réseau Wi-Fi que ce Mac" />
          {network.lanUrls.length ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <img src="/api/qr.svg" alt={`QR code vers ${network.lanUrls[0]}`} className="size-36 shrink-0 rounded-xl ring-1 ring-line" />
              <div className="min-w-0 space-y-2 text-[14px]">
                <p>Scanne le QR code avec l’appareil photo, ou ouvre :</p>
                {network.lanUrls.map((url) => (
                  <p key={url} className="font-medium text-accent">
                    {url}
                  </p>
                ))}
                <p className="text-[13px] text-ink-2">
                  Dans Safari, touche Partager puis « Sur l’écran d’accueil » pour l’ouvrir comme une app. Si la page ne charge pas,
                  autorise Node dans Réglages Système › Réseau › Coupe-feu.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-[14px] text-ink-2">
              Accès limité à cet ordinateur (HOST={network.host}). Mets HOST=0.0.0.0 dans le .env pour l’ouvrir depuis ton téléphone.
            </p>
          )}
        </Card>

        <Card>
          <CardHeader title="Données" subtitle="Tout est stocké en local, dans le dossier data/." />
          <dl>
            <Row label="Suivi depuis">{fmtDate(data.since, true)}</Row>
            <Row label="Joueurs">{fmtInt(data.players)}</Row>
            <Row label="Combats enregistrés">{fmtInt(data.battles)}</Row>
            <Row label="Mesures de profil">{fmtInt(data.snapshots)}</Row>
            <Row label="Taille de la base">{fmtBytes(data.dbSizeBytes)}</Row>
          </dl>
        </Card>

        <BackupsCard demo={demo} />

        <Card className="lg:col-span-2">
          <p className="text-[12px] leading-relaxed text-ink-3">
            Brawl Dashboard {status.data.version} · Données : API officielle Brawl Stars. Images : CDN communautaire Brawlify. Ce
            contenu n’est pas affilié à, approuvé, sponsorisé ou spécifiquement validé par Supercell, et Supercell n’en est pas
            responsable. Pour plus d’informations, consulte la politique de Supercell relative au contenu des fans.
          </p>
        </Card>
      </div>
    </>
  );
}

function BackupsCard({ demo }: { demo: boolean }) {
  const backups = useBackups();
  const create = useCreateBackup();
  const players = usePlayers().data ?? [];
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Sauvegardes et export"
        subtitle="Une copie de la base est faite automatiquement chaque semaine dans data/backups (les 8 dernières sont gardées)."
        action={
          !demo && (
            <Button onClick={() => create.mutate(undefined)} loading={create.isPending}>
              Sauvegarder maintenant
            </Button>
          )
        }
      />
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-[13px] font-medium text-ink-2">Sauvegardes</h3>
          {backups.data?.length ? (
            <ul className="text-[14px]">
              {backups.data.map((backup) => (
                <li key={backup.name} className="flex items-baseline justify-between gap-3 border-t border-line py-2 first:border-t-0">
                  <span className="truncate">{fmtDateTime(backup.createdAt)}</span>
                  <span className="shrink-0 text-[12px] text-ink-3">{fmtBytes(backup.sizeBytes)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-3">Aucune sauvegarde pour l’instant.</p>
          )}
          {create.error && <p className="mt-2 text-[13px] text-bad">{create.error.message}</p>}
        </div>
        <div>
          <h3 className="mb-2 text-[13px] font-medium text-ink-2">Export CSV (Excel, Numbers…)</h3>
          <ul className="text-[14px]">
            {players.map((player) => (
              <li key={player.slug} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-line py-2 first:border-t-0">
                <PlayerName name={player.name} color={player.nameColor} nameStyle={player.nameStyle} minContrast={2.5} className="truncate font-medium" />
                <span className="flex gap-3 text-[13px]">
                  <a href={exportUrl(player.slug, 'combats.csv')} className="font-medium text-accent hover:underline">
                    Combats
                  </a>
                  <a href={exportUrl(player.slug, 'progression.csv')} className="font-medium text-accent hover:underline">
                    Progression
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

/**
 * Choix de la couleur du pseudo, présenté comme l'écran « Choisir la couleur » du jeu
 * (pseudo sur fond sombre). « Automatique » la déduit de la couleur renvoyée par l'API.
 */
function NameStylePicker({ player }: { player: PlayerListItem }) {
  const save = useSetNameStyle();
  const guessed = guessNameStyle(player.nameColor);
  const chip = (id: string | null, label: string, stops: string[]) => {
    const selected = (player.nameStyle ?? null) === id;
    return (
      <button
        key={id ?? 'auto'}
        type="button"
        disabled={save.isPending}
        onClick={() => save.mutate({ slug: player.slug, style: id })}
        aria-pressed={selected}
        className={clsx(
          'flex min-w-0 flex-col items-start gap-1 rounded-xl bg-[#3b4057] px-3 py-2 text-left ring-2 transition-shadow',
          selected ? 'ring-accent' : 'ring-transparent hover:ring-black/20',
        )}
      >
        <span
          className="max-w-full truncate text-[15px] font-bold"
          style={
            stops.length > 1
              ? {
                  backgroundImage: `linear-gradient(90deg, ${stops.join(', ')})`,
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                  WebkitTextFillColor: 'transparent',
                }
              : { color: stops[0] }
          }
        >
          {player.name}
        </span>
        <span className="max-w-full truncate text-[11px] text-white/70">{label}</span>
      </button>
    );
  };
  return (
    <div className="mt-3 rounded-2xl bg-fill/70 p-3">
      <p className="mb-3 text-[13px] text-ink-2">
        L’API ne donne qu’une couleur, pas le dégradé choisi dans le jeu : si le pseudo n’a pas le bon dégradé, choisis-le
        ici. Les styles sont dans le même ordre que l’écran « Choisir la couleur » du jeu.
      </p>
      <div className="mb-2 grid grid-cols-1 sm:grid-cols-3">
        {chip(null, `Automatique${guessed ? ` · ${guessed.label}` : ''}`, guessed?.stops ?? ['#ffffff'])}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{NAME_STYLES.map((style) => chip(style.id, style.label, style.stops))}</div>
    </div>
  );
}
