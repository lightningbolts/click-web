import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { parseMapBeacon, type MapBeaconRecord } from "@/lib/map/mapBeacons";

const DEFAULT_RADIUS = 15_000;
const MIN_RADIUS = 100;
const MAX_RADIUS = 50_000;

/**
 * Proximity beacons for the signed-in user's map (RLS: active rows only).
 */
export async function GET(request: NextRequest) {
  try {
    const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const lat = Number(searchParams.get("lat"));
    const lng = Number(searchParams.get("lng"));
    const radiusRaw = searchParams.get("radius_m");
    const radius_m =
      radiusRaw != null && radiusRaw.length > 0
        ? Number(radiusRaw)
        : DEFAULT_RADIUS;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { error: "Query params lat and lng must be finite numbers" },
        { status: 400 },
      );
    }

    const radius = Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, Number.isFinite(radius_m) ? radius_m : DEFAULT_RADIUS));

    const { data, error } = await supabase.rpc("fetch_map_beacons_within", {
      lat,
      lng,
      radius_meters: radius,
    });

    if (error) {
      console.error("fetch_map_beacons_within:", error.message);
      return NextResponse.json({ error: "Failed to load beacons", detail: error.message }, { status: 500 });
    }

    const rawList = Array.isArray(data) ? data : [];
    const beacons: MapBeaconRecord[] = rawList.map(parseMapBeacon).filter((b): b is MapBeaconRecord => b != null);

    return NextResponse.json({ beacons, radius_meters: radius });
  } catch (e) {
    console.error("GET /api/map/beacons:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
