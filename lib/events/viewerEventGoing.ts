import { createSupabaseServerClient } from "@/lib/server/supabaseServer";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";

/**
 * Cookie-session RSVP snapshot for the public event page.
 * Never cache this with the public event payload — it is per viewer.
 */
export type ViewerEventRsvpSnapshot =
  | { kind: "guest" }
  | { kind: "member"; going: boolean }
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
    return { kind: "member", going: data != null };
  } catch {
    return { kind: "unknown" };
  }
}
