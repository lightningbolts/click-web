import "server-only";

import { loadAttendeeRecap, type RecapPerson } from "@/lib/events/eventRecap";
import { createAdminSupabaseClient } from "@/lib/server/admin/supabaseAdmin";
import {
  eventDropAccess,
  eventDropsConfigFrom,
  loadDropEvent,
  loadEventRole,
  serializeEventDrops,
  visibleEventDrops,
  type SerializedEventDrop,
} from "@/lib/server/eventDrops";
import { resolveFeature } from "@/lib/server/featureFlags";

export type EventRecapView =
  | { kind: "missing" }
  /** Drops are off for this account, or the viewer wasn't there and didn't RSVP. */
  | { kind: "unavailable"; title: string; people: RecapPerson[] }
  | { kind: "developing"; title: string; revealAtMs: number; mine: number; people: RecapPerson[] }
  | { kind: "ready"; title: string; drops: SerializedEventDrop[]; people: RecapPerson[] };

/**
 * The recap viewer's data (spec §7.6.5): the same visibility rules as GET /api/beacons/{id}/drops,
 * read once on the server, plus the people the viewer Clicked with at the event.
 */
export async function loadEventRecap(beaconId: string, userId: string, nowMs: number): Promise<EventRecapView> {
  const admin = createAdminSupabaseClient();
  const feature = await resolveFeature(admin, "event_drops", userId);
  const config = eventDropsConfigFrom(feature.config);
  const [event, people] = await Promise.all([
    loadDropEvent(admin, beaconId, config),
    loadAttendeeRecap(admin, beaconId, userId),
  ]);
  if (event == null) return { kind: "missing" };
  if (!feature.enabled) return { kind: "unavailable", title: event.title, people };

  const role = await loadEventRole(admin, event, userId);
  if (eventDropAccess(role) === "none") return { kind: "unavailable", title: event.title, people };

  const rows = await visibleEventDrops(admin, event, userId, role, config, nowMs);
  if (nowMs < event.schedule.revealAtMs) {
    return {
      kind: "developing",
      title: event.title,
      revealAtMs: event.schedule.revealAtMs,
      mine: rows.filter((r) => r.user_id === userId).length,
      people,
    };
  }
  const drops = await serializeEventDrops(admin, rows, userId, nowMs);
  return { kind: "ready", title: event.title, drops, people };
}
