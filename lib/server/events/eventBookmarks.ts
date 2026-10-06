import type { SupabaseClient } from "@supabase/supabase-js";
import { loadUserDisplayNames, parseLatLngFromLocationField } from "@/lib/map/mapBeaconApiShared";
import { parseEventCategoryTags } from "@/lib/events/connectionEventRecommendation";

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

/** The user's saved events, denormalized for Home (`GET /api/me/event-bookmarks`). */
export async function loadEventBookmarks(
  admin: SupabaseClient,
  userId: string,
  { limit, cursor }: { limit: number; cursor?: string | null },
) {
  let query = admin
    .from("event_bookmarks")
    .select("beacon_id, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor && Number.isFinite(Date.parse(cursor))) {
    query = query.lt("created_at", cursor);
  }

  const { data: bookmarks, error } = await query;
  if (error) throw new Error(`event bookmarks: ${error.message}`);

  const rows = Array.isArray(bookmarks) ? bookmarks : [];
  const beaconIds = rows
    .map((r) => (isRecord(r) && typeof r.beacon_id === "string" ? r.beacon_id : null))
    .filter((id): id is string => id != null);

  const beaconById = new Map<string, Record<string, unknown>>();
  if (beaconIds.length > 0) {
    const { data: beacons, error: beaconErr } = await admin
      .from("map_beacons")
      .select(
        "id, creator_id, created_at, show_creator_name, metadata, expires_at, location, beacon_type",
      )
      .in("id", beaconIds);
    if (beaconErr) {
      console.error("GET /api/me/event-bookmarks beacons:", beaconErr.message);
    } else if (Array.isArray(beacons)) {
      for (const b of beacons) {
        if (isRecord(b) && typeof b.id === "string") beaconById.set(b.id, b);
      }
    }
  }

  const creatorIds = [...beaconById.values()]
    .map((b) => (typeof b.creator_id === "string" ? b.creator_id : null))
    .filter((id): id is string => id != null);
  const nameById = await loadUserDisplayNames(admin, creatorIds);

  const items = rows
    .map((row) => {
      if (!isRecord(row) || typeof row.beacon_id !== "string") return null;
      const beacon = beaconById.get(row.beacon_id);
      const meta = beacon != null && isRecord(beacon.metadata) ? beacon.metadata : {};
      const coords =
        beacon != null
          ? parseLatLngFromLocationField(beacon.location, Number.NaN, Number.NaN)
          : { lat: Number.NaN, lng: Number.NaN };
      const creatorId =
        beacon != null && typeof beacon.creator_id === "string" ? beacon.creator_id : null;
      return {
        beacon_id: row.beacon_id,
        bookmarked_at: typeof row.created_at === "string" ? row.created_at : null,
        title:
          metaStr(meta, "title", "label", "name") ??
          (beacon == null ? "Unavailable event" : null),
        event_start_at: metaStr(meta, "event_start_at", "eventStartAt"),
        event_end_at: metaStr(meta, "event_end_at", "eventEndAt"),
        location_name: metaStr(meta, "location_name", "place_name", "venue_name"),
        formatted_address: metaStr(
          meta,
          "formatted_address",
          "address",
          "display_address",
        ),
        event_categories: parseEventCategoryTags(meta),
        latitude: Number.isFinite(coords.lat) ? coords.lat : null,
        longitude: Number.isFinite(coords.lng) ? coords.lng : null,
        expires_at:
          beacon != null && typeof beacon.expires_at === "string" ? beacon.expires_at : null,
        creator_id: creatorId,
        creator_name: creatorId != null ? (nameById.get(creatorId) ?? null) : null,
        created_at:
          beacon != null && typeof beacon.created_at === "string" ? beacon.created_at : null,
        show_creator_name: beacon != null && beacon.show_creator_name === true,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  const nextCursor =
    rows.length === limit && isRecord(rows[rows.length - 1])
      ? (rows[rows.length - 1] as { created_at?: unknown }).created_at
      : null;

  return {
    bookmarks: items,
    next_cursor: typeof nextCursor === "string" ? nextCursor : null,
  };
}

export type EventBookmark = Awaited<ReturnType<typeof loadEventBookmarks>>["bookmarks"][number];
