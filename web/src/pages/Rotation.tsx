import { modeLabel } from '../../../shared/labels';
import type { RotationEventDto } from '../../../shared/types';
import { BrawlerAvatar, MapImage } from '../components/avatars';
import { ModeLabel, modeTextStyle } from '../components/bs';
import { Card, DocLink, EmptyState, ErrorState, LoadingState, Meter, PageHeader, Refetching } from '../components/ui';
import { useRotation } from '../lib/api';
import { fmtPct, fmtRelative, fmtRemaining, plural } from '../lib/format';
import { useNow, usePlayerSlug } from '../lib/hooks';

function EventCard({ event, now }: { event: RotationEventDto; now: number }) {
  const upcoming = Date.parse(event.startTime) > now;
  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3">
        <MapImage eventId={event.eventId} className="size-14 shrink-0" />
        <div className="min-w-0 flex-1">
          <ModeLabel mode={event.mode} size={16} className="flex text-[12px] font-semibold" style={modeTextStyle(event.mode)} />
          <div className="truncate text-[17px] font-semibold tracking-tight">{event.map ?? modeLabel(event.mode)}</div>
          <div className="mt-0.5 text-[12px] text-ink-3">
            {upcoming ? `Commence dans ${fmtRemaining(event.startTime, now)}` : `Se termine dans ${fmtRemaining(event.endTime, now)}`}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-fill/70 px-3 py-2 text-[13px]">
        {event.history.games ? (
          <>
            Toi sur cette map : <span className="font-medium">{fmtPct(event.history.winRate)}</span>{' '}
            <span className="text-ink-2">
              ({event.history.wins} V · {event.history.losses} D)
            </span>
          </>
        ) : (
          <span className="text-ink-2">Jamais jouée depuis le début du suivi.</span>
        )}
      </div>

      <div className="mt-4 flex-1">
        <div className="mb-2 text-[12px] font-medium text-ink-3">Conseillés pour toi</div>
        {event.recommendations.length ? (
          <ol className="space-y-2.5">
            {event.recommendations.map((reco) => (
              <li key={reco.brawlerId} className="flex items-center gap-2.5">
                <BrawlerAvatar id={reco.brawlerId} name={reco.brawlerName} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">{reco.brawlerName}</div>
                  <div className="truncate text-[12px] text-ink-2">
                    {plural(reco.games, 'partie')} {reco.basis === 'map' ? 'ici' : 'dans ce mode'}
                  </div>
                </div>
                <Meter value={reco.winRate} className="w-[112px] shrink-0" />
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[13px] text-ink-2">Pas encore assez de parties dans ce mode pour te conseiller.</p>
        )}
      </div>
    </Card>
  );
}

export function RotationPage() {
  const slug = usePlayerSlug();
  const now = useNow();
  const { data, error, isLoading, isPlaceholderData } = useRotation(slug);
  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState error={error} />;
  return (
    <>
      <PageHeader
        title="Rotation"
        subtitle="Les maps du moment, et les brawlers qui te réussissent le mieux dessus d’après ton historique."
        action={
          <>
            {data.fetchedAt && <span className="text-[12px] text-ink-3">Rotation lue {fmtRelative(data.fetchedAt, now)}</span>}
            <DocLink section="rotation" />
          </>
        }
      />
      <Refetching active={isPlaceholderData}>
        {data.events.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.events.map((event) => (
              <EventCard key={`${event.slotId}-${event.mode}-${event.map}`} event={event} now={now} />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState title="Rotation indisponible">
              Elle sera récupérée à la prochaine collecte (il faut une clé API fonctionnelle).
            </EmptyState>
          </Card>
        )}
      </Refetching>
    </>
  );
}
