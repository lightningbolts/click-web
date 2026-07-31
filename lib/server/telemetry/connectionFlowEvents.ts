import type { SupabaseClient } from '@supabase/supabase-js';
import { isValidCheckInCoordinate } from '@/lib/server/eventEngagement';
import type { LiveEventBeaconAttachment } from '@/lib/server/resolveLiveEventBeaconAt';

/**
 * Allowlisted connection-flow / proximity handshake event types.
 * Keep in sync with KMP `ConnectionFlowTelemetry.ALLOWED_EVENTS`.
 */
export const CONNECTION_FLOW_ALLOWED_EVENTS = new Set([
  'proximity_handshake_started',
  'proximity_handshake_matched',
  'proximity_handshake_awaiting_selection',
  'proximity_handshake_pending',
  'proximity_handshake_offline_queued',
  'proximity_handshake_failed',
  'proximity_host_selection_confirmed',
  'proximity_host_selection_abandoned',
  'proximity_reconnect_encounter_saved',
  'proximity_reconnect_rate_limited',
  'proximity_recovery_poll_success',
  'proximity_recovery_poll_timeout',
  'proximity_recovery_incomplete',
  'verified_clique_from_proximity_created',
  'verified_clique_from_proximity_blocked',
  'proximity_at_event_attached',
  'proximity_at_event_skipped',
]);

export type ConnectionFlowEventFields = {
  event: string;
  peerCount?: number | null;
  isGroup?: boolean | null;
  isReconnect?: boolean | null;
  selectedCount?: number | null;
  candidateCount?: number | null;
  reason?: string | null;
};

function sanitizeNonNegInt(raw: number | null | undefined): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  return Math.max(0, Math.floor(raw));
}

function sanitizeReason(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 128);
}

/**
 * Insert into `connection_flow_events` (service role).
 * Returns false when the event is not allowlisted or the insert fails.
 */
export async function emitConnectionFlowEvent(
  admin: SupabaseClient,
  fields: ConnectionFlowEventFields,
): Promise<boolean> {
  const eventType = fields.event.trim();
  if (!CONNECTION_FLOW_ALLOWED_EVENTS.has(eventType)) return false;

  try {
    const { error } = await admin.from('connection_flow_events').insert({
      event_type: eventType,
      peer_count: sanitizeNonNegInt(fields.peerCount ?? null),
      is_group: typeof fields.isGroup === 'boolean' ? fields.isGroup : null,
      is_reconnect: typeof fields.isReconnect === 'boolean' ? fields.isReconnect : null,
      selected_count: sanitizeNonNegInt(fields.selectedCount ?? null),
      candidate_count: sanitizeNonNegInt(fields.candidateCount ?? null),
      reason: sanitizeReason(fields.reason ?? null),
    });

    if (error) {
      console.warn('[connection-flow telemetry]', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(
      '[connection-flow telemetry]',
      e instanceof Error ? e.message : String(e),
    );
    return false;
  }
}

export function proximityAtEventSkipReason(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  participantIds: string[],
): string {
  if (!isValidCheckInCoordinate(latitude ?? null, longitude ?? null)) {
    return 'missing_gps';
  }
  const ids = [
    ...new Set(participantIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  ];
  if (ids.length < 2) return 'insufficient_participants';
  return 'no_live_event_match';
}

/**
 * Record at-event resolution outcome for proximity encounter writes.
 * No user ids or coordinates — only allowlisted event + optional reason.
 */
export async function emitProximityAtEventOutcome(
  admin: SupabaseClient,
  opts: {
    attachment: LiveEventBeaconAttachment | null;
    latitude: number | null | undefined;
    longitude: number | null | undefined;
    participantIds: string[];
    peerCount?: number | null;
    isGroup?: boolean | null;
  },
): Promise<void> {
  const peerCount =
    opts.peerCount ??
    [...new Set(opts.participantIds.map((id) => id.trim()).filter(Boolean))].length;

  if (opts.attachment) {
    void emitConnectionFlowEvent(admin, {
      event: 'proximity_at_event_attached',
      peerCount,
      isGroup: opts.isGroup ?? peerCount > 2,
    });
    return;
  }

  void emitConnectionFlowEvent(admin, {
    event: 'proximity_at_event_skipped',
    peerCount,
    isGroup: opts.isGroup ?? peerCount > 2,
    reason: proximityAtEventSkipReason(
      opts.latitude,
      opts.longitude,
      opts.participantIds,
    ),
  });
}
