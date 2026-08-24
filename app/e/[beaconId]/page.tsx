import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadPublicEventPayload } from "@/lib/events/publicEvent";
import {
  EVENT_BEACON_UUID_RE,
  eventDisplayTitle,
  isEventEnded,
} from "@/lib/events/eventMetadata";
import { eventDeepLink, eventShareUrl, publicOrigin } from "@/lib/events/eventUrls";
import { formatEventWhen } from "@/lib/events/formatEventWhen";
import { FcButton, FcCard, FcPageShell } from "@/components/fc";
import { CardVisualHero } from "@/components/ui/CardVisualSurface";
import { APP_CONFIG } from "@/lib/config";
import GuestRsvpForm from "@/components/events/GuestRsvpForm";
import MutualAttendeesTeaser from "@/components/events/MutualAttendeesTeaser";
import EventCopyLinkButton from "@/components/events/EventCopyLinkButton";

function isUuidLike(v: string): boolean {
  return EVENT_BEACON_UUID_RE.test(v);
}

async function loadEvent(beaconId: string) {
  const admin = createAdminSupabaseClient();
  return loadPublicEventPayload(admin, beaconId);
}

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
    formatEventWhen(event?.event_start_at ?? null, event?.event_end_at ?? null) ||
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
  const when = formatEventWhen(event.event_start_at, event.event_end_at);
  const ended = isEventEnded({
    event_end_at: event.event_end_at,
    event_start_at: event.event_start_at,
  });
  const showRsvp = event.rsvp_enabled && !ended;
  const mapsUrl =
    event.latitude != null && event.longitude != null
      ? `https://maps.google.com/?q=${event.latitude},${event.longitude}`
      : null;
  const shareUrl = eventShareUrl(beaconId, publicOrigin());

  return (
    <FcPageShell className="px-4 py-8 md:px-8 md:py-12">
      <article className="mx-auto w-full max-w-5xl">
        <CardVisualHero
          id={beaconId}
          imageUrl={event.image_url}
          chipLabel="Event"
          className="h-64 overflow-hidden rounded-[16px] md:h-80"
        >
          <div className="flex h-full flex-col justify-end bg-gradient-to-t from-black/75 via-black/25 to-transparent p-6 md:p-8">
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
                        Open map
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
              <p className="flex items-center gap-2 text-sm font-semibold text-secondary">
                <Users className="h-4 w-4" />
                {event.rsvp_count} going
              </p>
              {description ? (
                <p className="whitespace-pre-wrap text-base leading-relaxed text-on-surface">{description}</p>
              ) : null}
            </FcCard>
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
                <h2 className="text-lg font-bold text-on-surface">RSVP</h2>
                <p className="mb-4 mt-1 text-sm text-on-surface-variant">
                  Save a spot. No Click account needed.
                </p>
                <GuestRsvpForm beaconId={beaconId} />
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
