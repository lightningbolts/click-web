import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  eventDescriptionFromMetadata,
  eventDisplayTitle,
  eventEndAtFromMetadata,
  eventStartAtFromMetadata,
  eventImageFromMetadata,
  eventInstantFromRowOrMeta,
  eventLocationNameFromMetadata,
  eventTitleFromMetadata,
  isRecord,
} from '@/lib/events/eventMetadata';

export type PlaceEventItem = {
  id: string;
  title: string;
  startAt: string | null;
  endAt: string | null;
  locationName: string | null;
  imageUrl: string | null;
  rsvpCount: number;
};

const THREE_HOURS = 3 * 3_600_000;
const MAX_EVENTS = 200;

/** Upcoming (soonest first, live included) or past (latest first) events hosted as this Place. */
export async function loadPlaceEvents(
  admin: SupabaseClient,
  placeId: string,
  { when, nowMs, limit = MAX_EVENTS }: { when: 'upcoming' | 'past'; nowMs: number; limit?: number },
): Promise<PlaceEventItem[]> {
  const { data, error } = await admin
    .from('map_beacons')
    .select('id, metadata, starts_at, ends_at')
    .eq('venue_id', placeId)
    .eq('beacon_type', 'event')
    .order('created_at', { ascending: false })
    .limit(MAX_EVENTS);
  if (error) throw new Error(`place events: ${error.message}`);

  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const meta = isRecord(row.metadata) ? row.metadata : {};
    const startAt = eventInstantFromRowOrMeta(row.starts_at, eventStartAtFromMetadata(meta));
    const endAt = eventInstantFromRowOrMeta(row.ends_at, eventEndAtFromMetadata(meta));
    const startMs = startAt ? Date.parse(startAt) : NaN;
    const endMs = endAt ? Date.parse(endAt) : Number.isFinite(startMs) ? startMs + THREE_HOURS : NaN;
    return {
      id: String(row.id),
      title: eventDisplayTitle(eventTitleFromMetadata(meta), eventLocationNameFromMetadata(meta), eventDescriptionFromMetadata(meta)),
      startAt,
      endAt,
      locationName: eventLocationNameFromMetadata(meta),
      imageUrl: eventImageFromMetadata(meta),
      startMs,
      ended: Number.isFinite(endMs) && endMs <= nowMs,
    };
  });

  const picked = rows
    .filter((r) => (when === 'past' ? r.ended : !r.ended))
    .sort((a, b) => {
      const as = Number.isFinite(a.startMs) ? a.startMs : Infinity;
      const bs = Number.isFinite(b.startMs) ? b.startMs : Infinity;
      return when === 'past' ? bs - as : as - bs;
    })
    .slice(0, limit);
  if (picked.length === 0) return [];

  const { data: attendees } = await admin.from('beacon_attendees').select('beacon_id').in('beacon_id', picked.map((r) => r.id));
  const counts = new Map<string, number>();
  for (const a of (attendees ?? []) as Array<{ beacon_id: string }>) counts.set(a.beacon_id, (counts.get(a.beacon_id) ?? 0) + 1);

  return picked.map(({ startMs: _s, ended: _e, ...r }) => {
    void _s;
    void _e;
    return { ...r, rsvpCount: counts.get(r.id) ?? 0 };
  });
}

/** RSVPs to this Place's events that started in the last `days` (Overview "Event RSVPs"). */
export async function countRecentPlaceEventRsvps(admin: SupabaseClient, placeId: string, nowMs: number, days = 30): Promise<number> {
  const since = new Date(nowMs - days * 86_400_000).toISOString();
  const { data, error } = await admin
    .from('map_beacons')
    .select('id')
    .eq('venue_id', placeId)
    .eq('beacon_type', 'event')
    .gte('starts_at', since)
    .lte('starts_at', new Date(nowMs).toISOString());
  if (error) throw new Error(`place rsvps: ${error.message}`);
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length === 0) return 0;
  const { count, error: countError } = await admin.from('beacon_attendees').select('beacon_id', { count: 'exact', head: true }).in('beacon_id', ids);
  if (countError) throw new Error(`place rsvps count: ${countError.message}`);
  return count ?? 0;
}
