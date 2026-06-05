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
  enrichBeaconCreatorNames,
} from "@/lib/map/mapBeaconApiShared";
import { filterBeaconsForViewer, parseVisibilityAudienceFromBody } from "@/lib/map/beaconVisibility";
import {
  COLLABORATION_MAP_DROP_WINDOW_MS,
  SQUAD_PIN_MULTIPLIER,
} from "@/lib/collaboration/collaborationTtl";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function normalizeMusicUrlForDedup(raw: string): string {
  const trimmed = raw.trim();
  try {
    const u = new URL(trimmed);
    u.hash = "";
    return u.toString().toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

function musicUrlsFromMetadata(meta: Record<string, unknown>): string[] {
  const keys = ["original_url", "music_url", "url", "link", "spotify_id", "apple_music_id"];
  const out: string[] = [];
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim().length > 0) {
      out.push(normalizeMusicUrlForDedup(v));
    }
  }
  return out;
}

async function findActiveSoundtrackBeacon(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  creatorId: string,
  musicUrl: string,
): Promise<MapBeaconRecord | null> {
  const target = normalizeMusicUrlForDedup(musicUrl);
  const { data, error } = await admin
    .from("map_beacons")
    .select("id, creator_id, venue_id, beacon_type, show_creator_name, metadata, created_at, expires_at, location")
    .eq("creator_id", creatorId)
    .eq("beacon_type", "soundtrack")
    .gt("expires_at", new Date().toISOString());

  if (error || !Array.isArray(data)) {
    if (error) {
      console.error("findActiveSoundtrackBeacon:", error.message);
    }
    return null;
  }

  for (const row of data) {
    if (!isRecord(row)) continue;
    const meta = isRecord(row.metadata) ? row.metadata : {};
    const urls = musicUrlsFromMetadata(meta);
    if (urls.includes(target)) {
      return parseInsertedBeacon(row, 0, 0);
    }
  }
  return null;
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
    beacons = await filterBeaconsForViewer(admin, user.id, beacons);
    beacons = await enrichBeaconCreatorNames(admin, beacons);

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
    let squadMultiplier = 1.0;

    const encounterIdRaw =
      (typeof body.encounter_id === "string" && body.encounter_id.trim()) ||
      (typeof body.encounterId === "string" && body.encounterId.trim()) ||
      "";
    if (encounterIdRaw.length > 0) {
      const admin = createAdminSupabaseClient();
      const { data: session, error: sessionErr } = await admin
        .from("collaboration_sessions")
        .select("id, created_at")
        .eq("id", encounterIdRaw)
        .maybeSingle();

      if (sessionErr || !session) {
        return NextResponse.json(
          { error: "Invalid or unknown encounter_id" },
          { status: 400 },
        );
      }

      const createdMs = Date.parse(String(session.created_at));
      const ageMs = Number.isFinite(createdMs) ? Date.now() - createdMs : Number.POSITIVE_INFINITY;
      if (ageMs > COLLABORATION_MAP_DROP_WINDOW_MS) {
        return NextResponse.json(
          { error: "encounter_id expired (must be within 15 minutes of bump)" },
          { status: 400 },
        );
      }

      squadMultiplier = SQUAD_PIN_MULTIPLIER;
      metadata = {
        ...metadata,
        encounter_id: encounterIdRaw,
        squad_multiplier: squadMultiplier,
        radius_multiplier: squadMultiplier,
      };
    }

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

    let expiresAtIso = computeExpiresAtIso(body, beacon_type);
    if (squadMultiplier > 1.0) {
      const baseMs = Date.parse(expiresAtIso);
      const now = Date.now();
      if (Number.isFinite(baseMs) && baseMs > now) {
        const ttlMs = baseMs - now;
        expiresAtIso = new Date(now + ttlMs * squadMultiplier).toISOString();
      }
    }

    const showCreatorName =
      body.show_creator_name === true ||
      body.show_creator_name === "true" ||
      body.showCreatorName === true;

    const visibilityAudience = parseVisibilityAudienceFromBody(body);

    if (beacon_type === "soundtrack") {
      const musicUrl =
        (typeof metadata.original_url === "string" && metadata.original_url.trim()) ||
        (typeof metadata.music_url === "string" && metadata.music_url.trim()) ||
        (typeof metadata.url === "string" && metadata.url.trim()) ||
        (typeof metadata.link === "string" && metadata.link.trim()) ||
        "";
      if (musicUrl.length > 0) {
        const admin = createAdminSupabaseClient();
        const existing = await findActiveSoundtrackBeacon(admin, user.id, musicUrl);
        if (existing != null) {
          const [enrichedExisting] = await enrichBeaconCreatorNames(admin, [existing]);
          return NextResponse.json({ beacon: enrichedExisting ?? existing, deduplicated: true });
        }
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from("map_beacons")
      .insert({
        creator_id: user.id,
        venue_id: null,
        beacon_type,
        show_creator_name: showCreatorName,
        visibility_audience: visibilityAudience,
        location: `POINT(${lon} ${lat})`,
        metadata,
        expires_at: expiresAtIso,
      })
      .select(
        "id, creator_id, venue_id, beacon_type, show_creator_name, visibility_audience, metadata, created_at, expires_at, location",
      )
      .maybeSingle();

    if (insertError) {
      console.error("map_beacons insert (api/beacons):", insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    const beacon = parseInsertedBeacon(inserted, lon, lat);
    if (beacon == null) {
      return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    }

    const admin = createAdminSupabaseClient();
    const [enriched] = await enrichBeaconCreatorNames(admin, [beacon]);

    return NextResponse.json({ beacon: enriched ?? beacon });
  } catch (e) {
    console.error("POST /api/beacons:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
