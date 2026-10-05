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
  // QR scans and Click links (iOS); `capture_quality.connection_method` tells them apart.
  'qr_connect_started',
  'qr_connect_succeeded',
  'qr_connect_failed',
  'qr_connect_reconnect_rate_limited',
]);

export type ConnectionFlowEventFields = {
  event: string;
  peerCount?: number | null;
  isGroup?: boolean | null;
  isReconnect?: boolean | null;
  selectedCount?: number | null;
  candidateCount?: number | null;
  reason?: string | null;
  /** Already sanitized with `sanitizeCaptureQuality`. */
  captureQuality?: CaptureQuality | null;
};

/**
 * Aggregate capture-quality metrics a client may attach to a flow event (spec: connection
 * sensor capture §43). Only these keys, only finite numbers / booleans / short enum strings:
 * no identifiers, tokens or coordinates can be stored this way.
 */
const CAPTURE_QUALITY_NUMBERS = {
  location_accuracy_m: [0, 100_000],
  location_capture_ms: [0, 600_000],
  location_update_count: [0, 10_000],
  barometer_accuracy_m: [0, 100_000],
  ble_peer_count: [0, 100],
  ble_rssi_median_dbm: [-130, 20],
  ble_rssi_sample_count: [0, 10_000],
  ble_discovery_ms: [0, 600_000],
  ble_gatt_read_ms: [0, 600_000],
  ultrasonic_peer_count: [0, 100],
  ultrasonic_snr_db: [-60, 120],
  ultrasonic_peak_ratio: [0, 1_000_000],
  ultrasonic_decode_ms: [0, 600_000],
  motion_sample_count: [0, 10_000],
  capture_duration_ms: [0, 600_000],
} as const satisfies Record<string, readonly [number, number]>;

const CAPTURE_QUALITY_BOOLEANS = [
  'location_full_accuracy',
  'location_available',
  'barometer_available',
  'motion_available',
  'heading_available',
  'uwb_available',
  'floor_available',
  'activity_available',
  'pedometer_available',
] as const;

const CAPTURE_QUALITY_ENUMS = {
  location_accuracy_bucket: ['excellent', 'good', 'usable', 'coarse', 'unusable', 'none'],
  connection_method: ['tap', 'qr', 'link'],
  sensor_failure: ['none', 'location_unavailable', 'location_denied', 'barometer_unavailable', 'motion_unavailable', 'bluetooth_no_peer', 'ultrasonic_no_peer'],
} as const satisfies Record<string, readonly string[]>;

export type CaptureQuality = Record<string, number | boolean | string>;

export function sanitizeCaptureQuality(raw: unknown): CaptureQuality | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const out: CaptureQuality = {};
  for (const [key, [min, max]] of Object.entries(CAPTURE_QUALITY_NUMBERS)) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max) {
      out[key] = Math.round(value * 100) / 100;
    }
  }
  for (const key of CAPTURE_QUALITY_BOOLEANS) {
    if (typeof input[key] === 'boolean') out[key] = input[key] as boolean;
  }
  for (const [key, allowed] of Object.entries(CAPTURE_QUALITY_ENUMS)) {
    const value = input[key];
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

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
      // Omitted (not null) when absent so events still insert before the column exists.
      ...(fields.captureQuality ? { capture_quality: fields.captureQuality } : {}),
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
  if (ids.length < 1) return 'insufficient_participants';
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
