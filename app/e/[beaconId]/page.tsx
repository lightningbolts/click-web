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
  eventSubtitle,
  eventWhereLabel,
  isEventEnded,
} from "@/lib/events/eventMetadata";
import { eventDeepLink, eventShareUrl, publicOrigin } from "@/lib/events/eventUrls";
import { formatEventPostedAt, formatEventWhen } from "@/lib/events/formatEventWhen";
import { FcButton, FcCard } from "@/components/fc";
import { CardVisualHero } from "@/components/ui/CardVisualSurface";
import { APP_CONFIG } from "@/lib/config";
import EventRsvpPanel from "@/components/events/EventRsvpPanel";
import EventBackLink from "@/components/events/EventBackLink";
import MutualAttendeesTeaser from "@/components/events/MutualAttendeesTeaser";
import SeedRoomTeaser from "@/components/events/SeedRoomTeaser";
import EventCopyLinkButton from "@/components/events/EventCopyLinkButton";
import EventHostRow from "@/components/events/EventHostRow";
import EventGuestPreview from "@/components/events/EventGuestPreview";
import EventPageShell from "@/components/events/EventPageShell";
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
  const viewerRsvp = showRsvp || ended ? await loadViewerEventRsvp(beaconId) : { kind: "unknown" as const };
  const going = viewerRsvp.kind === "member" && viewerRsvp.going;
  const requestStatus = viewerRsvp.kind === "member" ? viewerRsvp.request_status : null;
  const atCapacity =
    event.listing.event_capacity != null && event.rsvp_count >= event.listing.event_capacity;

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
            <FcCard className="relative space-y-4 p-6">
              {posted ? (
                <p className="absolute right-4 top-4 text-xs text-on-surface-variant">{posted}</p>
              ) : null}
              <EventHostRow
                creatorId={event.creator_id}
                name={event.host_name}
                avatarUrl={event.host_avatar_url}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex gap-3">
                  <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">When</p>
                    <p className={when ? "text-sm font-semibold text-on-surface" : "text-sm text-on-surface-variant"}>
                      {when ?? "Time TBD"}
                    </p>
                  </div>
                </div>
                {where ? (
                  <div className="flex gap-3">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">Where</p>
                      <p className="text-sm font-semibold text-on-surface">{where}</p>
                      {mapsUrl ? (
                        <a href={mapsUrl} className="text-sm font-semibold text-secondary hover:underline">
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
            <SeedRoomTeaser beaconId={beaconId} />
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <a href={eventDeepLink(beaconId)} className="block">
                  <FcButton type="button" className="w-full">
                    Open in Click
                  </FcButton>
                </a>
                <p className="mt-2 text-sm text-on-surface-variant">
                  <a
                    href={APP_CONFIG.ios_store_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-secondary hover:underline"
                  >
                    Get the app
                  </a>
                  {" · "}
                  <a
                    href={APP_CONFIG.android_store_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-secondary hover:underline"
                  >
                    Android
                  </a>
                </p>
              </div>
              <EventCopyLinkButton url={shareUrl} icon />
            </div>
            <p>
              <Link href="/events" className="text-sm font-semibold text-secondary hover:underline">
                Browse public events
              </Link>
            </p>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            {ended ? (
              <FcCard className="p-6">
                <h2 className="text-lg font-bold text-on-surface">This event has ended</h2>
                <p className="mt-2 text-sm text-on-surface-variant">Open in Click for recap and connections.</p>
              </FcCard>
            ) : null}
            {going ? (
              <FcCard className="p-6" data-testid="event-state-going">
                <h2 className="text-lg font-bold text-on-surface">You&apos;re going</h2>
                <p className="mt-2 text-sm text-on-surface-variant">Your Click profile is on the guest list.</p>
              </FcCard>
            ) : null}
            {requestStatus === "pending" ? (
              <FcCard className="p-6" data-testid="event-state-pending">
                <h2 className="text-lg font-bold text-on-surface">Approval pending</h2>
                <p className="mt-2 text-sm text-on-surface-variant">The host is reviewing your request.</p>
              </FcCard>
            ) : null}
            {requestStatus === "waitlisted" || (atCapacity && !going && requestStatus !== "pending") ? (
              <FcCard className="p-6" data-testid="event-state-full">
                <h2 className="text-lg font-bold text-on-surface">
                  {requestStatus === "waitlisted" ? "You're on the waitlist" : "This event is full"}
                </h2>
                <p className="mt-2 text-sm text-on-surface-variant">
                  {requestStatus === "waitlisted"
                    ? "We'll confirm you if a spot opens."
                    : "Ask the host about the waitlist."}
                </p>
              </FcCard>
            ) : null}
            {showRsvp ? (
              <FcCard className="p-6">
                <EventRsvpPanel
                  beaconId={beaconId}
                  initialViewer={viewerRsvp}
                  listing={event.listing}
                  eventEnded={ended}
                />
              </FcCard>
            ) : ended ? null : (
              <FcCard className="p-6">
                <h2 className="text-lg font-bold text-on-surface">RSVP closed</h2>
                <p className="mt-2 text-sm text-on-surface-variant">Open in Click for recap and connections.</p>
              </FcCard>
            )}
          </aside>
        </div>
      </article>
    </EventPageShell>
  );
}
