import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { parseMapBeacon } from "@/lib/map/mapBeacons";
import { rowFromInsertWithLocation } from "@/lib/map/mapBeaconApiShared";

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

/**
 * Single active map beacon (full `metadata` incl. preview URLs) for authenticated clients.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    if (!UUID_RE.test(beaconId)) {
      return NextResponse.json({ error: "Invalid beacon id" }, { status: 400 });
    }

    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("map_beacons")
      .select("id, creator_id, venue_id, beacon_type, show_creator_name, metadata, created_at, expires_at, location")
      .eq("id", beaconId)
      .maybeSingle();

    if (error) {
      console.error("GET /api/beacons/[beaconId]:", error.message);
      return NextResponse.json({ error: "Failed to load beacon" }, { status: 500 });
    }

    if (data == null) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const row = data as Record<string, unknown>;
    const expRaw = row.expires_at;
    const exp = typeof expRaw === "string" ? Date.parse(expRaw) : Number.NaN;
    if (!Number.isFinite(exp) || exp <= Date.now()) {
      return NextResponse.json({ error: "Expired" }, { status: 404 });
    }

    const normalized = rowFromInsertWithLocation(row, 0, 0) as Record<string, unknown>;
    if (row.show_creator_name === true) {
      const { data: creator } = await admin
        .from("users")
        .select("id, name, first_name, last_name")
        .eq("id", row.creator_id as string)
        .maybeSingle();
      if (creator != null) {
        const first = typeof creator.first_name === "string" ? creator.first_name.trim() : "";
        const last = typeof creator.last_name === "string" ? creator.last_name.trim() : "";
        const combined = [first, last].filter((s) => s.length > 0).join(" ").trim();
        normalized.creator_name =
          combined.length > 0
            ? combined
            : typeof creator.name === "string"
              ? creator.name
              : null;
      }
    }

    const beacon = parseMapBeacon(normalized);
    if (beacon == null) {
      return NextResponse.json({ error: "Malformed beacon" }, { status: 500 });
    }

    return NextResponse.json({ beacon });
  } catch (e) {
    console.error("GET /api/beacons/[beaconId]:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
