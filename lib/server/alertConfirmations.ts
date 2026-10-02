import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { configNumber } from '@/lib/server/featureFlags';
import {
  DEFAULT_ALERT_CONFIG,
  isAlertBeaconType,
  type AlertConfig,
  type AlertConfirmationStatus,
  type AlertVote,
} from '@/lib/map/alertConfirmations';
import { loadVisibleBeacon } from '@/lib/map/beaconVisibility';

export function alertConfigFrom(config: Record<string, unknown>): AlertConfig {
  const d = DEFAULT_ALERT_CONFIG;
  return {
    ttlMinutes: configNumber(config, 'ttl_minutes', d.ttlMinutes, { min: 5, max: 24 * 60 }),
    radiusMeters: configNumber(config, 'radius_meters', d.radiusMeters, { min: 25, max: 5000 }),
    clearedThreshold: configNumber(config, 'cleared_threshold', d.clearedThreshold, { min: 1, max: 20 }),
    voteWindowMinutes: configNumber(config, 'vote_window_minutes', d.voteWindowMinutes, { min: 5, max: 24 * 60 }),
    maxLifetimeHours: configNumber(config, 'max_lifetime_hours', d.maxLifetimeHours, { min: 1, max: 24 * 7 }),
  };
}

export type AlertBeacon = {
  id: string;
  creatorId: string;
  createdAtMs: number;
  expiresAtMs: number;
  clearedAt: string | null;
  lat: number;
  lng: number;
};

/** An alert beacon this viewer can see (hidden, missing and non-alert beacons are all 404). */
export async function loadVisibleAlertBeacon(
  admin: SupabaseClient,
  beaconId: string,
  viewerId: string,
): Promise<{ beacon: AlertBeacon } | { response: NextResponse }> {
  const loaded = await loadVisibleBeacon(admin, beaconId, viewerId);
  if (!loaded || !isAlertBeaconType(loaded.beacon.beacon_type)) {
    return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }
  const { beacon, row } = loaded;
  return {
    beacon: {
      id: beacon.id,
      creatorId: beacon.creator_id,
      createdAtMs: Date.parse(beacon.created_at),
      expiresAtMs: Date.parse(beacon.expires_at),
      clearedAt: typeof row.cleared_at === 'string' ? row.cleared_at : null,
      lat: beacon.lat,
      lng: beacon.lng,
    },
  };
}

export async function loadAlertVotes(admin: SupabaseClient, beaconId: string, sinceIso: string): Promise<AlertVote[]> {
  const { data, error } = await admin
    .from('beacon_confirmations')
    .select('user_id, status, created_at')
    .eq('beacon_id', beaconId)
    .gt('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(`beacon_confirmations read: ${error.message}`);
  return ((data ?? []) as Array<{ user_id: string; status: AlertConfirmationStatus; created_at: string }>).map((v) => ({
    userId: v.user_id,
    status: v.status,
    createdAtMs: Date.parse(v.created_at),
  }));
}

export async function recordAlertVote(
  admin: SupabaseClient,
  beaconId: string,
  userId: string,
  status: AlertConfirmationStatus,
): Promise<void> {
  const { error } = await admin.from('beacon_confirmations').insert({ beacon_id: beaconId, user_id: userId, status });
  if (error) throw new Error(`beacon_confirmations insert: ${error.message}`);
}

/** Pushes expiry out (never in: concurrent votes can only extend). */
export async function extendAlert(admin: SupabaseClient, beaconId: string, expiresAtMs: number): Promise<void> {
  const iso = new Date(expiresAtMs).toISOString();
  const { error } = await admin
    .from('map_beacons')
    .update({ expires_at: iso })
    .eq('id', beaconId)
    .is('cleared_at', null)
    .lt('expires_at', iso);
  if (error) throw new Error(`map_beacons extend: ${error.message}`);
}

/** Clears for everyone: every client's fetch drops beacons whose expires_at has passed. */
export async function clearAlert(admin: SupabaseClient, beaconId: string, nowMs: number): Promise<void> {
  const iso = new Date(nowMs).toISOString();
  const { error } = await admin
    .from('map_beacons')
    .update({ expires_at: iso, cleared_at: iso })
    .eq('id', beaconId)
    .is('cleared_at', null);
  if (error) throw new Error(`map_beacons clear: ${error.message}`);
}
