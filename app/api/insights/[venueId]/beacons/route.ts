import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { userMayAccessBusinessInsights } from "@/lib/server/businessInsightsEligibility";
import { parseMapBeacon, type MapBeaconRecord } from "@/lib/map/mapBeacons";

const SPOTIFY_PREFIX = "spotify:playlist:";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Venue-scoped map beacons: list active pins for managers, and post an official soundtrack beacon.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> },
) {
  try {
    const { venueId } = await params;
    const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await userMayAccessBusinessInsights(supabase, user))) {
      return NextResponse.json(
        { error: "Forbidden: Requires verified business or active venue subscription" },
        { status: 403 },
      );
    }

    const { data: membership, error: membershipError } = await supabase
      .from("venue_managers")
      .select("id")
      .eq("venue_id", venueId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) {
      console.error("insights/[venueId]/beacons venue_managers:", membershipError.message);
      return NextResponse.json({ error: "Failed to verify access" }, { status: 500 });
    }

    if (!membership) {
      return NextResponse.json({ error: "Not a manager for this venue" }, { status: 403 });
    }

    const { data: rpcList, error } = await supabase.rpc("insights_venue_map_beacons_list", {
      venue_id_param: venueId,
    });

    if (error) {
      console.error("insights_venue_map_beacons_list:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rawList = Array.isArray(rpcList) ? rpcList : [];
    const beacons: MapBeaconRecord[] = rawList.map(parseMapBeacon).filter((b): b is MapBeaconRecord => b != null);

    return NextResponse.json({ beacons });
  } catch (e) {
    console.error("GET /api/insights/[venueId]/beacons:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> },
) {
  try {
    const { venueId } = await params;
    const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await userMayAccessBusinessInsights(supabase, user))) {
      return NextResponse.json(
        { error: "Forbidden: Requires verified business or active venue subscription" },
        { status: 403 },
      );
    }

    const { data: membership, error: membershipError } = await supabase
      .from("venue_managers")
      .select("id")
      .eq("venue_id", venueId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json({ error: "Not a manager for this venue" }, { status: 403 });
    }

    const { data: venue, error: venueError } = await supabase
      .from("venues")
      .select("id, latitude, longitude, is_verified")
      .eq("id", venueId)
      .maybeSingle();

    if (venueError || !venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    }

    if (!venue.is_verified) {
      return NextResponse.json(
        { error: "Venue must be verified to broadcast an official soundtrack" },
        { status: 403 },
      );
    }

    const lat = typeof venue.latitude === "number" ? venue.latitude : null;
    const lng = typeof venue.longitude === "number" ? venue.longitude : null;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { error: "Venue latitude and longitude are required to place the official soundtrack" },
        { status: 400 },
      );
    }

    let body: { spotify_playlist_uri?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const uri =
      typeof body.spotify_playlist_uri === "string" ? body.spotify_playlist_uri.trim() : "";
    if (!uri.startsWith(SPOTIFY_PREFIX) || uri.length <= SPOTIFY_PREFIX.length || uri.length > 512) {
      return NextResponse.json(
        { error: "spotify_playlist_uri must be a spotify:playlist: URI (max 512 chars)" },
        { status: 400 },
      );
    }

    const metadata = {
      is_official: true,
      spotify_playlist_uri: uri,
      label: "Official Soundtrack",
    };

    const { data: inserted, error: insertError } = await supabase
      .from("map_beacons")
      .insert({
        creator_id: user.id,
        venue_id: venueId,
        beacon_type: "soundtrack",
        location: `POINT(${lng} ${lat})`,
        metadata,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id, creator_id, venue_id, beacon_type, metadata, created_at, expires_at, location")
      .maybeSingle();

    if (insertError) {
      console.error("map_beacons insert official:", insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    if (!inserted || !isRecord(inserted)) {
      return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    }

    const loc = inserted.location as unknown;
    const wktMatch = typeof loc === "string" ? /POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i.exec(loc) : null;
    const parsed =
      wktMatch != null
        ? { lng: Number(wktMatch[1]), lat: Number(wktMatch[2]) }
        : { lng, lat };
    const beacon = parseMapBeacon({
      ...inserted,
      lat: parsed.lat,
      lng: parsed.lng,
    });

    return NextResponse.json({ beacon });
  } catch (e) {
    console.error("POST /api/insights/[venueId]/beacons:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
