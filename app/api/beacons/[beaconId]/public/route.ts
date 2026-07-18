import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import { parseLatLngFromLocationField } from "@/lib/map/mapBeaconApiShared";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function metaStr(meta: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * GET /api/beacons/{id}/public — unauthenticated share-landing subset (no attendees / private fields).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ beaconId: string }> },
) {
  try {
    const { beaconId } = await params;
    const id = beaconId?.trim();
    if (!id) {
      return NextResponse.json({ error: "beaconId required" }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("map_beacons")
      .select("id, beacon_type, metadata, location, show_creator_name, created_by, expires_at")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("GET /api/beacons/[beaconId]/public:", error.message);
      return NextResponse.json({ error: "Failed to load event" }, { status: 500 });
    }
    if (!isRecord(data) || data.beacon_type !== "event") {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const meta = isRecord(data.metadata) ? data.metadata : {};
    const coords = parseLatLngFromLocationField(data.location, Number.NaN, Number.NaN);

    let hostName: string | null = null;
    if (data.show_creator_name === true && typeof data.created_by === "string") {
      const { data: profile } = await admin
        .from("users")
        .select("name, full_name")
        .eq("id", data.created_by)
        .maybeSingle();
      if (isRecord(profile)) {
        hostName = metaStr(profile, "name", "full_name");
      }
    }

    return NextResponse.json({
      beacon_id: data.id,
      title: metaStr(meta, "title", "label", "name"),
      description: metaStr(meta, "description"),
      event_start_at: metaStr(meta, "event_start_at", "eventStartAt"),
      event_end_at: metaStr(meta, "event_end_at", "eventEndAt"),
      latitude: Number.isFinite(coords.lat) ? coords.lat : null,
      longitude: Number.isFinite(coords.lng) ? coords.lng : null,
      host_name: hostName,
      expires_at: typeof data.expires_at === "string" ? data.expires_at : null,
    });
  } catch (e) {
    console.error("GET /api/beacons/[beaconId]/public:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
