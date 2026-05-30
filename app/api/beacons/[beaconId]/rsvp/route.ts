import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";

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

/** Parses an optional finite latitude/longitude pair from a request body. */
function parseRsvpLatLon(body: unknown): { latitude: number | null; longitude: number | null } {
  if (!isRecord(body)) return { latitude: null, longitude: null };
  const lat =
    typeof body.latitude === "number"
      ? body.latitude
      : typeof body.lat === "number"
        ? body.lat
        : Number(body.latitude ?? body.lat);
  const lon =
    typeof body.longitude === "number"
      ? body.longitude
      : typeof body.lng === "number"
        ? body.lng
        : typeof body.lon === "number"
          ? body.lon
          : Number(body.longitude ?? body.lng ?? body.lon);
  return {
    latitude: Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null,
    longitude: Number.isFinite(lon) && lon >= -180 && lon <= 180 ? lon : null,
  };
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

function parseAttendeeRows(data: unknown): Array<{
  user_id: string;
  created_at: string;
  users: UserProfileRow | null;
}> {
  if (!Array.isArray(data)) return [];
  const rows: Array<{ user_id: string; created_at: string; users: UserProfileRow | null }> = [];
  for (const item of data) {
    if (!isRecord(item)) continue;
    const userId = typeof item.user_id === "string" ? item.user_id : null;
    const createdAt = typeof item.created_at === "string" ? item.created_at : null;
    if (userId == null || createdAt == null) continue;
    rows.push({
      user_id: userId,
      created_at: createdAt,
      users: joinedUserProfile(item.users),
    });
  }
  return rows;
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
    const { data: beacon, error: beaconError } = await admin
      .from("map_beacons")
      .select("id, beacon_type, expires_at")
      .eq("id", beaconId)
      .maybeSingle();

    if (beaconError) {
      console.error("GET /api/beacons/[beaconId]/rsvp beacon:", beaconError.message);
      return NextResponse.json({ error: "Failed to load beacon" }, { status: 500 });
    }
    if (beacon == null) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (beacon.beacon_type !== "event") {
      return NextResponse.json({ error: "RSVP is only available for event beacons" }, { status: 400 });
    }

    const expRaw = beacon.expires_at;
    const exp = typeof expRaw === "string" ? Date.parse(expRaw) : Number.NaN;
    if (!Number.isFinite(exp) || exp <= Date.now()) {
      return NextResponse.json({ error: "Expired" }, { status: 404 });
    }

    const { data, error } = await admin
      .from("beacon_attendees")
      .select(
        "user_id, created_at, users:users!beacon_attendees_user_id_fkey(id, name, image, first_name, last_name)",
      )
      .eq("beacon_id", beaconId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("GET /api/beacons/[beaconId]/rsvp:", error.message);
      return NextResponse.json({ error: "Failed to load attendees" }, { status: 500 });
    }

    const attendees = parseAttendeeRows(data).map((row) => ({
      user_id: row.user_id,
      name: displayNameFromUser(row.users),
      avatar_url: row.users?.image ?? null,
      signed_up_at: row.created_at,
    }));

    const { data: selfRow, error: selfError } = await admin
      .from("beacon_attendees")
      .select("user_id")
      .eq("beacon_id", beaconId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (selfError) {
      console.error("GET /api/beacons/[beaconId]/rsvp self:", selfError.message);
      return NextResponse.json({ error: "Failed to load RSVP status" }, { status: 500 });
    }

    return NextResponse.json({
      beacon_id: beaconId,
      attendees,
      current_user_signed_up: selfRow != null,
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

    // Body is optional; when present we persist the attendee's RSVP location.
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const { latitude, longitude } = parseRsvpLatLon(body);

    const admin = createAdminSupabaseClient();
    const { data: beacon, error: beaconError } = await admin
      .from("map_beacons")
      .select("id, beacon_type, expires_at")
      .eq("id", beaconId)
      .maybeSingle();

    if (beaconError) {
      console.error("POST /api/beacons/[beaconId]/rsvp beacon:", beaconError.message);
      return NextResponse.json({ error: "Failed to load beacon" }, { status: 500 });
    }
    if (beacon == null) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (beacon.beacon_type !== "event") {
      return NextResponse.json({ error: "RSVP is only available for event beacons" }, { status: 400 });
    }

    const expRaw = beacon.expires_at;
    const exp = typeof expRaw === "string" ? Date.parse(expRaw) : Number.NaN;
    if (!Number.isFinite(exp) || exp <= Date.now()) {
      return NextResponse.json({ error: "Expired" }, { status: 404 });
    }

    // Upsert via service role: PostgREST upsert requires UPDATE table privilege and an UPDATE
    // RLS policy; the authenticated role only had INSERT/DELETE grants. Auth is enforced above.
    const { error: insertError } = await admin.from("beacon_attendees").upsert(
      {
        beacon_id: beaconId,
        user_id: user.id,
        latitude,
        longitude,
        rsvpd_at: new Date().toISOString(),
      },
      { onConflict: "beacon_id,user_id" },
    );

    if (insertError) {
      console.error("POST /api/beacons/[beaconId]/rsvp:", insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    const { data: profileRaw } = await admin
      .from("users")
      .select("id, name, image, first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();

    const profile = joinedUserProfile(profileRaw);

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

    const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // RLS policy `beacon_attendees_delete_own` scopes this to the caller's own row.
    const { error: deleteError } = await supabase
      .from("beacon_attendees")
      .delete()
      .eq("beacon_id", beaconId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("DELETE /api/beacons/[beaconId]/rsvp:", deleteError.message);
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, user_id: user.id });
  } catch (e) {
    console.error("DELETE /api/beacons/[beaconId]/rsvp:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
