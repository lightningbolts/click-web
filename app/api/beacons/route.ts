import { NextRequest, NextResponse } from "next/server";
import { runAfterResponse } from "@/lib/server/afterResponse";
import { emitProductEvent } from "@/lib/server/telemetry/productEvents";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { parseMapBeacon, type MapBeaconRecord } from "@/lib/map/mapBeacons";
import {
  enrichSoundtrackMetadata,
  sanitizeClientSoundtrackFields,
  isAllowedMusicShareUrl,
  mergeSoundtrackMetadataOnRelocate,
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
import {
  filterActiveBeaconsForDiscovery,
  parseEventScheduleFromMetadata,
  resolveBeaconExpiresAtIso,
} from "@/lib/map/eventSchedule";
import { filterBeaconsForViewer, parseVisibilityAudienceFromBody } from "@/lib/map/beaconVisibility";
import {
  COLLABORATION_MAP_DROP_WINDOW_MS,
  SQUAD_PIN_MULTIPLIER,
} from "@/lib/collaboration/collaborationTtl";
import { applyVenueScaleToMetadata } from "@/lib/server/eventEngagement";
import { createHubForEventBeacon } from "@/lib/server/eventHubLifecycle";
import { parseBody } from "@/lib/api/parseBody";
import { beaconCreateBodySchema } from "@/lib/api/schemas/beacons";
import {
  eventListingMetadataPatch,
  eventTimeColumnsFromMetadata,
  parseEventListingOptionsFromBody,
} from "@/lib/events/eventOptions";
import {
  expandEventOccurrences,
  parseEventRecurrenceFromBody,
  validateEventRecurrence,
} from "@/lib/events/eventRecurrence";

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
    .select(
      "id, creator_id, venue_id, hub_id, beacon_type, show_creator_name, visibility_audience, metadata, created_at, expires_at, location",
    )
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
      return parseInsertedBeacon(row, Number.NaN, Number.NaN);
    }
  }
  return null;
}

/**
 * Move an existing soundtrack pin to new drop coords and refresh TTL/metadata/visibility.
 * Dedup used to return the stale row unchanged, so proximity fetch at the new GPS missed it.
 * When new enrichment is URL-only, preserve previously rich track/preview/art fields.
 */
async function relocateSoundtrackBeacon(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  existingId: string,
  lat: number,
  lon: number,
  metadata: Record<string, unknown>,
  expiresAtIso: string,
  showCreatorName: boolean,
  visibilityAudience: string,
  existingMetadata?: Record<string, unknown> | null,
): Promise<MapBeaconRecord | null> {
  const mergedMetadata =
    existingMetadata != null
      ? mergeSoundtrackMetadataOnRelocate(existingMetadata, metadata)
      : metadata;
  const { data: updated, error } = await admin
    .from("map_beacons")
    .update({
      location: `POINT(${lon} ${lat})`,
      metadata: mergedMetadata,
      expires_at: expiresAtIso,
      show_creator_name: showCreatorName,
      visibility_audience: visibilityAudience,
    })
    .eq("id", existingId)
    .select(
      "id, creator_id, venue_id, hub_id, beacon_type, show_creator_name, visibility_audience, metadata, created_at, expires_at, location",
    )
    .maybeSingle();

  if (error) {
    console.error("relocateSoundtrackBeacon:", error.message);
    return null;
  }
  return parseInsertedBeacon(updated, lon, lat);
}

const BEACON_PAGE_DEFAULT = 200;
const BEACON_PAGE_MAX = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BeaconPageCursor = { createdAt: string; id: string };

/** Opaque `cursor`: base64url of `{"c": created_at, "i": id}` of the last row of a page. */
function encodeBeaconCursor(cursor: BeaconPageCursor): string {
  return Buffer.from(JSON.stringify({ c: cursor.createdAt, i: cursor.id })).toString("base64url");
}

function decodeBeaconCursor(raw: string | null): BeaconPageCursor | null | "invalid" {
  if (raw == null || raw.trim() === "") return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw.trim(), "base64url").toString("utf8")) as { c?: unknown; i?: unknown };
    if (typeof parsed.c !== "string" || Number.isNaN(Date.parse(parsed.c))) return "invalid";
    if (typeof parsed.i !== "string" || !UUID_RE.test(parsed.i)) return "invalid";
    return { createdAt: parsed.c, id: parsed.i };
  } catch {
    return "invalid";
  }
}

function parsePageLimit(searchParams: URLSearchParams): number {
  const raw = Number(searchParams.get("limit"));
  if (!Number.isFinite(raw) || raw <= 0) return BEACON_PAGE_DEFAULT;
  return Math.min(Math.floor(raw), BEACON_PAGE_MAX);
}

/**
 * Proximity map beacons (PostGIS ST_DWithin via caller-scoped SECURITY DEFINER RPC)
 * after JWT verification. The route never accepts a creator id for own-pin hydration.
 *
 * Paginated newest first: `limit` (default 200, max 500) and an opaque `cursor` from the
 * previous response's `next_cursor` (null once there are no more pages). Pages are cut before
 * visibility filtering, so a page can hold fewer than `limit` beacons while more remain.
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
        { error: "Query params lat and lon (or lng) must be finite numbers" },
        { status: 400 },
      );
    }
    const { lat, lng } = latLon;
    const radius = parseRadiusMeters(searchParams);
    const typeFilter = parseBeaconTypeFilters(searchParams);
    const limit = parsePageLimit(searchParams);
    const cursor = decodeBeaconCursor(searchParams.get("cursor"));
    if (cursor === "invalid") {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }

    // Use the user-scoped client so RPC visibility (auth.uid()) works for connections /
    // core_connections — admin RPC leaves auth.uid() null and drops those rows.
    // One extra row tells whether another page exists.
    const { data, error } = await supabase.rpc("fetch_map_beacons_within_page", {
      lat,
      lng,
      radius_meters: radius,
      p_limit: limit + 1,
      p_before_created_at: cursor?.createdAt ?? null,
      p_before_id: cursor?.id ?? null,
    });

    if (error) {
      console.error("fetch_map_beacons_within_page:", error.message);
      return NextResponse.json({ error: "Failed to load beacons" }, { status: 500 });
    }

    const admin = createAdminSupabaseClient();
    const fetched = normalizeBeaconRpcRows(data);
    const rawList = fetched.slice(0, limit);
    let nextCursor: string | null = null;
    if (fetched.length > limit) {
      const last = rawList[rawList.length - 1] as { created_at?: unknown; id?: unknown } | undefined;
      if (last && typeof last.created_at === "string" && typeof last.id === "string") {
        nextCursor = encodeBeaconCursor({ createdAt: last.created_at, id: last.id });
      }
    }
    let beacons: MapBeaconRecord[] = rawList.map(parseMapBeacon).filter((b): b is MapBeaconRecord => b != null);

    // Always merge the caller's own active beacons (any location) so creators still see
    // pins they dropped even when the map/GPS center is far from the drop site.
    // Use RPC (lat/lng in JSON) — selecting geography `location` via PostgREST often yields
    // opaque EWKB that parseInsertedBeacon cannot decode → own pins silently dropped.
    // First page only: later pages would repeat them.
    if (cursor == null) {
      try {
        // This function deliberately has no user-id parameter. Calling it with the
        // authenticated client keeps auth.uid() scoped to the caller; using the
        // service role here would turn an arbitrary UUID into a location oracle.
        const { data: ownData, error: ownErr } = await supabase.rpc("fetch_my_active_map_beacons", {
          p_limit: 50,
        });
        if (ownErr) {
          console.warn("GET /api/beacons own beacons:", ownErr.message);
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
        console.warn("GET /api/beacons own beacons merge failed:", e);
      }
    }

    beacons = filterBeaconRecords(beacons, typeFilter);
    beacons = filterActiveBeaconsForDiscovery(beacons);
    beacons = await filterBeaconsForViewer(admin, user.id, beacons);
    beacons = await enrichBeaconCreatorNames(admin, beacons);

    return NextResponse.json({ beacons, radius_meters: radius, next_cursor: nextCursor });
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

    const parsed = await parseBody(request, beaconCreateBodySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

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
      metadata = await enrichSoundtrackMetadata(musicUrl, sanitizeClientSoundtrackFields(baseMeta));
    } else {
      const title =
        (typeof baseMeta.title === "string" && baseMeta.title.trim()) ||
        (typeof baseMeta.event_title === "string" && baseMeta.event_title.trim()) ||
        "";
      if (title.length === 0) {
        return NextResponse.json({ error: "metadata.title is required" }, { status: 400 });
      }
      if (title.length > 80) {
        return NextResponse.json({ error: "metadata.title is too long" }, { status: 400 });
      }
      const desc =
        (typeof baseMeta.description === "string" && baseMeta.description.trim()) ||
        (typeof baseMeta.text === "string" && baseMeta.text.trim()) ||
        (typeof baseMeta.message === "string" && baseMeta.message.trim()) ||
        "";
      const descriptionLimit = beacon_type === "event" ? 10_000 : 500;
      if (desc.length > descriptionLimit) {
        return NextResponse.json(
          { error: `metadata.description must be ${descriptionLimit} characters or fewer` },
          { status: 400 },
        );
      }
      metadata = {
        ...metadata,
        title,
        ...(desc.length > 0 ? { description: desc } : {}),
      };
    }

    if (beacon_type === "event") {
      metadata = applyVenueScaleToMetadata(metadata);
    }

    let expiresAtIso: string;
    const expiresResolved = resolveBeaconExpiresAtIso(beacon_type, metadata, body);
    if ("error" in expiresResolved) {
      return NextResponse.json({ error: expiresResolved.error }, { status: 400 });
    }
    expiresAtIso = expiresResolved.expiresAtIso;
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

    let visibilityAudience = parseVisibilityAudienceFromBody(body);
    const eventListing =
      beacon_type === "event" ? parseEventListingOptionsFromBody(body) : null;
    if (eventListing) {
      metadata = { ...metadata, ...eventListingMetadataPatch(eventListing) };
      if (typeof body.event_timezone === "string" && body.event_timezone.trim()) {
        metadata = { ...metadata, event_timezone: body.event_timezone.trim() };
      }
      if (eventListing.event_visibility !== "public" && visibilityAudience === "everyone") {
        visibilityAudience = "connections";
      }
    }
    let occurrenceMetadata: Record<string, unknown>[] = [metadata];
    let seriesId: string | null = null;
    if (eventListing) {
      const recurrenceParsed = parseEventRecurrenceFromBody(body);
      if ("error" in recurrenceParsed) {
        return NextResponse.json({ error: recurrenceParsed.error }, { status: 400 });
      }
      const { recurrence } = recurrenceParsed;
      const schedule = parseEventScheduleFromMetadata(metadata);
      if (recurrence != null && schedule != null) {
        const recurrenceErr = validateEventRecurrence(schedule, recurrence);
        if (recurrenceErr != null) {
          return NextResponse.json({ error: recurrenceErr }, { status: 400 });
        }
        seriesId = crypto.randomUUID();
        occurrenceMetadata = expandEventOccurrences(
          schedule,
          recurrence,
          eventTimeColumnsFromMetadata(metadata).event_timezone,
        ).map((o) => ({
          ...metadata,
          event_start_at: new Date(o.startEpochMs).toISOString(),
          event_end_at: new Date(o.endEpochMs).toISOString(),
        }));
      }
    }

    let venueId: string | null = null;
    const venueIdRaw =
      (typeof body.venue_id === "string" && body.venue_id.trim()) ||
      (typeof body.venueId === "string" && body.venueId.trim()) ||
      "";
    if (venueIdRaw.length > 0) {
      const adminForVenue = createAdminSupabaseClient();
      const { data: membership } = await adminForVenue
        .from("venue_managers")
        .select("id")
        .eq("venue_id", venueIdRaw)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!membership) {
        return NextResponse.json({ error: "Not a manager for this venue" }, { status: 403 });
      }
      venueId = venueIdRaw;
    }

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
          const existingMeta = isRecord(existing.metadata) ? existing.metadata : {};
          const relocated = await relocateSoundtrackBeacon(
            admin,
            existing.id,
            lat,
            lon,
            metadata,
            expiresAtIso,
            showCreatorName,
            visibilityAudience,
            existingMeta,
          );
          const beacon = relocated ?? { ...existing, lat, lng: lon };
          const [enriched] = await enrichBeaconCreatorNames(admin, [beacon]);
          return NextResponse.json({ beacon: enriched ?? beacon, deduplicated: true });
        }
      }
    }

    // A repeating event inserts every occurrence in one statement (all or nothing).
    const rows = occurrenceMetadata.map((meta, i) => {
      const eventTimes = eventListing ? eventTimeColumnsFromMetadata(meta) : null;
      return {
        creator_id: user.id,
        venue_id: venueId,
        beacon_type,
        show_creator_name: showCreatorName,
        visibility_audience: visibilityAudience,
        location: `POINT(${lon} ${lat})`,
        metadata: meta,
        expires_at: i === 0 ? expiresAtIso : (eventTimes?.ends_at ?? expiresAtIso),
        ...(eventListing
          ? {
              event_visibility: eventListing.event_visibility,
              event_capacity: eventListing.event_capacity,
              approval_required: eventListing.approval_required,
              guest_list_visibility: eventListing.guest_list_visibility,
              cover_theme_id: eventListing.cover_theme_id,
              starts_at: eventTimes?.starts_at ?? null,
              ends_at: eventTimes?.ends_at ?? null,
              event_timezone: eventTimes?.event_timezone ?? null,
            }
          : {}),
        ...(seriesId != null ? { series_id: seriesId, series_sequence: i + 1 } : {}),
      };
    });

    const { data: insertedRows, error: insertError } = await supabase
      .from("map_beacons")
      .insert(rows)
      .select(
        "id, creator_id, venue_id, hub_id, beacon_type, show_creator_name, visibility_audience, metadata, created_at, expires_at, location, series_sequence",
      );

    if (insertError) {
      console.error("map_beacons insert (api/beacons):", insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    const inserted = ((insertedRows ?? []) as Record<string, unknown>[])
      .filter((row) => isRecord(row) && typeof row.id === "string")
      .sort((a, b) => Number(a.series_sequence ?? 0) - Number(b.series_sequence ?? 0));
    let insertedRow: Record<string, unknown> | null = inserted[0] ?? null;
    if (beacon_type === "event" && inserted.length > 0) {
      const admin = createAdminSupabaseClient();
      const hubs = await Promise.all(
        inserted.map((row) =>
          createHubForEventBeacon(admin, {
            beaconId: row.id as string,
            creatorId: user.id,
            lat,
            lng: lon,
            metadata: row.metadata as Record<string, unknown>,
          }),
        ),
      );
      const failures = hubs.flatMap((h) => ("error" in h ? [h.error] : []));
      const firstHub = hubs[0];
      if (failures.length > 0 || !("hubId" in firstHub)) {
        // Deleting the events cascades to any hubs that were created.
        await admin.from("map_beacons").delete().in("id", inserted.map((row) => row.id as string));
        console.error("POST /api/beacons event hub:", failures.join("; "));
        return NextResponse.json({ error: "Failed to create event hub" }, { status: 500 });
      }
      insertedRow = {
        ...inserted[0],
        hub_id: firstHub.hubId,
        metadata: { ...(inserted[0].metadata as Record<string, unknown>), hub_id: firstHub.hubId },
      };
    }
    const seriesCount = seriesId != null ? inserted.length : undefined;
    runAfterResponse("product events", () =>
      emitProductEvent(createAdminSupabaseClient(), user.id, "beacon_created", { type: beacon_type }),
    );

    const beacon = parseInsertedBeacon(insertedRow, lon, lat);
    if (beacon == null) {
      // Insert succeeded but PostGIS location was opaque — never 500 after a write.
      if (insertedRow == null || typeof insertedRow !== "object") {
        return NextResponse.json({ error: "Insert failed" }, { status: 500 });
      }
      const row = insertedRow;
      const fallbackBeacon = {
        id: typeof row.id === "string" ? row.id : "",
        creator_id: typeof row.creator_id === "string" ? row.creator_id : user.id,
        venue_id: typeof row.venue_id === "string" ? row.venue_id : null,
        hub_id: typeof row.hub_id === "string" ? row.hub_id : null,
        beacon_type: typeof row.beacon_type === "string" ? row.beacon_type : beacon_type,
        show_creator_name: showCreatorName,
        visibility_audience: visibilityAudience,
        lat,
        lng: lon,
        metadata: (isRecord(row.metadata) ? row.metadata : metadata) as Record<string, unknown>,
        created_at:
          typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
        expires_at:
          typeof row.expires_at === "string" ? row.expires_at : expiresAtIso,
        creator_name: null as string | null,
      };
      if (!fallbackBeacon.id) {
        return NextResponse.json({ error: "Insert failed" }, { status: 500 });
      }
      return NextResponse.json({ beacon: fallbackBeacon, series_count: seriesCount });
    }

    try {
      const admin = createAdminSupabaseClient();
      const [enriched] = await enrichBeaconCreatorNames(admin, [beacon]);
      return NextResponse.json({ beacon: enriched ?? beacon, series_count: seriesCount });
    } catch (enrichErr) {
      console.error("POST /api/beacons enrich:", enrichErr);
      return NextResponse.json({ beacon, series_count: seriesCount });
    }
  } catch (e) {
    console.error("POST /api/beacons:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
