import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { parseMapBeacon, type MapBeaconRecord } from "@/lib/map/mapBeacons";
import {
  filterBeaconRecords,
  normalizeBeaconRpcRows,
  parseBeaconTypeFilters,
  parseLatLon,
  parseRadiusMeters,
  enrichBeaconCreatorNames,
} from "@/lib/map/mapBeaconApiShared";
import { filterActiveBeaconsForDiscovery } from "@/lib/map/eventSchedule";
import { filterBeaconsForViewer } from "@/lib/map/beaconVisibility";

/**
 * Legacy path: identical behavior to `GET /api/beacons` (admin RPC + optional filters).
 * Prefer `/api/beacons` for new clients.
 */
export async function GET(request: NextRequest) {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const latLon = parseLatLon(searchParams);
    if (latLon == null) {
      return NextResponse.json(
        { error: "Query params lat and lng (or lon) must be finite numbers" },
        { status: 400 },
      );
    }
    const { lat, lng } = latLon;
    const radius = parseRadiusMeters(searchParams);
    const typeFilter = parseBeaconTypeFilters(searchParams);

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.rpc("fetch_map_beacons_within", {
      lat,
      lng,
      radius_meters: radius,
    });

    if (error) {
      console.error("fetch_map_beacons_within:", error.message);
      return NextResponse.json({ error: "Failed to load beacons", detail: error.message }, { status: 500 });
    }

    const rawList = normalizeBeaconRpcRows(data);
    let beacons: MapBeaconRecord[] = rawList.map(parseMapBeacon).filter((b): b is MapBeaconRecord => b != null);
    beacons = filterBeaconRecords(beacons, typeFilter);
    beacons = filterActiveBeaconsForDiscovery(beacons);
    beacons = await filterBeaconsForViewer(admin, user.id, beacons);
    beacons = await enrichBeaconCreatorNames(admin, beacons);

    return NextResponse.json({ beacons, radius_meters: radius });
  } catch (e) {
    console.error("GET /api/map/beacons:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
