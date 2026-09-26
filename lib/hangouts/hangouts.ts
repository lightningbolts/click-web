import type { SupabaseClient } from '@supabase/supabase-js';
import { isActiveIshConnection } from '@/lib/events/attendeeDirectory';
import { recordEncounter } from '@/lib/connections/recordEncounter';
import { deliverNudge, resolveNudges, type PushContext } from '@/lib/nudges/moments';

/**
 * Hangouts logged without a tap. Nothing reaches the shared timeline until both people
 * confirm: one-sided logging ('manual', the logger is pre-confirmed) and detected co-presence
 * ('nearby', both confirm). A confirmed hangout records a normal encounter.
 */

const HOUR_MS = 60 * 60 * 1000;
export const HANGOUT_TTL_MS = 48 * HOUR_MS;
/** How far back a manual log may date a hangout. */
export const MAX_BACKDATE_MS = 7 * 24 * HOUR_MS;
/** Co-presence: two pings within this distance and time of each other. */
export const NEARBY_RADIUS_M = 200;
export const NEARBY_WINDOW_MS = 30 * 60 * 1000;
/** No nearby prompt when the pair already logged (or was prompted) this recently. */
export const NEARBY_QUIET_MS = 8 * HOUR_MS;

export type HangoutRow = {
  id: string;
  connection_id: string;
  user_ids: string[];
  confirmed_user_ids: string[];
  source: 'manual' | 'nearby';
  requested_by: string | null;
  occurred_at: string;
  gps_lat: number | null;
  gps_lon: number | null;
  location_name: string | null;
  status: 'pending' | 'confirmed' | 'declined' | 'expired';
  encounter_id: string | null;
  expires_at: string;
};

const COLUMNS =
  'id, connection_id, user_ids, confirmed_user_ids, source, requested_by, occurred_at, gps_lat, gps_lon, location_name, status, encounter_id, expires_at';

/** API shape of a hangout, from `viewerId`'s side. */
export function serializeHangout(row: HangoutRow, viewerId: string) {
  return {
    id: row.id,
    connection_id: row.connection_id,
    peer_user_id: row.user_ids.find((id) => id !== viewerId) ?? null,
    source: row.source,
    status: row.status,
    occurred_at: row.occurred_at,
    location_name: row.location_name,
    confirmed_by_me: row.confirmed_user_ids.includes(viewerId),
    requested_by_me: row.requested_by === viewerId,
    expires_at: row.expires_at,
    encounter_id: row.encounter_id,
  };
}

export function distanceMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidCoordinate(lat: unknown, lon: unknown): lat is number {
  return (
    typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) &&
    Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)
  );
}

type PairConnection = { id: string; userIds: [string, string] };

/** The active one-to-one connection `userId` belongs to, or null. */
export async function pairConnection(admin: SupabaseClient, connectionId: string, userId: string): Promise<PairConnection | null> {
  const { data } = await admin
    .from('connections')
    .select('id, user_ids, status, expiry_state')
    .eq('id', connectionId)
    .maybeSingle();
  const row = data as { id: string; user_ids: string[] | null; status: string | null; expiry_state: string | null } | null;
  const ids = (row?.user_ids ?? []).map(String);
  if (!row || ids.length !== 2 || !ids.includes(userId) || !isActiveIshConnection(row)) return null;
  return { id: row.id, userIds: [ids[0], ids[1]] };
}

async function firstNames(admin: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const { data } = await admin.from('users').select('id, first_name, name').in('id', ids);
  const names = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; first_name?: string | null; name?: string | null }>) {
    const first = row.first_name?.trim() || row.name?.trim().split(/\s+/)[0] || 'A connection';
    names.set(row.id, first);
  }
  return names;
}

/** Tells everyone in `recipients` who hasn't confirmed yet (in-app + push). */
async function promptToConfirm(admin: SupabaseClient, hangout: HangoutRow, recipients: string[], push: PushContext) {
  const names = await firstNames(admin, hangout.user_ids);
  for (const userId of recipients) {
    const peerId = hangout.user_ids.find((id) => id !== userId) ?? '';
    await deliverNudge(
      admin,
      {
        userId,
        type: 'hangout_confirm',
        dedupeKey: hangout.id,
        connectionId: hangout.connection_id,
        payload: {
          confirmation_id: hangout.id,
          source: hangout.source,
          peer_user_id: peerId,
          peer_first_name: names.get(peerId) ?? 'A connection',
          place_name: hangout.location_name,
          occurred_at: hangout.occurred_at,
        },
      },
      push,
    );
  }
}

/** Starts a confirmation and prompts whoever still has to confirm. */
export async function createHangout(
  admin: SupabaseClient,
  args: {
    connection: PairConnection;
    source: 'manual' | 'nearby';
    requestedBy: string | null;
    occurredAt: Date;
    lat: number | null;
    lon: number | null;
    locationName: string | null;
  },
  push: PushContext,
): Promise<HangoutRow | null> {
  const { data, error } = await admin
    .from('hangout_confirmations')
    .insert({
      connection_id: args.connection.id,
      user_ids: args.connection.userIds,
      confirmed_user_ids: args.requestedBy ? [args.requestedBy] : [],
      source: args.source,
      requested_by: args.requestedBy,
      occurred_at: args.occurredAt.toISOString(),
      gps_lat: args.lat,
      gps_lon: args.lon,
      location_name: args.locationName,
      expires_at: new Date(Date.now() + HANGOUT_TTL_MS).toISOString(),
    })
    .select(COLUMNS)
    .single();
  if (error || !data) {
    console.error('[hangouts] create:', error?.message);
    return null;
  }
  const hangout = data as HangoutRow;
  await promptToConfirm(admin, hangout, hangout.user_ids.filter((id) => !hangout.confirmed_user_ids.includes(id)), push);
  return hangout;
}

export async function loadHangout(admin: SupabaseClient, id: string): Promise<HangoutRow | null> {
  const { data } = await admin.from('hangout_confirmations').select(COLUMNS).eq('id', id).maybeSingle();
  return (data as HangoutRow | null) ?? null;
}

export type ConfirmResult =
  | { status: 'waiting'; hangout: HangoutRow }
  | { status: 'confirmed'; hangout: HangoutRow; alreadyLogged: boolean }
  | { status: 'unavailable'; reason: string };

/**
 * Records `userId`'s confirmation; when everyone has confirmed, writes the encounter once
 * (the pending → confirmed transition is conditional, so two simultaneous confirms can't
 * both insert).
 */
export async function confirmHangout(admin: SupabaseClient, id: string, userId: string): Promise<ConfirmResult> {
  const hangout = await loadHangout(admin, id);
  if (!hangout || !hangout.user_ids.includes(userId)) return { status: 'unavailable', reason: 'not_found' };
  if (hangout.status === 'confirmed') return { status: 'confirmed', hangout, alreadyLogged: true };
  if (hangout.status !== 'pending' || Date.parse(hangout.expires_at) <= Date.now()) {
    return { status: 'unavailable', reason: hangout.status === 'pending' ? 'expired' : hangout.status };
  }

  const confirmed = Array.from(new Set([...hangout.confirmed_user_ids, userId]));
  const everyone = hangout.user_ids.every((id) => confirmed.includes(id));
  await resolveNudges(admin, { type: 'hangout_confirm', dedupeKey: id, userIds: [userId] }, 'acted_on_at');

  if (!everyone) {
    const { data } = await admin
      .from('hangout_confirmations')
      .update({ confirmed_user_ids: confirmed })
      .eq('id', id)
      .eq('status', 'pending')
      .select(COLUMNS)
      .maybeSingle();
    return data ? { status: 'waiting', hangout: data as HangoutRow } : { status: 'unavailable', reason: 'changed' };
  }

  // Claim the transition first; only the winner writes the encounter.
  const { data: claimed } = await admin
    .from('hangout_confirmations')
    .update({ confirmed_user_ids: confirmed, status: 'confirmed', resolved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select(COLUMNS)
    .maybeSingle();
  if (!claimed) {
    const latest = await loadHangout(admin, id);
    return latest?.status === 'confirmed'
      ? { status: 'confirmed', hangout: latest, alreadyLogged: true }
      : { status: 'unavailable', reason: latest?.status ?? 'not_found' };
  }

  const row = claimed as HangoutRow;
  const sensorData: Record<string, unknown> = {};
  if (row.gps_lat != null && row.gps_lon != null) {
    sensorData.gps_lat = row.gps_lat;
    sensorData.gps_lon = row.gps_lon;
  }
  if (row.location_name) sensorData.location_name = row.location_name;
  const recorded = await recordEncounter(admin, {
    connectionId: row.connection_id,
    reportingUserId: row.requested_by ?? userId,
    sensorData,
    encounteredAt: row.occurred_at,
  });
  // A tap within the last 3 hours already put this hangout on the timeline.
  const alreadyLogged = !recorded.ok && recorded.rateLimited;
  if (recorded.ok && recorded.encounterId) {
    await admin.from('hangout_confirmations').update({ encounter_id: recorded.encounterId }).eq('id', id);
    row.encounter_id = recorded.encounterId;
  } else if (!recorded.ok && !recorded.rateLimited) {
    // Let a retry try again rather than leave a confirmed hangout with no encounter.
    await admin.from('hangout_confirmations').update({ status: 'pending', resolved_at: null }).eq('id', id);
    return { status: 'unavailable', reason: 'record_failed' };
  }
  return { status: 'confirmed', hangout: row, alreadyLogged };
}

export async function declineHangout(admin: SupabaseClient, id: string, userId: string): Promise<boolean> {
  const hangout = await loadHangout(admin, id);
  if (!hangout || !hangout.user_ids.includes(userId) || hangout.status !== 'pending') return false;
  await admin
    .from('hangout_confirmations')
    .update({ status: 'declined', resolved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending');
  await resolveNudges(admin, { type: 'hangout_confirm', dedupeKey: id }, 'dismissed_at');
  return true;
}

/** True when the pair has a hangout prompt or encounter within `windowMs` (no re-prompt). */
async function recentlyTogether(admin: SupabaseClient, connectionId: string, windowMs: number): Promise<boolean> {
  const since = new Date(Date.now() - windowMs).toISOString();
  const [{ count: prompts }, { count: encounters }] = await Promise.all([
    admin.from('hangout_confirmations').select('id', { count: 'exact', head: true })
      .eq('connection_id', connectionId).gte('created_at', since).neq('status', 'declined'),
    admin.from('connection_encounters').select('id', { count: 'exact', head: true })
      .eq('connection_id', connectionId).gte('encountered_at', since),
  ]);
  return (prompts ?? 0) > 0 || (encounters ?? 0) > 0;
}

/**
 * Records an opt-in "I'm here" ping and prompts both people of every active connection whose
 * latest ping is within 200 m and 30 minutes (both opted in, or they wouldn't have a ping).
 */
export async function handlePresencePing(
  admin: SupabaseClient,
  userId: string,
  lat: number,
  lon: number,
  push: PushContext,
): Promise<{ prompted: number }> {
  const now = Date.now();
  await admin.from('presence_pings').upsert({ user_id: userId, lat, lon, pinged_at: new Date(now).toISOString() });

  // Bounding box first (≈0.3 km), exact distance after.
  const dLat = 0.003;
  const dLon = 0.003 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const { data: nearby } = await admin
    .from('presence_pings')
    .select('user_id, lat, lon')
    .neq('user_id', userId)
    .gte('pinged_at', new Date(now - NEARBY_WINDOW_MS).toISOString())
    .gte('lat', lat - dLat).lte('lat', lat + dLat)
    .gte('lon', lon - dLon).lte('lon', lon + dLon)
    .limit(50);
  const others = ((nearby ?? []) as Array<{ user_id: string; lat: number; lon: number }>)
    .filter((p) => distanceMeters({ lat, lon }, p) <= NEARBY_RADIUS_M)
    .map((p) => p.user_id);
  if (others.length === 0) return { prompted: 0 };

  const { data: connections } = await admin
    .from('connections')
    .select('id, user_ids, status, expiry_state')
    .contains('user_ids', [userId]);
  let prompted = 0;
  for (const row of (connections ?? []) as Array<{ id: string; user_ids: string[] | null; status: string | null; expiry_state: string | null }>) {
    const ids = (row.user_ids ?? []).map(String);
    if (ids.length !== 2 || !isActiveIshConnection(row)) continue;
    const peer = ids.find((id) => id !== userId);
    if (!peer || !others.includes(peer)) continue;
    if (await recentlyTogether(admin, row.id, NEARBY_QUIET_MS)) continue;
    const created = await createHangout(
      admin,
      {
        connection: { id: row.id, userIds: [ids[0], ids[1]] },
        source: 'nearby',
        requestedBy: null,
        occurredAt: new Date(now),
        lat,
        lon,
        locationName: null,
      },
      push,
    );
    if (created) prompted += 1;
  }
  return { prompted };
}

/** Hourly: expire stale prompts and forget old presence. */
export async function sweepHangouts(admin: SupabaseClient, nowMs: number = Date.now()): Promise<{ expired: number }> {
  const nowIso = new Date(nowMs).toISOString();
  const { data } = await admin
    .from('hangout_confirmations')
    .update({ status: 'expired', resolved_at: nowIso })
    .eq('status', 'pending')
    .lt('expires_at', nowIso)
    .select('id');
  for (const row of (data ?? []) as Array<{ id: string }>) {
    await resolveNudges(admin, { type: 'hangout_confirm', dedupeKey: row.id }, 'dismissed_at');
  }
  await admin.from('presence_pings').delete().lt('pinged_at', new Date(nowMs - 2 * HOUR_MS).toISOString());
  return { expired: data?.length ?? 0 };
}
