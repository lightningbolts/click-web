import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadPublicEventPayload } from "@/lib/events/publicEvent";
import {
  EVENT_BEACON_UUID_RE,
  eventDisplayTitle,
  isEventEnded,
} from "@/lib/events/eventMetadata";
import { eventDeepLink, eventShareUrl, publicOrigin } from "@/lib/events/eventUrls";
import { formatEventPostedAt, formatEventWhen } from "@/lib/events/formatEventWhen";
import { FcButton, FcCard, FcPageShell } from "@/components/fc";
import { CardVisualHero } from "@/components/ui/CardVisualSurface";
import { APP_CONFIG } from "@/lib/config";
import EventRsvpPanel from "@/components/events/EventRsvpPanel";
import EventBackLink from "@/components/events/EventBackLink";
import MutualAttendeesTeaser from "@/components/events/MutualAttendeesTeaser";
import EventCopyLinkButton from "@/components/events/EventCopyLinkButton";
import PinMapLazy from "@/components/maps/PinMapLazy";
import { loadViewerEventRsvp } from "@/lib/events/viewerEventGoing";

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
    event?.description?.trim() ||
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
  const description =
    event.description?.trim() && event.description.trim() !== title ? event.description.trim() : null;
  const when = formatEventWhen(event.event_start_at, event.event_end_at, event.timezone);
  const posted = formatEventPostedAt(event.created_at);
  const ended = isEventEnded({
    event_end_at: event.event_end_at,
    event_start_at: event.event_start_at,
  });
  const showRsvp = event.rsvp_enabled && !ended;
  const hasPin = event.latitude != null && event.longitude != null;
  const mapsUrl = hasPin
    ? `https://maps.google.com/?q=${event.latitude},${event.longitude}`
    : null;
  const shareUrl = eventShareUrl(beaconId, publicOrigin());
  const viewerRsvp = showRsvp ? await loadViewerEventRsvp(beaconId) : { kind: "unknown" as const };

  return (
    <FcPageShell className="px-4 py-8 md:px-8 md:py-12">
      <article className="mx-auto w-full max-w-5xl">
        <EventBackLink />
        <CardVisualHero
          id={beaconId}
          imageUrl={event.image_url}
          chipLabel="Event"
          className="h-64 overflow-hidden rounded-[16px] md:h-80"
        >
          <div className="flex h-full flex-col justify-end p-6 md:p-8">
            <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight text-white md:text-5xl">
              {title}
            </h1>
            {when ? <p className="mt-2 text-base font-medium text-white/90 md:text-lg">{when}</p> : null}
          </div>
        </CardVisualHero>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6">
            <FcCard className="space-y-4 p-6">
              {event.host_name ? (
                <p className="text-sm font-medium text-on-surface-variant">Hosted by {event.host_name}</p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex gap-3">
                  <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">When</p>
                    <p className="text-sm font-semibold text-on-surface">{when ?? "Time to be announced"}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Where</p>
                    <p className="text-sm font-semibold text-on-surface">
                      {event.location_name?.trim() || "See map for the pin"}
                    </p>
                    {mapsUrl ? (
                      <a href={mapsUrl} className="text-sm font-semibold text-secondary hover:underline">
                        Open in Google Maps
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
              {posted ? (
                <p className="flex items-center gap-2 text-sm text-on-surface-variant">
                  <Clock className="h-4 w-4 shrink-0 text-secondary" />
                  {posted}
                </p>
              ) : null}
              <p className="flex items-center gap-2 text-sm font-semibold text-secondary">
                <Users className="h-4 w-4" />
                {event.rsvp_count} going
              </p>
              {description ? (
                <p className="whitespace-pre-wrap text-base leading-relaxed text-on-surface">{description}</p>
              ) : null}
            </FcCard>

            {hasPin ? (
              <PinMapLazy
                testId="event-pin-map"
                markers={[
                  {
                    id: beaconId,
                    lat: event.latitude as number,
                    lng: event.longitude as number,
                    label: event.location_name?.trim() || title,
                  },
                ]}
              />
            ) : null}

            <MutualAttendeesTeaser beaconId={beaconId} />
            <div className="flex flex-col gap-3 sm:flex-row">
              <a href={eventDeepLink(beaconId)} className="inline-flex">
                <FcButton type="button">Open in Click</FcButton>
              </a>
              <a href={APP_CONFIG.ios_store_url} target="_blank" rel="noopener noreferrer" className="inline-flex">
                <FcButton type="button" variant="secondary">
                  Get the app
                </FcButton>
              </a>
              <EventCopyLinkButton url={shareUrl} />
            </div>
            <p>
              <Link href="/events" className="text-sm font-semibold text-secondary hover:underline">
                Browse public events
              </Link>
            </p>
          </div>

          <aside className="lg:sticky lg:top-24">
            {showRsvp ? (
              <FcCard className="p-6">
                <EventRsvpPanel beaconId={beaconId} initialViewer={viewerRsvp} />
              </FcCard>
            ) : (
              <FcCard className="p-6">
                <h2 className="text-lg font-bold text-on-surface">{ended ? "This event has ended" : "RSVP closed"}</h2>
                <p className="mt-2 text-sm text-on-surface-variant">Open in Click for recap and connections.</p>
              </FcCard>
            )}
          </aside>
        </div>
      </article>
    </FcPageShell>
  );
}
