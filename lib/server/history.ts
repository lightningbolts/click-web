import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadUserEvents, loadRecapStates, serializeHistoryEvent } from '@/lib/server/eventHistory';
import { displayNameFromUser, type UserProfileRow } from '@/lib/events/attendeeDirectory';
import { humanizeBeaconType, type MapBeaconType } from '@/lib/map/mapBeacons';

/**
 * Your history across Click (private to you): events you were part of, beacons you dropped or
 * reacted to or confirmed, and hangouts you logged. One shape, newest first, bounded pages.
 */
export const HISTORY_KINDS = ['all', 'events', 'beacons', 'hangouts'] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

export type HistoryItem = {
  kind: 'event' | 'beacon' | 'hangout';
  id: string;
  title: string;
  /** "Went", "Dropped", "Reacted 🔥", "With Maya"… */
  detail: string;
  at: string;
  place: string | null;
  image_url: string | null;
  beacon_id: string | null;
  beacon_type: string | null;
  connection_id: string | null;
  peer: { id: string; name: string; avatar_url: string | null } | null;
  recap: { state: 'ready' | 'developing'; reveal_at: string } | null;
};

const LIMIT = 500;

function metaString(meta: unknown, key: string): string | null {
  const v = meta && typeof meta === 'object' ? (meta as Record<string, unknown>)[key] : null;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

async function eventItems(admin: SupabaseClient, userId: string, nowMs: number): Promise<HistoryItem[]> {
  const past = (await loadUserEvents(admin, userId)).filter((e) => e.endMs <= nowMs);
  const recaps = await loadRecapStates(admin, past.map((e) => e.beaconId));
  return past.map((e) => {
    const s = serializeHistoryEvent(e, recaps.get(e.beaconId), nowMs, false);
    const r = e.relation;
    return {
      kind: 'event',
      id: e.beaconId,
      title: s.title,
      detail: r.hosted ? 'Hosted' : r.went ? 'Went' : r.rsvpd ? "RSVP'd" : 'Saved',
      at: s.ends_at,
      place: s.location_name,
      image_url: s.image_url,
      beacon_id: e.beaconId,
      beacon_type: 'event',
      connection_id: null,
      peer: null,
      recap: s.recap as HistoryItem['recap'],
    };
  });
}

async function beaconItems(admin: SupabaseClient, userId: string): Promise<HistoryItem[]> {
  const [created, reacted, confirmed] = await Promise.all([
    admin.from('map_beacons').select('id, beacon_type, metadata, created_at').eq('creator_id', userId).neq('beacon_type', 'event').order('created_at', { ascending: false }).limit(LIMIT),
    admin.from('reactions').select('target_id, emoji, created_at').eq('user_id', userId).eq('target_kind', 'soundtrack').limit(LIMIT),
    admin.from('beacon_confirmations').select('beacon_id, status, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(LIMIT),
  ]);
  const detailById = new Map<string, { detail: string; at: string }>();
  for (const r of (created.data ?? []) as Array<{ id: string; created_at: string }>) detailById.set(r.id, { detail: 'Dropped', at: r.created_at });
  for (const r of (reacted.data ?? []) as Array<{ target_id: string; emoji: string; created_at: string }>) {
    if (!detailById.has(r.target_id)) detailById.set(r.target_id, { detail: `Reacted ${r.emoji}`, at: r.created_at });
  }
  for (const r of (confirmed.data ?? []) as Array<{ beacon_id: string; status: string; created_at: string }>) {
    if (!detailById.has(r.beacon_id)) {
      detailById.set(r.beacon_id, { detail: r.status === 'cleared' ? 'Marked cleared' : 'Confirmed still there', at: r.created_at });
    }
  }
  const createdRows = new Map(((created.data ?? []) as Array<Record<string, unknown>>).map((r) => [String(r.id), r]));
  const missing = [...detailById.keys()].filter((id) => !createdRows.has(id));
  if (missing.length) {
    const { data } = await admin.from('map_beacons').select('id, beacon_type, metadata, created_at').in('id', missing);
    for (const r of (data ?? []) as Array<Record<string, unknown>>) createdRows.set(String(r.id), r);
  }
  return [...detailById].flatMap(([id, d]) => {
    const row = createdRows.get(id);
    if (!row) return [];
    const type = String(row.beacon_type) as MapBeaconType;
    const meta = row.metadata;
    return [{
      kind: 'beacon' as const,
      id,
      title: metaString(meta, 'track_name') ?? metaString(meta, 'title') ?? humanizeBeaconType(type),
      detail: d.detail,
      at: d.at,
      place: metaString(meta, 'location_name'),
      image_url: metaString(meta, 'album_art_url') ?? metaString(meta, 'image_url'),
      beacon_id: id,
      beacon_type: type,
      connection_id: null,
      peer: null,
      recap: null,
    }];
  });
}

async function hangoutItems(admin: SupabaseClient, userId: string): Promise<HistoryItem[]> {
  const { data, error } = await admin
    .from('hangout_confirmations')
    .select('id, connection_id, user_ids, occurred_at, location_name')
    .contains('user_ids', [userId])
    .eq('status', 'confirmed')
    .order('occurred_at', { ascending: false })
    .limit(LIMIT);
  if (error) throw new Error(`history hangouts: ${error.message}`);
  const rows = (data ?? []) as Array<{ id: string; connection_id: string; user_ids: string[]; occurred_at: string; location_name: string | null }>;
  const peerIds = [...new Set(rows.map((r) => r.user_ids.find((u) => u !== userId)).filter((u): u is string => !!u))];
  const { data: users } = peerIds.length
    ? await admin.from('users').select('id, name, image, first_name, last_name').in('id', peerIds)
    : { data: [] };
  const byId = new Map(((users ?? []) as UserProfileRow[]).map((u) => [u.id, u]));
  return rows.map((r) => {
    const peerId = r.user_ids.find((u) => u !== userId) ?? '';
    const name = displayNameFromUser(byId.get(peerId) ?? null, 'Someone');
    return {
      kind: 'hangout' as const,
      id: r.id,
      title: `Hangout with ${name}`,
      detail: 'Hangout',
      at: r.occurred_at,
      place: r.location_name,
      image_url: null,
      beacon_id: null,
      beacon_type: null,
      connection_id: r.connection_id,
      peer: { id: peerId, name, avatar_url: byId.get(peerId)?.image ?? null },
      recap: null,
    };
  });
}

export async function loadHistoryPage(
  admin: SupabaseClient,
  userId: string,
  kind: HistoryKind,
  cursorMs: number | null,
  limit: number,
  nowMs: number = Date.now(),
): Promise<{ items: HistoryItem[]; nextCursor: string | null }> {
  const [events, beacons, hangouts] = await Promise.all([
    kind === 'all' || kind === 'events' ? eventItems(admin, userId, nowMs) : [],
    kind === 'all' || kind === 'beacons' ? beaconItems(admin, userId) : [],
    kind === 'all' || kind === 'hangouts' ? hangoutItems(admin, userId) : [],
  ]);
  const sorted = [...events, ...beacons, ...hangouts]
    .filter((i) => cursorMs == null || Date.parse(i.at) < cursorMs)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || a.id.localeCompare(b.id));
  const items = sorted.slice(0, limit);
  return { items, nextCursor: sorted.length > limit ? items[items.length - 1].at : null };
}
