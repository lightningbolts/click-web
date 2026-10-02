import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlacesConfig } from '@/lib/places/config';
import type { ProofResult } from '@/lib/places/geofence';
import type { CheckInProof, PlaceCheckInState } from '@/lib/places/types';
import { hereNowCount, loadActiveCheckIns, loadGhostedIds } from '@/lib/server/places/enrich';
import type { ConsumerPlaceRow } from '@/lib/server/places/loadPlace';

/**
 * Place check-in transactions (§5.4). Coordinates never reach this module; it stores only the
 * proof kind, server-assigned weight and buckets. "Active" always means open AND unexpired,
 * because cron closes expired rows only hourly.
 */

type CheckInRow = {
  id: string;
  place_id: string;
  user_id: string;
  checked_at: string;
  expires_at: string | null;
  checked_out_at: string | null;
  proof: CheckInProof | null;
  proof_weight: number | null;
  share_with_connections: boolean;
};

const CHECK_IN_COLUMNS = 'id, place_id, user_id, checked_at, expires_at, checked_out_at, proof, proof_weight, share_with_connections';

function fail(label: string, error: { message: string } | null): void {
  if (error) throw new Error(`place check-in ${label}: ${error.message}`);
}

export function checkInState(row: CheckInRow): PlaceCheckInState {
  return {
    active: true,
    check_in_id: row.id,
    checked_in_at: row.checked_at,
    expires_at: row.expires_at ?? row.checked_at,
    proof: row.proof ?? 'gps',
    share_with_connections: row.share_with_connections === true,
  };
}

/** The user's active check-in at this Place, or null. */
export async function loadActiveCheckIn(
  admin: SupabaseClient,
  placeId: string,
  userId: string,
  nowMs: number,
): Promise<CheckInRow | null> {
  const { data, error } = await admin
    .from('place_check_ins')
    .select(CHECK_IN_COLUMNS)
    .eq('place_id', placeId)
    .eq('user_id', userId)
    .is('checked_out_at', null)
    .gt('expires_at', new Date(nowMs).toISOString())
    .order('checked_at', { ascending: false })
    .limit(1);
  fail('active', error);
  return ((data ?? []) as CheckInRow[])[0] ?? null;
}

export async function hereNowCountForPlace(
  admin: SupabaseClient,
  placeId: string,
  viewerId: string | null,
  nowMs: number,
): Promise<number> {
  const rows = await loadActiveCheckIns(admin, [placeId], nowMs);
  const ghosted = await loadGhostedIds(admin, rows.map((r) => r.user_id));
  return hereNowCount(rows, ghosted, viewerId);
}

export async function userCountsForInsights(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('users')
    .select('location_include_in_insights_enabled')
    .eq('id', userId)
    .maybeSingle();
  if (error) return false;
  return (data as { location_include_in_insights_enabled?: boolean | null } | null)?.location_include_in_insights_enabled === true;
}

export type CheckInResult = {
  checked_in: true;
  refreshed: boolean;
  check_in_id: string;
  checked_in_at: string;
  expires_at: string;
  proof: CheckInProof;
  share_with_connections: boolean;
  hub_id: string | null;
  here_now_count: number;
};

export async function performCheckIn(
  admin: SupabaseClient,
  input: {
    place: ConsumerPlaceRow;
    userId: string;
    proof: Extract<ProofResult, { ok: true }>;
    shareWithConnections?: boolean;
    platform?: string | null;
    appVersion?: string | null;
    config: PlacesConfig;
    nowMs: number;
  },
): Promise<CheckInResult> {
  const { place, userId, proof, config, nowMs } = input;
  const nowIso = new Date(nowMs).toISOString();
  const expiresIso = new Date(nowMs + config.checkinTtlMinutes * 60_000).toISOString();

  // 3. Close this user's stale (expired but still open) rows here.
  const { data: stale, error: staleErr } = await admin
    .from('place_check_ins')
    .select('id, expires_at')
    .eq('place_id', place.id)
    .eq('user_id', userId)
    .is('checked_out_at', null)
    .lte('expires_at', nowIso);
  fail('stale read', staleErr);
  for (const row of (stale ?? []) as Array<{ id: string; expires_at: string }>) {
    const { error } = await admin
      .from('place_check_ins')
      .update({ checked_out_at: row.expires_at, checkout_reason: 'expired' })
      .eq('id', row.id);
    fail('stale close', error);
  }
  // Legacy rows without an expiry can never be active; close them too.
  const { error: legacyErr } = await admin
    .from('place_check_ins')
    .update({ checked_out_at: nowIso, checkout_reason: 'expired' })
    .eq('place_id', place.id)
    .eq('user_id', userId)
    .is('checked_out_at', null)
    .is('expires_at', null);
  fail('legacy close', legacyErr);

  // 4. A person is in one Place at a time: supersede active check-ins elsewhere.
  const { error: supersedeErr } = await admin
    .from('place_check_ins')
    .update({ checked_out_at: nowIso, checkout_reason: 'superseded' })
    .eq('user_id', userId)
    .neq('place_id', place.id)
    .is('checked_out_at', null)
    .gt('expires_at', nowIso);
  fail('supersede', supersedeErr);

  // 5. Refresh an active check-in here, or 6. insert a new one.
  let row = await loadActiveCheckIn(admin, place.id, userId, nowMs);
  let refreshed = false;
  if (!row) {
    const insertRow = {
      place_id: place.id,
      user_id: userId,
      checked_at: nowIso,
      expires_at: expiresIso,
      proof: proof.proof,
      proof_weight: proof.weight,
      anchor_id: proof.anchor_id,
      distance_bucket: proof.distance_bucket,
      accuracy_bucket: proof.accuracy_bucket,
      share_with_connections: input.shareWithConnections === true,
      count_for_insights: await userCountsForInsights(admin, userId),
      platform: input.platform?.slice(0, 16) ?? null,
      app_version: input.appVersion?.slice(0, 32) ?? null,
    };
    const { data, error } = await admin.from('place_check_ins').insert(insertRow).select(CHECK_IN_COLUMNS).single();
    if (error && (error as { code?: string }).code !== '23505') fail('insert', error);
    if (error) {
      // Lost a race with a concurrent check-in: treat it as a refresh.
      row = await loadActiveCheckIn(admin, place.id, userId, nowMs);
      if (!row) throw new Error('place check-in insert raced and no active row was found');
    } else {
      row = data as CheckInRow;
    }
  }
  if (row && row.checked_at !== nowIso) {
    refreshed = true;
    const patch: Record<string, unknown> = { expires_at: expiresIso };
    if (input.shareWithConnections !== undefined) patch.share_with_connections = input.shareWithConnections;
    if (proof.weight > (row.proof_weight ?? 0)) {
      patch.proof = proof.proof;
      patch.proof_weight = proof.weight;
      patch.anchor_id = proof.anchor_id;
      patch.distance_bucket = proof.distance_bucket;
      patch.accuracy_bucket = proof.accuracy_bucket;
    }
    const { data, error } = await admin.from('place_check_ins').update(patch).eq('id', row.id).select(CHECK_IN_COLUMNS).single();
    fail('refresh', error);
    row = data as CheckInRow;
  }

  // 7. Place Hub membership (same model as standalone hubs; kept after check-out).
  let hubId: string | null = null;
  if (place.hub_enabled) {
    const { data: hub, error: hubErr } = await admin.from('hub_venues').select('id').eq('place_id', place.id).maybeSingle();
    fail('hub', hubErr);
    hubId = (hub as { id?: string } | null)?.id ?? null;
    if (hubId) {
      const { error } = await admin
        .from('hub_participants')
        .upsert({ hub_id: hubId, user_id: userId }, { onConflict: 'hub_id,user_id', ignoreDuplicates: true });
      if (error) console.warn('[places] hub participant upsert:', error.message);
    }
  }

  const state = checkInState(row as CheckInRow);
  return {
    checked_in: true,
    refreshed,
    check_in_id: state.check_in_id,
    checked_in_at: state.checked_in_at,
    expires_at: state.expires_at,
    proof: state.proof,
    share_with_connections: state.share_with_connections,
    hub_id: hubId,
    here_now_count: await hereNowCountForPlace(admin, place.id, userId, nowMs),
  };
}

/** DELETE: close the active check-in (idempotent) and say whether to ask "Come back at this time?". */
export async function performCheckOut(
  admin: SupabaseClient,
  input: { placeId: string; userId: string; config: PlacesConfig; nowMs: number },
): Promise<{ checked_in: false; ask_would_return: boolean }> {
  const { placeId, userId, config, nowMs } = input;
  const active = await loadActiveCheckIn(admin, placeId, userId, nowMs);
  if (!active) return { checked_in: false, ask_would_return: false };
  const { error } = await admin
    .from('place_check_ins')
    .update({ checked_out_at: new Date(nowMs).toISOString(), checkout_reason: 'user' })
    .eq('id', active.id);
  fail('check-out', error);

  const sinceIso = new Date(nowMs - config.wouldReturnWindowMinutes * 60_000).toISOString();
  const { data, error: wrErr } = await admin
    .from('place_pulses')
    .select('id')
    .eq('place_id', placeId)
    .eq('user_id', userId)
    .not('would_return', 'is', null)
    .gte('created_at', sinceIso)
    .limit(1);
  fail('would-return read', wrErr);
  return { checked_in: false, ask_would_return: ((data ?? []) as unknown[]).length === 0 };
}
