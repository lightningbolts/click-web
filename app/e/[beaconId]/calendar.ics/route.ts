import { NextResponse } from "next/server";
import { icsFile } from "@/lib/events/calendarLinks";
import { EVENT_BEACON_UUID_RE, eventDescriptionPlainText, eventDisplayTitle } from "@/lib/events/eventMetadata";
import { eventShareUrl, publicOrigin } from "@/lib/events/eventUrls";
import { loadPublicEvent } from "@/lib/server/events/loadPublicEvent";

export const dynamic = "force-dynamic";

/** "Add to calendar → Apple / ICS" (spec §7.6.2). A real URL so iOS Safari offers to add it. */
export async function GET(_request: Request, { params }: { params: Promise<{ beaconId: string }> }) {
  const { beaconId } = await params;
  if (!EVENT_BEACON_UUID_RE.test(beaconId)) return new NextResponse("Not found", { status: 404 });
  const event = await loadPublicEvent(beaconId).catch(() => null);
  if (!event) return new NextResponse("Not found", { status: 404 });
  const body = icsFile(
    {
      id: beaconId,
      title: eventDisplayTitle(event.title, event.location_name, event.description),
      startAt: event.event_start_at,
      endAt: event.event_end_at,
      location: event.location_name,
      description: eventDescriptionPlainText(event.description),
      url: eventShareUrl(beaconId, publicOrigin()),
    },
    Date.now(),
  );
  if (!body) return new NextResponse("This event has no date yet", { status: 404 });
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="click-event-${beaconId.slice(0, 8)}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
