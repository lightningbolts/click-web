import type { MapBeaconRecord, MapBeaconType } from '@/lib/map/mapBeacons';

/** Maximum scheduled event duration (30 days). */
export const MAX_EVENT_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export type EventSchedule = {
  startEpochMs: number;
  endEpochMs: number;
};

export function parseEpochMs(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const ms = Date.parse(raw.trim());
  return Number.isFinite(ms) ? ms : null;
}

export function parseEventScheduleFromMetadata(
  meta: Record<string, unknown>,
): EventSchedule | null {
  const startEpochMs = parseEpochMs(meta.event_start_at ?? meta.eventStartAt);
  const endEpochMs = parseEpochMs(meta.event_end_at ?? meta.eventEndAt);
  if (startEpochMs == null || endEpochMs == null) return null;
  return { startEpochMs, endEpochMs };
}

export function validateEventSchedule(
  startEpochMs: number,
  endEpochMs: number,
  nowEpochMs: number = Date.now(),
): string | null {
  if (endEpochMs <= startEpochMs) return 'Event end must be after start.';
  if (startEpochMs < nowEpochMs - 60_000) return 'Event start must be in the future.';
  if (endEpochMs - startEpochMs > MAX_EVENT_DURATION_MS) {
    return 'Events can last at most 1 month.';
  }
  return null;
}

/** Event beacons stay visible until scheduled end (metadata), not a stale TTL column alone. */
export function isVisibleEventBeacon(
  beacon: Pick<MapBeaconRecord, 'beacon_type' | 'expires_at' | 'metadata'>,
  nowEpochMs: number = Date.now(),
): boolean {
  if (beacon.beacon_type !== 'event') return true;
  const schedule = parseEventScheduleFromMetadata(beacon.metadata);
  if (schedule) return nowEpochMs < schedule.endEpochMs;
  const exp = Date.parse(beacon.expires_at);
  return Number.isFinite(exp) && exp > nowEpochMs;
}

/** Proximity list visibility — events honor schedule end; other types use expires_at. */
export function isActiveForDiscoveryFeed(
  beacon: Pick<MapBeaconRecord, 'beacon_type' | 'expires_at' | 'metadata'>,
  nowEpochMs: number = Date.now(),
): boolean {
  if (beacon.beacon_type === 'event') return isVisibleEventBeacon(beacon, nowEpochMs);
  const exp = Date.parse(beacon.expires_at);
  return Number.isFinite(exp) && exp > nowEpochMs;
}

export function filterActiveBeaconsForDiscovery(
  beacons: MapBeaconRecord[],
  nowEpochMs: number = Date.now(),
): MapBeaconRecord[] {
  return beacons.filter((b) => isActiveForDiscoveryFeed(b, nowEpochMs));
}

/** Resolve expires_at for inserts — event end comes from metadata schedule. */
export function resolveBeaconExpiresAtIso(
  beaconType: MapBeaconType,
  metadata: Record<string, unknown>,
  body: Record<string, unknown>,
  nowMs: number = Date.now(),
): { expiresAtIso: string } | { error: string } {
  if (beaconType === 'event') {
    const schedule = parseEventScheduleFromMetadata(metadata);
    if (schedule == null) {
      return { error: 'Event beacons require metadata.event_start_at and metadata.event_end_at.' };
    }
    const scheduleErr = validateEventSchedule(schedule.startEpochMs, schedule.endEpochMs, nowMs);
    if (scheduleErr != null) return { error: scheduleErr };
    return { expiresAtIso: new Date(schedule.endEpochMs).toISOString() };
  }

  let ttlMs: number | null =
    typeof body.ttl_ms === 'number' && Number.isFinite(body.ttl_ms) ? body.ttl_ms : null;
  if (ttlMs != null && ttlMs <= 0) ttlMs = null;

  let expiresExplicit: number | null = null;
  if (typeof body.expires_at === 'string') {
    const p = Date.parse(body.expires_at);
    if (Number.isFinite(p)) expiresExplicit = p;
  }

  let candidate: number;
  if (expiresExplicit != null) {
    candidate = expiresExplicit;
  } else if (ttlMs != null) {
    candidate = nowMs + ttlMs;
  } else if (beaconType === 'soundtrack') {
    candidate = nowMs + 7 * 24 * 60 * 60 * 1000;
  } else {
    candidate = nowMs + 24 * 60 * 60 * 1000;
  }

  const minExpire = nowMs + 15 * 60 * 1000;
  const maxExpire = nowMs + MAX_EVENT_DURATION_MS;
  candidate = Math.min(Math.max(candidate, minExpire), maxExpire);
  return { expiresAtIso: new Date(candidate).toISOString() };
}
