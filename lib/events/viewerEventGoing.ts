import { createSupabaseServerClient } from "@/lib/server/supabaseServer";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";

/**
 * Cookie-session RSVP snapshot for the public event page.
 * Never cache this with the public event payload — it is per viewer.
 */
export type ViewerEventRsvpSnapshot =
  | { kind: "guest" }
  | { kind: "member"; going: boolean; request_status?: "pending" | "waitlisted" | "denied" | null }
  | { kind: "unknown" };

export async function loadViewerEventRsvp(beaconId: string): Promise<ViewerEventRsvpSnapshot> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { kind: "unknown" };
  }
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "guest" };
    const admin = createAdminSupabaseClient();
    const { data } = await admin
      .from("beacon_attendees")
      .select("user_id")
      .eq("beacon_id", beaconId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (data != null) return { kind: "member", going: true };
    const { data: request } = await admin
      .from("event_rsvp_requests")
      .select("status")
      .eq("beacon_id", beaconId)
      .eq("user_id", user.id)
      .maybeSingle();
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
