import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { parseMapBeacon, type MapBeaconType } from "@/lib/map/mapBeacons";
import { rowFromInsertWithLocation } from "@/lib/map/mapBeaconApiShared";
import { applyVenueScaleToMetadata } from "@/lib/server/eventEngagement";
import { findHubForEventBeacon, syncEventHubFromBeacon } from "@/lib/server/eventHubLifecycle";
import { parseBody } from "@/lib/api/parseBody";
import { beaconPatchBodySchema } from "@/lib/api/schemas/beacons";
import {
  eventListingMetadataPatch,
  eventTimeColumnsFromMetadata,
  eventVisibilityToMapAudience,
  parseEventListingOptionsFromBody,
} from "@/lib/events/eventOptions";

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

async function resolveBeaconAndVerifyCreator(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  beaconId: string,
  userId: string,
) {
  const { data, error } = await admin
    .from("map_beacons")
    .select("id, creator_id, venue_id, beacon_type, show_creator_name, metadata, created_at, expires_at, location")
    .eq("id", beaconId)
    .maybeSingle();

  if (error) {
    return {
      row: null,
      errorResponse: NextResponse.json({ error: "Failed to load beacon" }, { status: 500 }),
    };
  }
  if (data == null) {
    return { row: null, errorResponse: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }

  const row = data as Record<string, unknown>;
  if (row.creator_id !== userId) {
    return {
      row: null,
      errorResponse: NextResponse.json(
        { error: "Only the beacon creator can modify this beacon" },
        { status: 403 },
      ),
    };
  }

  const beaconType = typeof row.beacon_type === "string" ? row.beacon_type : "";
  if (beaconType !== "event") {
    const expRaw = row.expires_at;
    const exp = typeof expRaw === "string" ? Date.parse(expRaw) : Number.NaN;
    if (!Number.isFinite(exp) || exp <= Date.now()) {
      return { row: null, errorResponse: NextResponse.json({ error: "Expired" }, { status: 404 }) };
    }
  }

  return { row, errorResponse: null };
}

async function enrichBeaconRow(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  row: Record<string, unknown>,
): Promise<ReturnType<typeof parseMapBeacon>> {
  // Never fall back to (0,0) — that poisons mobile map pins (null island).
  // Prefer NaN so parseMapBeacon rejects unparseable locations instead of inventing coords.
  const normalized = rowFromInsertWithLocation(row, Number.NaN, Number.NaN) as Record<string, unknown>;
  const beaconId = typeof row.id === "string" ? row.id : "";
  if (beaconId) {
    const hub = await findHubForEventBeacon(admin, beaconId);
    if (hub?.id) normalized.hub_id = hub.id;
  }
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
  return parseMapBeacon(normalized);
}

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
    // Authenticated single-beacon GET serves expired rows too (chat / profile history).
    // Discovery list routes still filter by expires_at; mutations still reject expired.
    const expRaw = row.expires_at;
    const exp = typeof expRaw === "string" ? Date.parse(expRaw) : Number.NaN;
    const expired = Number.isFinite(exp) && exp <= Date.now();

    const beacon = await enrichBeaconRow(admin, row);
    if (beacon == null) {
      return NextResponse.json({ error: "Malformed beacon" }, { status: 500 });
    }

    return NextResponse.json({ beacon, expired });
  } catch (e) {
    console.error("GET /api/beacons/[beaconId]:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PATCH — update metadata, show_creator_name, or TTL for the creator's beacon.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    if (!UUID_RE.test(beaconId)) {
      return NextResponse.json({ error: "Invalid beacon id" }, { status: 400 });
    }

    const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = await parseBody(request, beaconPatchBodySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as Record<string, unknown>;

    const admin = createAdminSupabaseClient();
    const { row, errorResponse } = await resolveBeaconAndVerifyCreator(admin, beaconId, user.id);
    if (errorResponse != null) return errorResponse;
    if (row == null) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const beaconType = row.beacon_type as MapBeaconType;
    const existingMeta = isRecord(row.metadata) ? { ...row.metadata } : {};
    const patch: Record<string, unknown> = {};

    if (body.show_creator_name !== undefined || body.showCreatorName !== undefined) {
      patch.show_creator_name =
        body.show_creator_name === true ||
        body.show_creator_name === "true" ||
        body.showCreatorName === true;
    }

    const metaPatch = body.metadata;
    if (isRecord(metaPatch)) {
      const nextMeta = { ...existingMeta, ...metaPatch };
      if (beaconType !== "soundtrack") {
        const titlePatch =
          (typeof metaPatch.title === "string" && metaPatch.title.trim()) ||
          (typeof metaPatch.event_title === "string" && metaPatch.event_title.trim()) ||
          "";
        if (titlePatch.length > 80) {
          return NextResponse.json({ error: "metadata.title is too long" }, { status: 400 });
        }
        if (titlePatch.length > 0) {
          nextMeta.title = titlePatch;
        }
        const descPresent =
          "description" in metaPatch || "text" in metaPatch || "message" in metaPatch;
        const desc =
          (typeof metaPatch.description === "string" && metaPatch.description.trim()) ||
          (typeof metaPatch.text === "string" && metaPatch.text.trim()) ||
          (typeof metaPatch.message === "string" && metaPatch.message.trim()) ||
          "";
        if (desc.length > 500) {
          return NextResponse.json({ error: "metadata.description is too long" }, { status: 400 });
        }
        if (descPresent) {
          nextMeta.description = desc;
        }
      }
      patch.metadata =
        beaconType === "event" ? applyVenueScaleToMetadata(nextMeta) : nextMeta;
    }

    if (beaconType === "event") {
      const metaSource = isRecord(body.metadata) ? body.metadata : {};
      const listingTouched = [
        "event_visibility",
        "event_capacity",
        "approval_required",
        "guest_list_visibility",
        "cover_theme_id",
      ].some((key) => key in body || key in metaSource);
      if (listingTouched) {
        const eventListing = parseEventListingOptionsFromBody(body);
        const nextMeta = isRecord(patch.metadata)
          ? { ...patch.metadata, ...eventListingMetadataPatch(eventListing) }
          : { ...existingMeta, ...eventListingMetadataPatch(eventListing) };
        if (typeof body.event_timezone === "string" && body.event_timezone.trim()) {
          nextMeta.event_timezone = body.event_timezone.trim();
        }
        patch.metadata = applyVenueScaleToMetadata(nextMeta);
        patch.event_visibility = eventListing.event_visibility;
        patch.event_capacity = eventListing.event_capacity;
        patch.approval_required = eventListing.approval_required;
        patch.guest_list_visibility = eventListing.guest_list_visibility;
        patch.cover_theme_id = eventListing.cover_theme_id;
        patch.visibility_audience = eventVisibilityToMapAudience(eventListing.event_visibility);
      }
      const timeMeta = isRecord(patch.metadata) ? patch.metadata : existingMeta;
      if (
        "event_start_at" in metaSource ||
        "event_end_at" in metaSource ||
        "event_timezone" in body ||
        "event_timezone" in metaSource
      ) {
        const eventTimes = eventTimeColumnsFromMetadata(timeMeta);
        patch.starts_at = eventTimes.starts_at;
        patch.ends_at = eventTimes.ends_at;
        patch.event_timezone = eventTimes.event_timezone;
      }

      const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
      const lon =
        typeof body.lon === "number"
          ? body.lon
          : typeof body.lng === "number"
            ? body.lng
            : Number(body.lon ?? body.lng);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        patch.location = `POINT(${lon} ${lat})`;
      }
    }

    if (typeof body.expires_at === "string") {
      const parsed = Date.parse(body.expires_at);
      if (Number.isFinite(parsed) && parsed > Date.now()) {
        patch.expires_at = new Date(parsed).toISOString();
      }
    } else if (typeof body.ttl_ms === "number" && Number.isFinite(body.ttl_ms) && body.ttl_ms > 0) {
      patch.expires_at = new Date(Date.now() + body.ttl_ms).toISOString();
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No patchable fields provided" }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("map_beacons")
      .update(patch)
      .eq("id", beaconId)
      .eq("creator_id", user.id)
      .select("id, creator_id, venue_id, beacon_type, show_creator_name, metadata, created_at, expires_at, location")
      .maybeSingle();

    if (updateError) {
      console.error("PATCH /api/beacons/[beaconId]:", updateError.message);
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
    if (updated == null) {
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    const beacon = await enrichBeaconRow(admin, updated as Record<string, unknown>);
    if (beacon == null) {
      return NextResponse.json({ error: "Malformed beacon" }, { status: 500 });
    }

    if (beaconType === "event") {
      await syncEventHubFromBeacon(admin, {
        beaconId,
        lat: beacon.lat,
        lng: beacon.lng,
        metadata: beacon.metadata,
      });
    }

    return NextResponse.json({ beacon });
  } catch (e) {
    console.error("PATCH /api/beacons/[beaconId]:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE — remove the creator's beacon (idempotent: second delete returns 404).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    if (!UUID_RE.test(beaconId)) {
      return NextResponse.json({ error: "Invalid beacon id" }, { status: 400 });
    }

    const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    const { row, errorResponse } = await resolveBeaconAndVerifyCreator(admin, beaconId, user.id);
    if (errorResponse != null) return errorResponse;
    if (row == null) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("map_beacons")
      .delete()
      .eq("id", beaconId)
      .eq("creator_id", user.id);

    if (deleteError) {
      console.error("DELETE /api/beacons/[beaconId]:", deleteError.message);
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: beaconId });
  } catch (e) {
    console.error("DELETE /api/beacons/[beaconId]:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
