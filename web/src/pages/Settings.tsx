import clsx from 'clsx';
import { CircleAlert, CircleCheck, LoaderCircle, Trash2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { normalizeTag } from '../../../shared/tags';
import type { KeyStatusDto } from '../../../shared/types';
import { PlayerIcon } from '../components/avatars';
import { Button, Card, CardHeader, ErrorState, LoadingState, PageHeader, Pill } from '../components/ui';
import { useAddPlayer, usePlayers, useRefresh, useRemovePlayer, useRenewKey, useSetPrimary, useStatus } from '../lib/api';
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
  const refresh = useRefresh();
  const renew = useRenewKey();
  const now = useNow(10_000);

  if (status.isLoading || players.isLoading) return <LoadingState />;
  if (status.error || !status.data) return <ErrorState error={status.error} />;
  const { key, poller, network, data, demo } = status.data;
  const keyOk = key.state === 'ok';

  return (
    <>
      <PageHeader title="Réglages" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader title="Joueurs suivis" subtitle="Tes comptes et ceux de tes potes. Le joueur principal s’ouvre par défaut." />
          <ul>
            {(players.data ?? []).map((player) => (
              <li key={player.slug} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0 first:pt-0">
                <PlayerIcon iconId={player.iconId} name={player.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-medium">{player.name}</span>
                    {player.isPrimary && <Pill tone="accent">Principal</Pill>}
                  </div>
                  <div className="truncate text-[13px] text-ink-2">
                    {player.tag}
                    {player.trophies !== null && ` · ${fmtInt(player.trophies)} trophées`}
                    {player.lastError && <span className="text-bad"> · {player.lastError}</span>}
                  </div>
                </div>
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
