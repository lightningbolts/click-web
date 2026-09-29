import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { configNumber, requireFeature } from '@/lib/server/featureFlags';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { loadBlockedUserIds } from '@/lib/server/connections/viewerPeers';
import { dropObjectPrefix, removeDropObjects, signDropObjects, uploadDropRenditions } from '@/lib/server/drops/storage';
import type { ResolvedDrop } from '@/lib/server/drops/develop';
import { eventDropSchedule, orderRecap, selectAbsenteeDrops, type EventDropSchedule } from '@/lib/events/eventDropSchedule';
import { eventDisplayTitle, eventTitleFromMetadata } from '@/lib/events/eventMetadata';
import { parseEventScheduleFromMetadata } from '@/lib/map/eventSchedule';
import { displayNameFromUser, type UserProfileRow } from '@/lib/events/attendeeDirectory';

/** F1 — event Click Drops. Every visibility rule lives here; clients render what they're given. */

export type EventDropsConfig = { perUserCap: number; revealHourLocal: number; absenteeLimit: number };

export function eventDropsConfigFrom(config: Record<string, unknown>): EventDropsConfig {
  return {
    perUserCap: configNumber(config, 'per_user_cap', 10, { min: 1, max: 50 }),
    revealHourLocal: configNumber(config, 'reveal_hour_local', 10, { min: 0, max: 23 }),
    absenteeLimit: configNumber(config, 'absentee_limit', 6, { min: 0, max: 50 }),
  };
}

export type DropEvent = {
  id: string;
  title: string;
  creatorId: string;
  schedule: EventDropSchedule;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** The event (any age) with its drop window and reveal time; null for non-events or no schedule. */
export async function loadDropEvent(
  admin: SupabaseClient,
  beaconId: string,
  config: EventDropsConfig,
): Promise<DropEvent | null> {
  const { data, error } = await admin
    .from('map_beacons')
    .select('id, beacon_type, creator_id, metadata, starts_at, ends_at, event_timezone')
    .eq('id', beaconId)
    .maybeSingle();
  if (error) throw new Error(`event drops event: ${error.message}`);
  const row = data as Record<string, unknown> | null;
  if (!row || row.beacon_type !== 'event') return null;
  const meta = isRecord(row.metadata) ? row.metadata : {};
  const fromMeta = parseEventScheduleFromMetadata(meta);
  const startMs = typeof row.starts_at === 'string' ? Date.parse(row.starts_at) : fromMeta?.startEpochMs ?? NaN;
  const endMs = typeof row.ends_at === 'string' ? Date.parse(row.ends_at) : fromMeta?.endEpochMs ?? NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  const timeZone =
    (typeof row.event_timezone === 'string' && row.event_timezone.trim()) ||
    (typeof meta.event_timezone === 'string' && meta.event_timezone.trim()) ||
    null;
  return {
    id: String(row.id),
    title: eventDisplayTitle(eventTitleFromMetadata(meta)),
    creatorId: String(row.creator_id ?? ''),
    schedule: eventDropSchedule({ startMs, endMs, timeZone, revealHourLocal: config.revealHourLocal }),
  };
}

export type EventRole = { checkedIn: boolean; rsvpd: boolean; hosted: boolean };

/** Eligibility keys off having been there (checked in), never off how someone RSVP'd or paid. */
export async function loadEventRole(admin: SupabaseClient, event: DropEvent, userId: string): Promise<EventRole> {
  const [checkIn, rsvp] = await Promise.all([
    admin.from('event_check_ins').select('user_id').eq('beacon_id', event.id).eq('user_id', userId).maybeSingle(),
    admin.from('beacon_attendees').select('user_id').eq('beacon_id', event.id).eq('user_id', userId).maybeSingle(),
  ]);
  if (checkIn.error || rsvp.error) throw new Error(`event role: ${checkIn.error?.message ?? rsvp.error?.message}`);
  return { checkedIn: checkIn.data != null, rsvpd: rsvp.data != null, hosted: event.creatorId === userId };
}

export type EventDropRow = {
  id: string;
  beacon_id: string;
  user_id: string;
  client_drop_id: string;
  original_path: string;
  preview_path: string;
  width: number | null;
  height: number | null;
  filter_seed: number;
  show_to_absentees: boolean;
  created_at: string;
  reveal_at: string;
};

const DROP_COLUMNS =
  'id, beacon_id, user_id, client_drop_id, original_path, preview_path, width, height, filter_seed, show_to_absentees, created_at, reveal_at';

export type EventDropAccess = 'participant' | 'absentee' | 'none';

/** Who sees what: participants (checked in, or the host) everything; RSVP'd absentees a small set. */
export function eventDropAccess(role: EventRole): EventDropAccess {
  if (role.checkedIn || role.hosted) return 'participant';
  return role.rsvpd ? 'absentee' : 'none';
}

/**
 * The drops this viewer may see right now. Before reveal: only their own (pixelated). After:
 * everything for participants, "what you missed" for absentees. Blocked people never appear.
 */
export async function visibleEventDrops(
  admin: SupabaseClient,
  event: DropEvent,
  viewerId: string,
  role: EventRole,
  config: EventDropsConfig,
  nowMs: number = Date.now(),
): Promise<EventDropRow[]> {
  const access = eventDropAccess(role);
  const revealed = nowMs >= event.schedule.revealAtMs;
  if (access === 'none' || (!revealed && !role.checkedIn)) return [];
  const [{ data, error }, blocked] = await Promise.all([
    admin.from('event_drops').select(DROP_COLUMNS).eq('beacon_id', event.id).is('deleted_at', null),
    loadBlockedUserIds(admin, viewerId),
  ]);
  if (error) throw new Error(`event drops read: ${error.message}`);
  const rows = ((data ?? []) as EventDropRow[]).filter((r) => !blocked.has(r.user_id));
  const recapRows = rows.map((r) => ({ ...r, id: r.id, userId: r.user_id, createdAtMs: Date.parse(r.created_at), showToAbsentees: r.show_to_absentees }));
  if (!revealed) return orderRecap(recapRows.filter((r) => r.userId === viewerId), viewerId);
  if (access === 'absentee') return selectAbsenteeDrops(recapRows.filter((r) => r.userId !== viewerId), config.absenteeLimit);
  return orderRecap(recapRows, viewerId);
}

export type SerializedEventDrop = {
  id: string;
  user: { id: string; name: string; avatar_url: string | null };
  is_mine: boolean;
  created_at: string;
  reveal_at: string;
  filter_seed: number;
  width: number | null;
  height: number | null;
  /** Always the pixelated rendition; the original only comes from /api/drops/develop. */
  preview_url: string | null;
};

export async function serializeEventDrops(
  admin: SupabaseClient,
  rows: EventDropRow[],
  viewerId: string,
): Promise<SerializedEventDrop[]> {
  if (rows.length === 0) return [];
  const posterIds = [...new Set(rows.map((r) => r.user_id))];
  const [{ data: users }, previews] = await Promise.all([
    admin.from('users').select('id, name, image, first_name, last_name').in('id', posterIds),
    signDropObjects(admin, rows.map((r) => r.preview_path)),
  ]);
  const byId = new Map(((users ?? []) as UserProfileRow[]).map((u) => [u.id, u]));
  return rows.map((r) => {
    const poster = byId.get(r.user_id) ?? null;
    return {
      id: r.id,
      user: { id: r.user_id, name: displayNameFromUser(poster, 'Someone'), avatar_url: poster?.image ?? null },
      is_mine: r.user_id === viewerId,
      created_at: r.created_at,
      reveal_at: r.reveal_at,
      filter_seed: r.filter_seed,
      width: r.width,
      height: r.height,
      preview_url: previews.get(r.preview_path) ?? null,
    };
  });
}

/** `/api/drops/develop` resolver for event drops: exactly the drops `visibleEventDrops` shows. */
export function eventDropResolver(config: EventDropsConfig) {
  return async (admin: SupabaseClient, viewerId: string, ids: string[]): Promise<Map<string, ResolvedDrop>> => {
    const out = new Map<string, ResolvedDrop>();
    const { data, error } = await admin.from('event_drops').select('id, beacon_id').in('id', ids).is('deleted_at', null);
    if (error) throw new Error(`event drops resolve: ${error.message}`);
    const beaconIds = [...new Set(((data ?? []) as Array<{ beacon_id: string }>).map((r) => r.beacon_id))];
    const wanted = new Set(ids);
    for (const beaconId of beaconIds) {
      const event = await loadDropEvent(admin, beaconId, config);
      if (!event) continue;
      const role = await loadEventRole(admin, event, viewerId);
      for (const row of await visibleEventDrops(admin, event, viewerId, role, config)) {
        if (wanted.has(row.id)) out.set(row.id, { revealAtMs: Date.parse(row.reveal_at), originalPath: row.original_path });
      }
    }
    return out;
  };
}

/** Uploads both renditions and inserts the row; storage is cleaned up if the insert fails. */
export async function insertEventDrop(
  admin: SupabaseClient,
  args: {
    event: DropEvent;
    userId: string;
    clientDropId: string;
    mimeType: string;
    original: Buffer;
    preview: Buffer;
    width: number | null;
    height: number | null;
    showToAbsentees: boolean;
  },
): Promise<{ row: EventDropRow } | { error: 'cap_reached' | 'duplicate' | 'failed' }> {
  const uploaded = await uploadDropRenditions(
    admin,
    dropObjectPrefix('event', args.event.id, args.userId),
    args.mimeType,
    args.original,
    args.preview,
  );
  if (!uploaded) return { error: 'failed' };
  const { originalPath, previewPath } = uploaded;
  const { data, error } = await admin
    .from('event_drops')
    .insert({
      beacon_id: args.event.id,
      user_id: args.userId,
      client_drop_id: args.clientDropId,
      original_path: originalPath,
      preview_path: previewPath,
      width: args.width,
      height: args.height,
      filter_seed: crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff,
      show_to_absentees: args.showToAbsentees,
      reveal_at: new Date(args.event.schedule.revealAtMs).toISOString(),
    })
    .select(DROP_COLUMNS)
    .single();
  if (error) {
    await removeDropObjects(admin, [originalPath, previewPath]);
    if (error.code === '23514') return { error: 'cap_reached' };
    if (error.code === '23505') return { error: 'duplicate' };
    console.error('[eventDrops] insert:', error.message);
    return { error: 'failed' };
  }
  const { error: recapError } = await admin
    .from('event_drop_recaps')
    .upsert({ beacon_id: args.event.id, reveal_at: new Date(args.event.schedule.revealAtMs).toISOString() }, { onConflict: 'beacon_id', ignoreDuplicates: true });
  if (recapError) console.warn('[eventDrops] recap row:', recapError.message);
  return { row: data as EventDropRow };
}

export async function findEventDropByClientId(
  admin: SupabaseClient,
  userId: string,
  clientDropId: string,
): Promise<EventDropRow | null> {
  const { data } = await admin
    .from('event_drops')
    .select(DROP_COLUMNS)
    .eq('user_id', userId)
    .eq('client_drop_id', clientDropId)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as EventDropRow | null) ?? null;
}

/** The poster's current "show to people who couldn't make it" choice for this event (default on). */
export async function posterAbsenteeSetting(admin: SupabaseClient, beaconId: string, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('event_drops')
    .select('show_to_absentees')
    .eq('beacon_id', beaconId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { show_to_absentees?: boolean } | null)?.show_to_absentees ?? true;
}

/** Soft-deletes the poster's drop and removes both renditions. Returns false if it isn't theirs. */
export async function deleteEventDrop(admin: SupabaseClient, dropId: string, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('event_drops')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', dropId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('original_path, preview_path')
    .maybeSingle();
  if (error) throw new Error(`event drop delete: ${error.message}`);
  const row = data as { original_path: string; preview_path: string } | null;
  if (!row) return false;
  await removeDropObjects(admin, [row.original_path, row.preview_path]);
  return true;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AuthorizedEventDrops = {
  ok: true;
  userId: string;
  admin: SupabaseClient;
  config: EventDropsConfig;
  event: DropEvent;
};

/** Signed in, in the event_drops cohort, and the beacon is a scheduled event (404s look alike). */
export async function authorizeEventDropRequest(
  request: NextRequest,
  beaconId: string,
): Promise<AuthorizedEventDrops | { ok: false; response: Response }> {
  if (!UUID_RE.test(beaconId)) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid beacon id' }, { status: 400 }) };
  }
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const admin = createAdminSupabaseClient();
  const feature = await requireFeature(admin, 'event_drops', user.id);
  if (!feature.ok) return { ok: false, response: feature.response };
  const config = eventDropsConfigFrom(feature.config);
  const event = await loadDropEvent(admin, beaconId, config);
  if (!event) return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { ok: true, userId: user.id, admin, config, event };
}
