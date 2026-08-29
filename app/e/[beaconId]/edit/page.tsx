import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/server/supabaseServer";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { EVENT_BEACON_UUID_RE } from "@/lib/events/eventMetadata";
import { loadBeaconManageRow, userMayManageBeacon } from "@/lib/events/beaconManageAuth";
import { loadEventEditDraft } from "@/lib/events/eventEditDraft";
import EventCreateForm from "@/components/events/EventCreateForm";
import EventEditSignIn from "@/components/events/EventEditSignIn";
import EventPageShell from "@/components/events/EventPageShell";
import { FcSectionHeader } from "@/components/fc";

export const dynamic = "force-dynamic";

export default async function EventEditPage({
  params,
}: {
  params: Promise<{ beaconId: string }>;
}) {
  const { beaconId } = await params;
  if (!EVENT_BEACON_UUID_RE.test(beaconId)) notFound();

  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  if (!userId) {
    return <EventEditSignIn beaconId={beaconId} />;
  }

  const admin = createAdminSupabaseClient();
  const beacon = await loadBeaconManageRow(admin, beaconId);
  if (beacon == null || beacon.beacon_type !== "event") notFound();
  if (!(await userMayManageBeacon(admin, userId, beacon))) {
    return (
      <EventPageShell className="py-10">
        <p className="text-error">You need to be the organizer to edit this event.</p>
      </EventPageShell>
    );
  }

  const draft = await loadEventEditDraft(admin, beaconId);
  if (draft == null) notFound();

  return (
    <EventPageShell className="py-10">
      <FcSectionHeader title="Edit event" subtitle="Update the details guests see on the event page." />
      <EventCreateForm beaconId={beaconId} initial={draft} />
    </EventPageShell>
  );
}
