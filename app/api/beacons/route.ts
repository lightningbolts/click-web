import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { parseMapBeacon, type MapBeaconRecord, type MapBeaconType } from "@/lib/map/mapBeacons";
import {
  enrichSoundtrackMetadata,
  isAllowedMusicShareUrl,
} from "@/lib/map/beaconSoundtrackEnrichment";
import {
  filterBeaconRecords,
  normalizeBeaconRpcRows,
  normalizeMobileKindToBeaconType,
  parseBeaconTypeFilters,
  parseInsertedBeacon,
  parseLatLon,
  parseRadiusMeters,
} from "@/lib/map/mapBeaconApiShared";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

const MIN_TTL_MS = 15 * 60 * 1000;
const MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function computeExpiresAtIso(body: Record<string, unknown>, beacon_type: MapBeaconType): string {
  const now = Date.now();

  let ttlMs: number | null =
    typeof body.ttl_ms === "number" && Number.isFinite(body.ttl_ms) ? body.ttl_ms : null;
  if (ttlMs != null && ttlMs <= 0) ttlMs = null;

  let expiresExplicit: number | null = null;
  if (typeof body.expires_at === "string") {
    const p = Date.parse(body.expires_at);
    if (Number.isFinite(p)) expiresExplicit = p;
  }

  let candidate: number;
  if (expiresExplicit != null) {
    candidate = expiresExplicit;
  } else if (ttlMs != null) {
    candidate = now + ttlMs;
  } else if (beacon_type === "soundtrack") {
    candidate = now + 7 * 24 * 60 * 60 * 1000;
  } else {
    candidate = now + 24 * 60 * 60 * 1000;
  }

  const minExpire = now + MIN_TTL_MS;
  const maxExpire = now + MAX_TTL_MS;
  candidate = Math.min(Math.max(candidate, minExpire), maxExpire);
  return new Date(candidate).toISOString();
}

/**
 * Proximity map beacons (PostGIS ST_DWithin via SECURITY DEFINER RPC) using the service role
 * on the server after JWT verification — clients never query `map_beacons` directly.
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
        { error: "Query params lat and lon (or lng) must be finite numbers" },
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
      console.error("fetch_map_beacons_within (admin):", error.message);
      return NextResponse.json({ error: "Failed to load beacons", detail: error.message }, { status: 500 });
    }

    const rawList = normalizeBeaconRpcRows(data);
    let beacons: MapBeaconRecord[] = rawList.map(parseMapBeacon).filter((b): b is MapBeaconRecord => b != null);
    beacons = filterBeaconRecords(beacons, typeFilter);

    return NextResponse.json({ beacons, radius_meters: radius });
  } catch (e) {
    console.error("GET /api/beacons:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * Creates a community map beacon for the signed-in user. Soundtrack rows resolve iTunes
 * previews server-side and persist enriched `metadata` JSONB.
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
    }

    const kindRaw =
      (typeof body.kind === "string" && body.kind) ||
      (typeof body.beacon_type === "string" && body.beacon_type) ||
      "";
    const beacon_type = normalizeMobileKindToBeaconType(kindRaw);
    if (beacon_type == null) {
      return NextResponse.json({ error: "Invalid beacon_type / kind" }, { status: 400 });
    }

    const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
    const lon =
      typeof body.lon === "number"
        ? body.lon
        : typeof body.lng === "number"
          ? body.lng
          : Number(body.lon ?? body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json({ error: "lat and lon (or lng) must be finite numbers" }, { status: 400 });
    }

    const metaRaw = body.metadata;
    const baseMeta: Record<string, unknown> = isRecord(metaRaw) ? { ...metaRaw } : {};

    let metadata: Record<string, unknown> = baseMeta;

    if (beacon_type === "soundtrack") {
      const musicUrl =
        (typeof baseMeta.music_url === "string" && baseMeta.music_url.trim()) ||
        (typeof baseMeta.url === "string" && baseMeta.url.trim()) ||
        (typeof baseMeta.link === "string" && baseMeta.link.trim()) ||
        "";
      if (!musicUrl || !isAllowedMusicShareUrl(musicUrl)) {
        return NextResponse.json(
          { error: "Soundtrack metadata must include an allowed https music_url" },
          { status: 400 },
        );
      }
      metadata = await enrichSoundtrackMetadata(musicUrl, baseMeta);
    } else {
      const desc =
        (typeof baseMeta.description === "string" && baseMeta.description.trim()) ||
        (typeof baseMeta.text === "string" && baseMeta.text.trim()) ||
        (typeof baseMeta.message === "string" && baseMeta.message.trim()) ||
        "";
      if (desc.length === 0) {
        return NextResponse.json({ error: "metadata.description is required for this beacon type" }, { status: 400 });
      }
      if (desc.length > 500) {
        return NextResponse.json({ error: "metadata.description is too long" }, { status: 400 });
      }
    }

    const expiresAtIso = computeExpiresAtIso(body, beacon_type);

    const showCreatorName =
      body.show_creator_name === true ||
      body.show_creator_name === "true" ||
      body.showCreatorName === true;

    const { data: inserted, error: insertError } = await supabase
      .from("map_beacons")
      .insert({
        creator_id: user.id,
        venue_id: null,
        beacon_type,
        show_creator_name: showCreatorName,
        location: `POINT(${lon} ${lat})`,
        metadata,
        expires_at: expiresAtIso,
      })
      .select("id, creator_id, venue_id, beacon_type, show_creator_name, metadata, created_at, expires_at, location")
      .maybeSingle();

    if (insertError) {
      console.error("map_beacons insert (api/beacons):", insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    const beacon = parseInsertedBeacon(inserted, lon, lat);
    if (beacon == null) {
      return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    }

    return NextResponse.json({ beacon });
  } catch (e) {
    console.error("POST /api/beacons:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
