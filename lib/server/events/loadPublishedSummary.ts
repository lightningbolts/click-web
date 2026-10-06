import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  eventEndAtFromMetadata,
  eventStartAtFromMetadata,
  eventTimezoneFromMetadata,
  eventTitleFromMetadata,
  isRecord,
} from "@/lib/events/eventMetadata";
import { loadRecapSummary, type RecapSummary } from "@/lib/events/eventRecap";

export type PublishedSummary = RecapSummary & {
  title: string | null;
  event_start_at: string | null;
  event_end_at: string | null;
  timezone: string | null;
};

/**
 * The aggregate-only event summary behind a published token (spec §7.6.5), or null when the event
 * doesn't exist, isn't published, or the token doesn't match. Never carries identities.
 */
export async function loadPublishedSummary(
  admin: SupabaseClient,
  beaconId: string,
  token: string,
): Promise<PublishedSummary | null> {
  if (!token) return null;
  const { data, error } = await admin
    .from("map_beacons")
    .select("id, beacon_type, metadata, event_timezone")
    .eq("id", beaconId)
    .maybeSingle();
  if (error || !isRecord(data) || data.beacon_type !== "event") return null;
  const meta = isRecord(data.metadata) ? data.metadata : {};
  if (meta.summary_published !== true || meta.summary_token !== token) return null;

  const summary = await loadRecapSummary(admin, beaconId);
  return {
    ...summary,
    title: eventTitleFromMetadata(meta),
    event_start_at: eventStartAtFromMetadata(meta),
    event_end_at: eventEndAtFromMetadata(meta),
    timezone:
      (typeof data.event_timezone === "string" && data.event_timezone.trim()) || eventTimezoneFromMetadata(meta),
  };
}
