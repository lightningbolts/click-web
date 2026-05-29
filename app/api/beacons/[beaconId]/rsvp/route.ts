import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

type AttendeeRow = {
  user_id: string;
  created_at: string;
  users: {
    id: string;
    name: string | null;
    image: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

function displayNameFromUser(user: AttendeeRow["users"]): string {
  if (user == null) return "Attendee";
  const first = user.first_name?.trim() ?? "";
  const last = user.last_name?.trim() ?? "";
  const combined = [first, last].filter((s) => s.length > 0).join(" ").trim();
  if (combined.length > 0) return combined;
  const name = user.name?.trim();
  if (name != null && name.length > 0) return name;
  return "Attendee";
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

    const attendees = (data as AttendeeRow[]).map((row) => ({
      user_id: row.user_id,
      name: displayNameFromUser(row.users),
      avatar_url: row.users?.image ?? null,
      signed_up_at: row.created_at,
    }));

    return NextResponse.json({
      beacon_id: beaconId,
      attendees,
      current_user_signed_up: attendees.some((a) => a.user_id === user.id),
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

    const { supabase, user, authError } = await getSupabaseFromRouteRequest(request);
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

    const { error: insertError } = await supabase.from("beacon_attendees").upsert(
      {
        beacon_id: beaconId,
        user_id: user.id,
      },
      { onConflict: "beacon_id,user_id", ignoreDuplicates: true },
    );

    if (insertError) {
      console.error("POST /api/beacons/[beaconId]/rsvp:", insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    const { data: profile } = await admin
      .from("users")
      .select("id, name, image, first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();

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
