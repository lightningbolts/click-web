import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import {
  haversineMeters,
  insertEngagementEvent,
  loadEventBeaconOrResponse,
  minutesBeforeStart,
  parseEngagementTelemetryBody,
  resolveBeaconCoordinates,
} from "@/lib/server/eventEngagement";
import { parseBody } from "@/lib/api/parseBody";
import { engagementTelemetryBodySchema } from "@/lib/api/schemas/beacons";

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

type UserProfileRow = {
  id: string;
  name: string | null;
  image: string | null;
  first_name: string | null;
  last_name: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** PostgREST may return an embedded FK row as an object or a one-element array. */
function joinedUserProfile(raw: unknown): UserProfileRow | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    return joinedUserProfile(raw[0] ?? null);
  }
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id : null;
  if (id == null) return null;
  return {
    id,
    name: typeof raw.name === "string" ? raw.name : null,
    image: typeof raw.image === "string" ? raw.image : null,
    first_name: typeof raw.first_name === "string" ? raw.first_name : null,
    last_name: typeof raw.last_name === "string" ? raw.last_name : null,
  };
}

function displayNameFromUser(user: UserProfileRow | null): string {
  if (user == null) return "Attendee";
  const first = user.first_name?.trim() ?? "";
  const last = user.last_name?.trim() ?? "";
  const combined = [first, last].filter((s) => s.length > 0).join(" ").trim();
  if (combined.length > 0) return combined;
  const name = user.name?.trim();
  if (name != null && name.length > 0) return name;
  return "Attendee";
}

function parseAttendeeRows(data: unknown): Array<{ user_id: string; signed_up_at: string }> {
  if (!Array.isArray(data)) return [];
  const rows: Array<{ user_id: string; signed_up_at: string }> = [];
  for (const item of data) {
    if (!isRecord(item)) continue;
    const userId = typeof item.user_id === "string" ? item.user_id : null;
    const signedUpAt =
      (typeof item.created_at === "string" ? item.created_at : null) ??
      (typeof item.rsvpd_at === "string" ? item.rsvpd_at : null);
    if (userId == null || signedUpAt == null) continue;
    rows.push({ user_id: userId, signed_up_at: signedUpAt });
  }
  return rows;
}

async function loadAttendeeProfiles(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  userIds: string[],
): Promise<Map<string, UserProfileRow>> {
  const unique = [...new Set(userIds.filter((id) => id.length > 0))];
  if (unique.length === 0) return new Map();

  const { data, error } = await admin
    .from("users")
    .select("id, name, image, first_name, last_name")
    .in("id", unique);

  if (error != null || !Array.isArray(data)) {
    console.error("loadAttendeeProfiles:", error?.message);
    return new Map();
  }

  const out = new Map<string, UserProfileRow>();
  for (const raw of data) {
    const profile = joinedUserProfile(raw);
    if (profile != null) out.set(profile.id, profile);
  }
  return out;
}

/**
 * GET — list RSVP attendees for an event beacon (avatars + display names).
 * POST — current user RSVPs to the beacon.
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
    // Past / expired events still expose who RSVPed (read-only).
    const loaded = await loadEventBeaconOrResponse(admin, beaconId, { allowExpired: true });
    if ("response" in loaded) return loaded.response;

    const { data, error } = await admin
      .from("beacon_attendees")
      .select("user_id, created_at, rsvpd_at")
      .eq("beacon_id", beaconId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("GET /api/beacons/[beaconId]/rsvp:", error.message);
      return NextResponse.json({ error: "Failed to load attendees" }, { status: 500 });
    }

    const attendeeRows = parseAttendeeRows(data);
    const profiles = await loadAttendeeProfiles(
      admin,
      attendeeRows.map((row) => row.user_id),
    );

    const attendees = attendeeRows.map((row) => {
      const profile = profiles.get(row.user_id) ?? null;
      return {
        user_id: row.user_id,
        name: displayNameFromUser(profile),
        avatar_url: profile?.image ?? null,
        signed_up_at: row.signed_up_at,
      };
    });

    return NextResponse.json({
      beacon_id: beaconId,
      attendees,
      current_user_signed_up: attendeeRows.some((row) => row.user_id === user.id),
    });
  } catch (e) {
    console.error("GET /api/beacons/[beaconId]/rsvp:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(
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

    const parsed = await parseBody(request, engagementTelemetryBodySchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const telemetry = parseEngagementTelemetryBody(body);

    const admin = createAdminSupabaseClient();
    const loaded = await loadEventBeaconOrResponse(admin, beaconId);
    if ("response" in loaded) return loaded.response;
    const { beacon } = loaded;

    let distanceMeters: number | null = null;
    if (telemetry.latitude != null && telemetry.longitude != null) {
      const coords = await resolveBeaconCoordinates(admin, beaconId, {
        lat: beacon.lat,
        lng: beacon.lng,
      });
      if (coords.lat != null && coords.lng != null) {
        distanceMeters = haversineMeters(
          telemetry.latitude,
          telemetry.longitude,
          coords.lat,
          coords.lng,
        );
      }
    }

    const mins = minutesBeforeStart(beacon.metadata);

    const { error: insertError } = await admin.from("beacon_attendees").upsert(
      {
        beacon_id: beaconId,
        user_id: user.id,
        latitude: telemetry.latitude,
        longitude: telemetry.longitude,
        accuracy_meters: telemetry.accuracy_meters,
        source: telemetry.source,
        platform: telemetry.platform,
        app_version: telemetry.app_version,
        client_occurred_at: telemetry.client_occurred_at,
        minutes_before_start: mins,
        distance_meters: distanceMeters,
        rsvpd_at: new Date().toISOString(),
      },
      { onConflict: "beacon_id,user_id" },
    );

    if (insertError) {
      console.error("POST /api/beacons/[beaconId]/rsvp:", insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    await insertEngagementEvent(admin, {
      beacon_id: beaconId,
      user_id: user.id,
      venue_id: beacon.venue_id,
      event_type: "rsvp_set",
      latitude: telemetry.latitude,
      longitude: telemetry.longitude,
      accuracy_meters: telemetry.accuracy_meters,
      distance_meters: distanceMeters,
      minutes_before_start: mins,
      client_occurred_at: telemetry.client_occurred_at,
      source: telemetry.source,
      platform: telemetry.platform,
      app_version: telemetry.app_version,
    });

    const profile = (await loadAttendeeProfiles(admin, [user.id])).get(user.id) ?? null;

    return NextResponse.json({
      ok: true,
      attendee: {
        user_id: user.id,
        name: displayNameFromUser(profile),
        avatar_url: profile?.image ?? null,
      },
    });
  } catch (e) {
    console.error("POST /api/beacons/[beaconId]/rsvp:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE — current user cancels their RSVP for the beacon (removes the junction row).
 * Idempotent: returns ok even if no row existed.
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

    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminSupabaseClient();
    // allowExpired: cancel must work after the event window so users can leave a stuck RSVP.
    const loaded = await loadEventBeaconOrResponse(admin, beaconId, { allowExpired: true });
    const venueId = "beacon" in loaded ? loaded.beacon.venue_id : null;

    // Admin client: user-scoped DELETE was hitting RLS and surfacing as RSVP failures.
    const { error: deleteError } = await admin
      .from("beacon_attendees")
      .delete()
      .eq("beacon_id", beaconId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("DELETE /api/beacons/[beaconId]/rsvp:", deleteError.message);
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    await insertEngagementEvent(admin, {
      beacon_id: beaconId,
      user_id: user.id,
      venue_id: venueId,
      event_type: "rsvp_unset",
    });

    return NextResponse.json({ ok: true, user_id: user.id });
  } catch (e) {
    console.error("DELETE /api/beacons/[beaconId]/rsvp:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
