import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { EmptyState } from "@/components/ds/EmptyState";
import EventForm from "@/components/events/EventForm";
import { loadBeaconManageRow, userMayManageBeacon } from "@/lib/events/beaconManageAuth";
import { loadEventEditDraft } from "@/lib/events/eventEditDraft";
import { EVENT_BEACON_UUID_RE } from "@/lib/events/eventMetadata";
import { eventEditPath, eventSharePath } from "@/lib/events/eventUrls";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { getServerUser } from "@/lib/server/getServerUser";
import { loginHref } from "@/lib/shell/appNav";
import { TIME_ZONE_COOKIE, validTimeZone } from "@/lib/time/viewerTimeZone";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit event · Click", robots: { index: false } };

export default async function EventEditPage({ params }: { params: Promise<{ beaconId: string }> }) {
  const { beaconId } = await params;
  if (!EVENT_BEACON_UUID_RE.test(beaconId)) notFound();

  const user = await getServerUser();
  if (!user) redirect(loginHref(eventEditPath(beaconId)));

  const admin = createAdminSupabaseClient();
  const beacon = await loadBeaconManageRow(admin, beaconId);
  if (beacon == null || beacon.beacon_type !== "event") notFound();
  // Creator, or an owner / manager of the event's Place. Place viewers can't edit (spec §9.6).
  if (!(await userMayManageBeacon(admin, user.id, beacon))) {
    return (
      <div className="container-content py-16">
        <EmptyState
          icon={Lock}
          title="Only hosts can edit this event"
          body="Ask the host or a manager of its Place to make changes."
          action={
            <Button variant="secondary" href={eventSharePath(beaconId)}>
              View event
            </Button>
          }
        />
      </div>
    );
  }

  const [draft, jar] = await Promise.all([loadEventEditDraft(admin, beaconId), cookies()]);
  if (draft == null) notFound();
  // eslint-disable-next-line react-hooks/purity -- server component, rendered per request
  const nowMs = Date.now();

  return (
    <div className="container-page pb-16 pt-6 md:pt-10">
      <h1 className="type-title-1 mb-6 text-fg md:mb-8">Edit event</h1>
      <EventForm
        beaconId={beaconId}
        initial={draft}
        defaultTimeZone={validTimeZone(jar.get(TIME_ZONE_COOKIE)?.value)}
        nowMs={nowMs}
      />
    </div>
  );
}
