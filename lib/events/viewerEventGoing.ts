import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";

/**
 * Cookie-session RSVP snapshot for the public event page.
 * Never cache this with the public event payload — it is per viewer.
 */
export type ViewerEventRsvpSnapshot =
  | { kind: "guest" }
  | { kind: "member"; going: boolean; request_status?: "pending" | "waitlisted" | "denied" | null }
  | { kind: "unknown" };

/** `userId` comes from the request's shared `getServerUser()`, so the session is read once. */
export async function loadViewerEventRsvp(
  beaconId: string,
  userId: string | null,
): Promise<ViewerEventRsvpSnapshot> {
  if (!userId) return { kind: "guest" };
  try {
    const admin = createAdminSupabaseClient();
    const [{ data }, { data: request }] = await Promise.all([
      admin.from("beacon_attendees").select("user_id").eq("beacon_id", beaconId).eq("user_id", userId).maybeSingle(),
      admin.from("event_rsvp_requests").select("status").eq("beacon_id", beaconId).eq("user_id", userId).maybeSingle(),
    ]);
    if (data != null) return { kind: "member", going: true };
    const status =
      request && typeof (request as { status?: unknown }).status === "string"
        ? (request as { status: string }).status
        : null;
    if (status === "pending" || status === "waitlisted") {
      return { kind: "member", going: false, request_status: status };
    }
    return { kind: "member", going: false };
  } catch {
    return { kind: "unknown" };
  }
}
