import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { EventPageView } from "@/components/events/EventPageView";
import { brandShareImage } from "@/lib/brand/shareImage";
import {
  EVENT_BEACON_UUID_RE,
  eventDescriptionPlainText,
  eventDisplayTitle,
  eventSubtitle,
} from "@/lib/events/eventMetadata";
import { eventShareUrl } from "@/lib/events/eventUrls";
import { formatEventWhen } from "@/lib/events/formatEventWhen";
import type { PublicEventPayload } from "@/lib/events/publicEvent";
import { loadPublicEvent } from "@/lib/server/events/loadPublicEvent";
import { TIME_ZONE_COOKIE, validTimeZone } from "@/lib/time/viewerTimeZone";

export const dynamic = "force-dynamic";

function isUuidLike(v: string): boolean {
  return EVENT_BEACON_UUID_RE.test(v);
}

async function loadEvent(beaconId: string): Promise<PublicEventPayload | null> {
  return isUuidLike(beaconId) ? loadPublicEvent(beaconId).catch(() => null) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ beaconId: string }>;
}): Promise<Metadata> {
  const { beaconId } = await params;
  const event = await loadEvent(beaconId);
  const title = event
    ? eventDisplayTitle(event.title, event.location_name, event.description)
    : "Click event";
  const url = eventShareUrl(beaconId);
  const description =
    eventSubtitle(title, eventDescriptionPlainText(event?.description)) ||
    formatEventWhen(event?.event_start_at ?? null, event?.event_end_at ?? null, event?.timezone) ||
    "Open this event in Click.";
  const images = event?.image_url ? [{ url: event.image_url }] : [brandShareImage()];
  return {
    title: `${title} · Click`,
    description,
    openGraph: { title, description, url, type: "website", images },
    twitter: {
      card: event?.image_url ? "summary_large_image" : "summary",
      images: event?.image_url ? [event.image_url] : [brandShareImage().url],
    },
    ...(event?.listing.event_visibility === "public" ? {} : { robots: { index: false } }),
  };
}

export default async function EventPage({ params }: { params: Promise<{ beaconId: string }> }) {
  const { beaconId } = await params;
  if (!isUuidLike(beaconId)) notFound();
  const [event, jar] = await Promise.all([loadEvent(beaconId), cookies()]);
  if (!event) notFound();
  const timeZone = validTimeZone(jar.get(TIME_ZONE_COOKIE)?.value) ?? event.timezone ?? "UTC";
  // eslint-disable-next-line react-hooks/purity -- server component, rendered per request
  return <EventPageView event={event} timeZone={timeZone} nowMs={Date.now()} />;
}
