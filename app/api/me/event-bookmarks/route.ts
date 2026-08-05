import { NextRequest, NextResponse } from "next/server";
import { getSupabaseFromRouteRequest } from "@/lib/server/supabaseRouteAuth";
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
 * GET /api/me/event-bookmarks — caller's saved events (denormalized for Home).
 * Query: limit (default 50, max 100), cursor (ISO created_at).
 */
export async function GET(request: NextRequest) {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limitRaw = Number(searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(100, Math.max(1, Math.floor(limitRaw)))
      : 50;
    const cursor = searchParams.get("cursor");

    const admin = createAdminSupabaseClient();
    let query = admin
      .from("event_bookmarks")
      .select("beacon_id, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (cursor && Number.isFinite(Date.parse(cursor))) {
      query = query.lt("created_at", cursor);
    }

    const { data: bookmarks, error } = await query;
    if (error) {
      console.error("GET /api/me/event-bookmarks:", error.message);
      return NextResponse.json({ error: "Failed to load bookmarks" }, { status: 500 });
    }

    const rows = Array.isArray(bookmarks) ? bookmarks : [];
    const beaconIds = rows
      .map((r) => (isRecord(r) && typeof r.beacon_id === "string" ? r.beacon_id : null))
      .filter((id): id is string => id != null);

    const beaconById = new Map<string, Record<string, unknown>>();
    if (beaconIds.length > 0) {
      const { data: beacons, error: beaconErr } = await admin
        .from("map_beacons")
        .select("id, metadata, expires_at, location, beacon_type")
        .in("id", beaconIds);
      if (beaconErr) {
        console.error("GET /api/me/event-bookmarks beacons:", beaconErr.message);
      } else if (Array.isArray(beacons)) {
        for (const b of beacons) {
          if (isRecord(b) && typeof b.id === "string") beaconById.set(b.id, b);
        }
      }
    }

    const items = rows
      .map((row) => {
        if (!isRecord(row) || typeof row.beacon_id !== "string") return null;
        const beacon = beaconById.get(row.beacon_id);
        const meta = beacon != null && isRecord(beacon.metadata) ? beacon.metadata : {};
        const coords =
          beacon != null
            ? parseLatLngFromLocationField(beacon.location, Number.NaN, Number.NaN)
            : { lat: Number.NaN, lng: Number.NaN };
        return {
          beacon_id: row.beacon_id,
          bookmarked_at: typeof row.created_at === "string" ? row.created_at : null,
          title:
            metaStr(meta, "title", "label", "name") ??
            (beacon == null ? "Unavailable event" : null),
          event_start_at: metaStr(meta, "event_start_at", "eventStartAt"),
          event_end_at: metaStr(meta, "event_end_at", "eventEndAt"),
          latitude: Number.isFinite(coords.lat) ? coords.lat : null,
          longitude: Number.isFinite(coords.lng) ? coords.lng : null,
          expires_at:
            beacon != null && typeof beacon.expires_at === "string" ? beacon.expires_at : null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    const nextCursor =
      rows.length === limit && isRecord(rows[rows.length - 1])
        ? (rows[rows.length - 1] as { created_at?: unknown }).created_at
        : null;

    return NextResponse.json({
      bookmarks: items,
      next_cursor: typeof nextCursor === "string" ? nextCursor : null,
    });
  } catch (e) {
    console.error("GET /api/me/event-bookmarks:", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
