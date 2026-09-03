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
 * Legacy path: identical behavior to `GET /api/beacons`.
 * Prefer `/api/beacons` for new clients.
 */
export async function GET(request: NextRequest) {
  try {
    const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
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

    // User-scoped RPC so auth.uid() visibility works (admin leaves uid null).
    const { data, error } = await supabase.rpc("fetch_map_beacons_within", {
      lat,
      lng,
      radius_meters: radius,
      p_limit: 200,
    });

    if (error) {
      console.error("fetch_map_beacons_within:", error.message);
      return NextResponse.json({ error: "Failed to load beacons" }, { status: 500 });
    }

    const admin = createAdminSupabaseClient();
    const rawList = normalizeBeaconRpcRows(data);
    let beacons: MapBeaconRecord[] = rawList.map(parseMapBeacon).filter((b): b is MapBeaconRecord => b != null);

    try {
      // Caller-scoped RPC: never pass a user id through a service-role location
      // query, or another caller can substitute it to enumerate active pins.
      const { data: ownData, error: ownErr } = await supabase.rpc("fetch_my_active_map_beacons", {
        p_limit: 50,
      });
      if (ownErr) {
        console.warn("GET /api/map/beacons own beacons:", ownErr.message);
      } else {
        const ownParsed = normalizeBeaconRpcRows(ownData)
          .map(parseMapBeacon)
          .filter((b): b is MapBeaconRecord => b != null);
        if (ownParsed.length > 0) {
          const byId = new Map<string, MapBeaconRecord>();
          for (const b of beacons) byId.set(b.id, b);
          for (const b of ownParsed) byId.set(b.id, b);
          beacons = Array.from(byId.values());
        }
      }
    } catch (e) {
      console.warn("GET /api/map/beacons own beacons merge failed:", e);
    }

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
