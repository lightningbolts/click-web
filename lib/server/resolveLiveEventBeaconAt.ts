import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeBeaconRpcRows } from "@/lib/map/mapBeaconApiShared";
import { parseMapBeacon } from "@/lib/map/mapBeacons";
import {
  eventScheduleBounds,
  haversineMeters,
  isEventLiveForCheckIn,
  isValidCheckInCoordinate,
  resolveCheckInRadiusMeters,
} from "@/lib/server/eventEngagement";

/** System context tag when both parties RSVPed at a live map event. */
export const AT_EVENT_CONTEXT_TAG = "at_event";

/** Search radius upper bound (campus scale). */
const LIVE_EVENT_SEARCH_RADIUS_M = 3000;

export type LiveEventBeaconAttachment = {
  event_beacon_id: string;
  event_beacon_title: string | null;
  event_beacon_start_at: string | null;
  event_beacon_end_at: string | null;
};

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
 * Find the nearest live map event where GPS is inside the check-in fence
 * and every user in [userIds] has an RSVP (`beacon_attendees`) row.
 */
export async function resolveLiveEventBeaconAt(
  admin: SupabaseClient,
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  userIds: string[],
  nowMs: number = Date.now(),
): Promise<LiveEventBeaconAttachment | null> {
  if (
    latitude == null ||
    longitude == null ||
    !isValidCheckInCoordinate(latitude, longitude)
  ) {
    return null;
  }
  const ids = [
    ...new Set(
      userIds.map((id) => id.trim()).filter((id) => id.length > 0),
    ),
  ];
  if (ids.length < 2) return null;

  const { data: rpcData, error: rpcErr } = await admin.rpc("fetch_map_beacons_within", {
    lat: latitude,
    lng: longitude,
    radius_meters: LIVE_EVENT_SEARCH_RADIUS_M,
    p_limit: 200,
  });
  if (rpcErr) {
    console.warn("[resolveLiveEventBeaconAt] rpc:", rpcErr.message);
    return null;
  }

  const beacons = normalizeBeaconRpcRows(rpcData)
    .map(parseMapBeacon)
    .filter((b): b is NonNullable<typeof b> => b != null && b.beacon_type === "event");
  if (beacons.length === 0) return null;

  type Candidate = LiveEventBeaconAttachment & { distanceMeters: number };
  const candidates: Candidate[] = [];

  for (const beacon of beacons) {
    const meta = isRecord(beacon.metadata) ? beacon.metadata : {};
    if (!isEventLiveForCheckIn(meta, nowMs)) continue;

    const { radiusMeters } = resolveCheckInRadiusMeters(meta);
    const distanceMeters = haversineMeters(
      latitude,
      longitude,
      beacon.lat,
      beacon.lng,
    );
    if (distanceMeters > radiusMeters) continue;

    const { data: attendees, error: attErr } = await admin
      .from("beacon_attendees")
      .select("user_id")
      .eq("beacon_id", beacon.id)
      .in("user_id", ids);
    if (attErr) {
      console.warn("[resolveLiveEventBeaconAt] attendees:", attErr.message);
      continue;
    }
    const present = new Set(
      (Array.isArray(attendees) ? attendees : [])
        .map((a) => (isRecord(a) && typeof a.user_id === "string" ? a.user_id : null))
        .filter((id): id is string => id != null),
    );
    if (!ids.every((id) => present.has(id))) continue;

    let startAt = metaStr(meta, "event_start_at", "eventStartAt");
    let endAt = metaStr(meta, "event_end_at", "eventEndAt");
    if (!startAt || !endAt) {
      const bounds = eventScheduleBounds(meta);
      if (!startAt && bounds.startMs != null) {
        startAt = new Date(bounds.startMs).toISOString();
      }
      if (!endAt && bounds.endMs != null) {
        endAt = new Date(bounds.endMs).toISOString();
      }
    }

    candidates.push({
      event_beacon_id: beacon.id,
      event_beacon_title: metaStr(meta, "title", "label", "name"),
      event_beacon_start_at: startAt,
      event_beacon_end_at: endAt,
      distanceMeters,
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);
  const best = candidates[0];
  return {
    event_beacon_id: best.event_beacon_id,
    event_beacon_title: best.event_beacon_title,
    event_beacon_start_at: best.event_beacon_start_at,
    event_beacon_end_at: best.event_beacon_end_at,
  };
}

/** Merge `at_event` into context_tags and set event_beacon_* columns on an insert row. */
export function applyLiveEventBeaconToEncounterRow(
  row: Record<string, unknown>,
  attachment: LiveEventBeaconAttachment | null,
): Record<string, unknown> {
  if (!attachment) return row;
  const prev = Array.isArray(row.context_tags)
    ? row.context_tags.filter((t): t is string => typeof t === "string")
    : [];
  const tags = [...new Set([...prev, AT_EVENT_CONTEXT_TAG])];
  return {
    ...row,
    context_tags: tags,
    event_beacon_id: attachment.event_beacon_id,
    event_beacon_title: attachment.event_beacon_title,
    event_beacon_start_at: attachment.event_beacon_start_at,
    event_beacon_end_at: attachment.event_beacon_end_at,
  };
}
