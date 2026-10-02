import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseEventScheduleFromMetadata } from '@/lib/map/eventSchedule';
import { eventDisplayTitle, eventTitleFromMetadata } from '@/lib/events/eventMetadata';
import type { EventRelation, HistoryEvent } from '@/lib/events/eventHistory';

/**
 * Past-event participation from the live write paths (beacon_attendees, event_check_ins,
 * event_bookmarks, map_beacons.creator_id). `event_participation` is not dual-written yet.
 */

export type HistoryEventRow = HistoryEvent & {
  title: string;
  locationName: string | null;
  imageUrl: string | null;
};

const MAX_EVENTS = 1000;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function metaString(meta: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = meta[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

async function userBeaconIds(admin: SupabaseClient, table: string, userId: string): Promise<Set<string>> {
  const { data, error } = await admin.from(table).select('beacon_id').eq('user_id', userId).limit(MAX_EVENTS);
  if (error) throw new Error(`event history ${table}: ${error.message}`);
  return new Set(((data ?? []) as Array<{ beacon_id: string }>).map((r) => r.beacon_id));
}

export async function loadUserEvents(admin: SupabaseClient, userId: string): Promise<HistoryEventRow[]> {
  const [went, rsvpd, saved, hostedRes] = await Promise.all([
    userBeaconIds(admin, 'event_check_ins', userId),
    userBeaconIds(admin, 'beacon_attendees', userId),
    userBeaconIds(admin, 'event_bookmarks', userId),
    admin.from('map_beacons').select('id').eq('creator_id', userId).eq('beacon_type', 'event').limit(MAX_EVENTS),
  ]);
  if (hostedRes.error) throw new Error(`event history hosted: ${hostedRes.error.message}`);
  const hosted = new Set(((hostedRes.data ?? []) as Array<{ id: string }>).map((r) => r.id));
  const ids = [...new Set([...went, ...rsvpd, ...saved, ...hosted])].slice(0, MAX_EVENTS);
  return loadEventRows(admin, ids, (id) => ({
    went: went.has(id),
    rsvpd: rsvpd.has(id),
    saved: saved.has(id),
    hosted: hosted.has(id),
  }));
}

async function loadEventRows(
  admin: SupabaseClient,
  ids: string[],
  relationFor: (id: string) => EventRelation,
): Promise<HistoryEventRow[]> {
  const out: HistoryEventRow[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin
      .from('map_beacons')
      .select('id, beacon_type, metadata, starts_at, ends_at')
      .in('id', ids.slice(i, i + 200))
      .eq('beacon_type', 'event');
    if (error) throw new Error(`event history beacons: ${error.message}`);
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const meta = isRecord(row.metadata) ? row.metadata : {};
      const fromMeta = parseEventScheduleFromMetadata(meta);
      const startMs = typeof row.starts_at === 'string' ? Date.parse(row.starts_at) : fromMeta?.startEpochMs ?? NaN;
      const endMs = typeof row.ends_at === 'string' ? Date.parse(row.ends_at) : fromMeta?.endEpochMs ?? NaN;
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
      const id = String(row.id);
      out.push({
        beaconId: id,
        startMs,
        endMs,
        relation: relationFor(id),
        title: eventDisplayTitle(eventTitleFromMetadata(meta), metaString(meta, 'location_name', 'locationName')),
        locationName: metaString(meta, 'location_name', 'locationName'),
        imageUrl: metaString(meta, 'image_url', 'imageUrl', 'album_art_url'),
      });
    }
  }
  return out;
}

/** Past events both users checked in to — the only attendance anyone else can see. */
export async function loadEventsTogether(
  admin: SupabaseClient,
  viewerId: string,
  otherId: string,
): Promise<HistoryEventRow[]> {
  const [mine, theirs] = await Promise.all([
    userBeaconIds(admin, 'event_check_ins', viewerId),
    userBeaconIds(admin, 'event_check_ins', otherId),
  ]);
  const shared = [...mine].filter((id) => theirs.has(id));
  return loadEventRows(admin, shared, () => ({ went: true, rsvpd: false, saved: false, hosted: false }));
}

/** Event ids (of those given) that have a drop recap: revealed or still developing. */
export async function loadRecapStates(
  admin: SupabaseClient,
  beaconIds: string[],
): Promise<Map<string, { revealAt: string }>> {
  const out = new Map<string, { revealAt: string }>();
  if (beaconIds.length === 0) return out;
  const [{ data: recaps, error }, { data: live, error: liveError }] = await Promise.all([
    admin.from('event_drop_recaps').select('beacon_id, reveal_at').in('beacon_id', beaconIds),
    admin.from('event_drops').select('beacon_id').in('beacon_id', beaconIds).is('deleted_at', null),
  ]);
  if (error || liveError) throw new Error(`event history recaps: ${error?.message ?? liveError?.message}`);
  const withDrops = new Set(((live ?? []) as Array<{ beacon_id: string }>).map((r) => r.beacon_id));
  for (const r of (recaps ?? []) as Array<{ beacon_id: string; reveal_at: string }>) {
    if (withDrops.has(r.beacon_id)) out.set(r.beacon_id, { revealAt: r.reveal_at });
  }
  return out;
}

export function serializeHistoryEvent(
  e: HistoryEventRow,
  recap: { revealAt: string } | undefined,
  nowMs: number,
  includeRelation = true,
) {
  return {
    beacon_id: e.beaconId,
    title: e.title,
    starts_at: new Date(e.startMs).toISOString(),
    ends_at: new Date(e.endMs).toISOString(),
    location_name: e.locationName,
    image_url: e.imageUrl,
    ...(includeRelation ? { relation: e.relation } : {}),
    recap: recap
      ? { state: Date.parse(recap.revealAt) <= nowMs ? 'ready' : 'developing', reveal_at: recap.revealAt }
      : null,
  };
}
