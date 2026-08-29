import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { CalendarDays, MapPin } from "lucide-react";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadPublicEventPayload } from "@/lib/events/publicEvent";
import {
  EVENT_BEACON_UUID_RE,
  eventDisplayTitle,
  eventIsPast,
  eventSubtitle,
  eventWhereLabel,
} from "@/lib/events/eventMetadata";
import { eventDeepLink, eventShareUrl, publicOrigin } from "@/lib/events/eventUrls";
import { formatEventPostedAt, formatEventWhen } from "@/lib/events/formatEventWhen";
import { FcButton, FcCard } from "@/components/fc";
import { CardVisualHero } from "@/components/ui/CardVisualSurface";
import { APP_CONFIG } from "@/lib/config";
import EventRsvpPanel from "@/components/events/EventRsvpPanel";
import EventBackLink from "@/components/events/EventBackLink";
import SeedRoomTeaser from "@/components/events/SeedRoomTeaser";
import EventCopyLinkButton from "@/components/events/EventCopyLinkButton";
import EventHostRow from "@/components/events/EventHostRow";
import EventGuestPreview from "@/components/events/EventGuestPreview";
import EventPageShell from "@/components/events/EventPageShell";
import PinMapLazy from "@/components/maps/PinMapLazy";
import { loadViewerEventRsvp } from "@/lib/events/viewerEventGoing";
import {
  shouldShowEventFullCard,
  shouldShowEventRsvpPanel,
} from "@/lib/events/eventDetailState";

export const dynamic = "force-dynamic";

function isUuidLike(v: string): boolean {
  return EVENT_BEACON_UUID_RE.test(v);
}

const loadEvent = (beaconId: string) =>
  unstable_cache(
    async () => loadPublicEventPayload(createAdminSupabaseClient(), beaconId),
    ["public-event-v1", beaconId],
    { revalidate: 60 },
  )();

export async function generateMetadata({
  params,
}: {
  params: Promise<{ beaconId: string }>;
}): Promise<Metadata> {
  const { beaconId } = await params;
  const event = isUuidLike(beaconId) ? await loadEvent(beaconId) : null;
  const title = event
    ? eventDisplayTitle(event.title, event.location_name, event.description)
    : "Click event";
  const url = eventShareUrl(beaconId);
  const description =
    eventSubtitle(title, event?.description) ||
    formatEventWhen(event?.event_start_at ?? null, event?.event_end_at ?? null, event?.timezone) ||
    "Open this event in Click.";
  return {
    title: `${title} · Click`,
    description,
    openGraph: {
      title,
      description,
      url,
      type: "website",
      ...(event?.image_url ? { images: [{ url: event.image_url }] } : {}),
    },
  };
}

export default async function EventShareLandingPage({
  params,
}: {
  params: Promise<{ beaconId: string }>;
}) {
  const { beaconId } = await params;
  if (!isUuidLike(beaconId)) notFound();
  const event = await loadEvent(beaconId);
  if (!event) notFound();

  const title = eventDisplayTitle(event.title, event.location_name, event.description);
  const description = eventSubtitle(title, event.description);
  const when = formatEventWhen(event.event_start_at, event.event_end_at, event.timezone);
  const where = eventWhereLabel(event.location_name);
  const posted = formatEventPostedAt(event.created_at);
  const ended = eventIsPast({
    event_end_at: event.event_end_at,
    event_start_at: event.event_start_at,
  });
  const showRsvp = event.rsvp_enabled && !ended;
  const hasPin = event.latitude != null && event.longitude != null;
  const mapsUrl = hasPin
    ? `https://maps.google.com/?q=${event.latitude},${event.longitude}`
    : null;
  const shareUrl = eventShareUrl(beaconId, publicOrigin());
  const reportMailto = `mailto:mepsht@uw.edu?subject=${encodeURIComponent(`Report event ${beaconId}`)}&body=${encodeURIComponent(`Event ID: ${beaconId}\nURL: ${shareUrl}\n\nDescribe the issue:\n`)}`;
  const viewerRsvp = showRsvp || ended ? await loadViewerEventRsvp(beaconId) : { kind: "unknown" as const };
  const going = viewerRsvp.kind === "member" && viewerRsvp.going;
  const requestStatus = viewerRsvp.kind === "member" ? viewerRsvp.request_status : null;
  const atCapacity =
    event.listing.event_capacity != null && event.rsvp_count >= event.listing.event_capacity;
  const showFullCard = shouldShowEventFullCard({ atCapacity, going, requestStatus, ended });
  const showRsvpPanel = shouldShowEventRsvpPanel({
    rsvpEnabled: event.rsvp_enabled,
    ended,
  });

  return (
    <EventPageShell className="py-8 md:py-12">
      <article>
        <EventBackLink />
        <CardVisualHero
          id={beaconId}
          visualSeed={event.visual_seed}
          imageUrl={event.image_url}
          chipLabel="Event"
          className="h-64 overflow-hidden rounded-[16px] md:h-80"
        >
          <div className="flex h-full flex-col justify-end p-6 md:p-8">
            <h1 className="font-display max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-white md:text-5xl">
              {title}
            </h1>
            {when ? <p className="mt-2 text-base font-medium text-white/90 md:text-lg">{when}</p> : null}
          </div>
        </CardVisualHero>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6">
            <FcCard className="space-y-4 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <EventHostRow
                  creatorId={event.creator_id}
                  name={event.host_name}
                  avatarUrl={event.host_avatar_url}
                />
                {posted ? <p className="text-xs text-on-surface-variant">{posted}</p> : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex gap-3">
                  <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-on-surface-variant" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">When</p>
                    <p className={when ? "text-sm font-semibold text-on-surface" : "text-sm text-on-surface-variant"}>
                      {when ?? "Time TBD"}
                    </p>
                  </div>
                </div>
                {where ? (
                  <div className="flex gap-3">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-on-surface-variant" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Where</p>
                      <p className="text-sm font-semibold text-on-surface">{where}</p>
                      {mapsUrl ? (
                        <a href={mapsUrl} className="text-sm font-semibold text-primary hover:underline">
                          Open in Google Maps
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
              {event.rsvp_enabled ? (
                <EventGuestPreview
                  beaconId={beaconId}
                  people={event.attendees}
                  count={event.rsvp_count}
                  listing={event.listing}
                  creatorId={event.creator_id}
                  past={ended}
                />
              ) : null}
              {description ? (
                <p
                  data-testid="event-description"
                  className="max-w-prose whitespace-pre-wrap text-base leading-relaxed text-on-surface-variant"
                >
                  {description}
                </p>
              ) : null}
              <p className="text-sm">
                <a href={reportMailto} className="font-semibold text-on-surface-variant hover:text-on-surface hover:underline">
                  Report event
                </a>
              </p>
            </FcCard>

            <SeedRoomTeaser beaconId={beaconId} />
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <a href={eventDeepLink(beaconId)} className="block max-w-md">
                  <FcButton type="button" className="w-full">
                    Open in Click
                  </FcButton>
                </a>
                <p className="mt-2 text-sm text-on-surface-variant">
                  <a
                    href={APP_CONFIG.ios_store_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-primary hover:underline"
                  >
                    Get the app
                  </a>
                  {" · "}
                  <a
                    href={APP_CONFIG.android_store_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-primary hover:underline"
                  >
                    Android
                  </a>
                </p>
              </div>
              <EventCopyLinkButton url={shareUrl} icon />
            </div>
            <p>
              <Link href="/events" className="text-sm font-semibold text-primary hover:underline">
                Browse public events
              </Link>
            </p>
          </div>

          <aside className="order-first space-y-4 lg:order-none lg:sticky lg:top-24">
            {showFullCard ? (
              <FcCard className="p-6" data-testid="event-state-full">
                <h2 className="text-lg font-bold text-on-surface">This event is full</h2>
                <p className="mt-2 text-sm text-on-surface-variant">Ask the host about the waitlist.</p>
              </FcCard>
            ) : null}
            {showRsvpPanel ? (
              <FcCard className="p-6">
                <EventRsvpPanel
                  beaconId={beaconId}
                  initialViewer={viewerRsvp}
                  listing={event.listing}
                  eventEnded={ended}
                />
              </FcCard>
            ) : (
              <FcCard className="p-6">
                <h2 className="text-lg font-bold text-on-surface">RSVP closed</h2>
                <p className="mt-2 text-sm text-on-surface-variant">Open in Click for recap and connections.</p>
              </FcCard>
            )}
          </aside>
        </div>
        {hasPin ? (
          <div className="mt-6">
            <PinMapLazy
              testId="event-pin-map"
              markers={[
                {
                  id: beaconId,
                  lat: event.latitude as number,
                  lng: event.longitude as number,
                  label: where || title,
                },
              ]}
            />
          </div>
        ) : null}
      </article>
    </EventPageShell>
  );
}
