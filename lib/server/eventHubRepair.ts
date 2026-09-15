import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createHubForEventBeacon,
  findHubForEventBeacon,
  type EventHubRow,
} from '@/lib/server/eventHubLifecycle';

export type EventHubRepairInput = {
  beaconId: string;
  creatorId: string | null;
  lat: number | null;
  lng: number | null;
  metadata: Record<string, unknown>;
  expiresAt: string | null;
};

export type EventHubRepairResult =
  | { hub: EventHubRow; repaired: boolean }
  | { hub: null; repaired: false; reason: 'expired' | 'invalid' | 'create_failed'; detail?: string };

/**
 * Resolve the canonical event hub, repairing legacy active events that predate auto-hub
 * provisioning. The unique event_beacon_id index is the race arbiter: if another request wins the
 * insert, re-read and return that canonical hub rather than surfacing a transient conflict.
 */
export async function ensureEventHubForBeacon(
  admin: SupabaseClient,
  input: EventHubRepairInput,
): Promise<EventHubRepairResult> {
  const existing = await findHubForEventBeacon(admin, input.beaconId);
  if (existing != null) return { hub: existing, repaired: false };

  const expiryMs = input.expiresAt == null ? Number.NaN : Date.parse(input.expiresAt);
  if (Number.isFinite(expiryMs) && expiryMs <= Date.now()) {
    return { hub: null, repaired: false, reason: 'expired' };
  }

  if (
    input.creatorId == null ||
    input.creatorId.trim().length === 0 ||
    input.lat == null ||
    input.lng == null ||
    !Number.isFinite(input.lat) ||
    !Number.isFinite(input.lng)
  ) {
    return { hub: null, repaired: false, reason: 'invalid' };
  }

  const created = await createHubForEventBeacon(admin, {
    beaconId: input.beaconId,
    creatorId: input.creatorId,
    lat: input.lat,
    lng: input.lng,
    metadata: input.metadata,
  });

  if ('hubId' in created) {
    const hub = await findHubForEventBeacon(admin, input.beaconId);
    if (hub != null) {
      await reconcileEventHubParticipants(admin, input.beaconId, hub.id, input.creatorId);
      return { hub, repaired: true };
    }
  }

  // A concurrent request may have inserted the unique event link between our initial read and
  // create attempt. Treat the database relationship as canonical and re-read once.
  const raced = await findHubForEventBeacon(admin, input.beaconId);
  if (raced != null) {
    await reconcileEventHubParticipants(admin, input.beaconId, raced.id, input.creatorId);
    return { hub: raced, repaired: false };
  }

  return {
    hub: null,
    repaired: false,
    reason: 'create_failed',
    detail: 'error' in created ? created.error : undefined,
  };
}

/** Keep the compatibility participant table aligned with live RSVP state for repaired hubs. */
export async function reconcileEventHubParticipants(
  admin: SupabaseClient,
  beaconId: string,
  hubId: string,
  creatorId: string | null,
): Promise<void> {
  const { data: rsvps, error } = await admin
    .from('beacon_attendees')
    .select('user_id')
    .eq('beacon_id', beaconId);

  if (error) {
    console.warn('[eventHubRepair] attendee reconciliation:', error.message);
  }

  const userIds = new Set<string>();
  if (creatorId != null && creatorId.trim().length > 0) userIds.add(creatorId.trim());
  if (Array.isArray(rsvps)) {
    for (const row of rsvps) {
      const raw = (row as { user_id?: unknown }).user_id;
      if (typeof raw === 'string' && raw.trim().length > 0) userIds.add(raw.trim());
    }
  }

  if (userIds.size === 0) return;
  const { error: upsertError } = await admin
    .from('hub_participants')
    .upsert(
      [...userIds].map((userId) => ({ hub_id: hubId, user_id: userId })),
      { onConflict: 'hub_id,user_id', ignoreDuplicates: true },
    );
  if (upsertError) {
    console.warn('[eventHubRepair] participant upsert:', upsertError.message);
  }
}
