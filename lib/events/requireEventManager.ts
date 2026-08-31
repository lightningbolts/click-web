import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import {
  loadBeaconManageRow,
  userMayManageBeacon,
  type BeaconManageRow,
} from "@/lib/events/beaconManageAuth";
import { EVENT_BEACON_UUID_RE } from "@/lib/events/eventMetadata";

export async function requireEventManager(
  request: NextRequest,
  beaconId: string,
): Promise<
  | { ok: true; admin: SupabaseClient; userId: string; beacon: BeaconManageRow }
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
  if (!(await userMayManageBeacon(admin, user.id, beacon))) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, admin, userId: user.id, beacon };
}
