import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PassScanner } from "@/components/events/PassScanner";
import { userMayManageBeacon } from "@/lib/events/beaconManageAuth";
import { EVENT_BEACON_UUID_RE, eventDisplayTitle } from "@/lib/events/eventMetadata";
import { eventScanPath, eventSharePath } from "@/lib/events/eventUrls";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { loadPublicEvent } from "@/lib/server/events/loadPublicEvent";
import { getServerUser } from "@/lib/server/getServerUser";
import { loginHref } from "@/lib/shell/appNav";
import { TIME_ZONE_COOKIE, validTimeZone } from "@/lib/time/viewerTimeZone";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Scan Passes · Click", robots: { index: false } };

/** The host's door scanner (spec 06 §7): the event's creator and its Place's owners and managers. */
export default async function EventScanPage({ params }: { params: Promise<{ beaconId: string }> }) {
  const { beaconId } = await params;
  if (!EVENT_BEACON_UUID_RE.test(beaconId)) notFound();
  const user = await getServerUser();
  if (!user) redirect(loginHref(eventScanPath(beaconId)));

  const [event, jar] = await Promise.all([loadPublicEvent(beaconId).catch(() => null), cookies()]);
  if (!event) notFound();
  const mayScan = await userMayManageBeacon(createAdminSupabaseClient(), user.id, {
    creator_id: event.creator_id ?? "",
    venue_id: event.venue_id,
  }).catch(() => false);
  if (!mayScan) redirect(eventSharePath(beaconId));

  return (
    <PassScanner
      beaconId={beaconId}
      title={eventDisplayTitle(event.title, event.location_name, event.description)}
      closeHref={eventSharePath(beaconId)}
      timeZone={validTimeZone(jar.get(TIME_ZONE_COOKIE)?.value) ?? event.timezone ?? "UTC"}
      ticketed={event.ticketing != null}
    />
  );
}
