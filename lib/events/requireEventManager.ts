import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import {
  eventAccessFor,
  loadBeaconManageRow,
  type BeaconManageRow,
  type EventAccess,
} from "@/lib/events/beaconManageAuth";
import { EVENT_BEACON_UUID_RE } from "@/lib/events/eventMetadata";

/**
 * Gate for organizer routes. Writes need "manage" (creator, Place owner / manager). Read-only
 * GETs pass `allowViewers` so Place viewers can see the manage page (spec §7.6.4).
 */
export async function requireEventManager(
  request: NextRequest,
  beaconId: string,
  options: { allowViewers?: boolean } = {},
): Promise<
  | { ok: true; admin: SupabaseClient; userId: string; beacon: BeaconManageRow; access: EventAccess }
  | { ok: false; response: NextResponse }
> {
  if (!EVENT_BEACON_UUID_RE.test(beaconId)) {
    return { ok: false, response: NextResponse.json({ error: "Invalid beacon id" }, { status: 400 }) };
  }

  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const admin = createAdminSupabaseClient();
  const beacon = await loadBeaconManageRow(admin, beaconId);
  if (beacon == null || beacon.beacon_type !== "event") {
    return { ok: false, response: NextResponse.json({ error: "Event not found" }, { status: 404 }) };
  }
  const access = await eventAccessFor(admin, user.id, beacon);
  if (access == null || (access === "view" && !options.allowViewers)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, admin, userId: user.id, beacon, access };
}
