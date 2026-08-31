import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseEventScheduleFromMetadata } from '@/lib/map/eventSchedule';
import { resolveCheckInRadiusMeters } from '@/lib/server/eventEngagement';
import { eventHubExpiresAtIso } from '@/lib/server/eventHubAccess';
import { resolveBeaconHubId } from '@/lib/map/mapBeacons';

export { EVENT_HUB_TTL_AFTER_END_MS, eventHubExpiresAtIso } from '@/lib/server/eventHubAccess';

export function newEventHubId(): string {
  return `hub_${randomUUID().replace(/-/g, '')}`;
}

function eventTitleFromMetadata(metadata: Record<string, unknown>): string {
  for (const key of ['title', 'event_title', 'name', 'label']) {
    const raw = metadata[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim().slice(0, 80);
  }
  return 'Event';
}

export type EventHubRow = {
  id: string;
  name: string;
  creator_id: string | null;
  event_beacon_id: string | null;
  expires_at: string | null;
};

export async function findHubForEventBeacon(
  admin: SupabaseClient,
  beaconId: string,
): Promise<EventHubRow | null> {
  const { data, error } = await admin
    .from('hub_venues')
    .select('id, name, creator_id, event_beacon_id, expires_at')
    .eq('event_beacon_id', beaconId)
    .maybeSingle();
  if (error) {
    console.error('[eventHubLifecycle] findHubForEventBeacon:', error.message);
    return null;
  }
  if (data == null || typeof (data as { id?: unknown }).id !== 'string') return null;
  return data as EventHubRow;
}

export async function createHubForEventBeacon(
  admin: SupabaseClient,
  args: {
    beaconId: string;
    creatorId: string;
    lat: number;
    lng: number;
    metadata: Record<string, unknown>;
  },
): Promise<{ hubId: string } | { error: string }> {
  const schedule = parseEventScheduleFromMetadata(args.metadata);
  if (schedule == null) {
    return { error: 'Event beacons require a schedule to create a hub.' };
  }
  const hubId = newEventHubId();
  const name = eventTitleFromMetadata(args.metadata);
  const { radiusMeters } = resolveCheckInRadiusMeters(args.metadata);
  const expiresAt = eventHubExpiresAtIso(schedule.endEpochMs);

  const { error: hubErr } = await admin.from('hub_venues').insert({
    id: hubId,
    name,
    category: 'event',
    geofence_lat: args.lat,
    geofence_long: args.lng,
    radius_meters: Math.round(radiusMeters),
    expires_at: expiresAt,
    creator_id: args.creatorId,
    event_beacon_id: args.beaconId,
  });
  if (hubErr) {
    console.error('[eventHubLifecycle] hub insert:', hubErr.message);
    return { error: hubErr.message };
  }

  const { error: partErr } = await admin.from('hub_participants').insert({
    hub_id: hubId,
    user_id: args.creatorId,
  });
  if (partErr) {
    console.error('[eventHubLifecycle] host participant:', partErr.message);
  }

  const nextMeta = { ...args.metadata, hub_id: hubId };
  const { error: linkErr } = await admin
    .from('map_beacons')
    .update({ hub_id: hubId, metadata: nextMeta })
    .eq('id', args.beaconId);
  if (linkErr) {
    console.error('[eventHubLifecycle] beacon hub_id:', linkErr.message);
    await admin.from('hub_venues').delete().eq('id', hubId);
    return { error: linkErr.message };
  }

  return { hubId };
}

export async function syncEventHubFromBeacon(
  admin: SupabaseClient,
  args: {
    beaconId: string;
    lat: number;
    lng: number;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  const hub = await findHubForEventBeacon(admin, args.beaconId);
  if (hub == null) return;
  const schedule = parseEventScheduleFromMetadata(args.metadata);
  const { radiusMeters } = resolveCheckInRadiusMeters(args.metadata);
  const patch: Record<string, unknown> = {
    name: eventTitleFromMetadata(args.metadata),
    geofence_lat: args.lat,
    geofence_long: args.lng,
    radius_meters: Math.round(radiusMeters),
  };
  if (schedule != null) {
    patch.expires_at = eventHubExpiresAtIso(schedule.endEpochMs);
  }
  const { error } = await admin.from('hub_venues').update(patch).eq('id', hub.id);
  if (error) {
    console.error('[eventHubLifecycle] syncEventHubFromBeacon:', error.message);
  }
}

export async function grantEventHubOnCheckIn(
  admin: SupabaseClient,
  beaconId: string,
  userId: string,
): Promise<string | null> {
  const hub = await findHubForEventBeacon(admin, beaconId);
  if (hub == null) return null;
  const { error } = await admin
    .from('hub_participants')
    .upsert({ hub_id: hub.id, user_id: userId }, { onConflict: 'hub_id,user_id', ignoreDuplicates: true });
  if (error) {
    console.error('[eventHubLifecycle] grantEventHubOnCheckIn:', error.message);
  }
  return hub.id;
}

export async function revokeEventHubOnCheckOut(
  admin: SupabaseClient,
  beaconId: string,
  userId: string,
): Promise<void> {
  const hub = await findHubForEventBeacon(admin, beaconId);
  if (hub == null) return;
  if (hub.creator_id && hub.creator_id === userId) return;
  const { error } = await admin
    .from('hub_participants')
    .delete()
    .eq('hub_id', hub.id)
    .eq('user_id', userId);
  if (error) {
    console.error('[eventHubLifecycle] revokeEventHubOnCheckOut:', error.message);
  }
}

export function hubIdFromBeaconRow(row: Record<string, unknown>): string | null {
  return resolveBeaconHubId(row);
}
