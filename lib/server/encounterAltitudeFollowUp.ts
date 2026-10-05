/**
 * Late barometric altitude for encounters the reporting phone already logged.
 *
 * A phone's altimeter often has no absolute fix yet when a quick QR scan or tap completes, so
 * the connection is sent without `exact_barometric_elevation_m` (keeping the connect fast).
 * The phone keeps its altimeter running briefly and, once the fix arrives, sends the altitude
 * at the connection moment (already corrected for any height change since, using its own
 * relative altimeter). This fills that phone's own rows and derives the terrain-relative
 * altitude and height band from them.
 *
 * Rows are matched by the reporting user, the connections named, and the exact connection
 * moment the phone stamped into `sensor_observation.connection_moment`, and are only ever
 * filled — an altitude already stored is never overwritten.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchOpenMeteoForecast } from '@/lib/server/proximity/bindSupport';
import { terrainColumns } from '@/lib/server/terrainElevation';

export type AltitudeFollowUpInput = {
  connectionIds: string[];
  connectionMoment: string;
  observedAt: string;
  altitudeM: number;
  accuracyM: number | null;
  precisionM: number | null;
};

export type AltitudeFollowUpResult =
  | { ok: true; updated: number }
  | { ok: false; status: 400; error: string };

/** The phone sends the follow-up within seconds; older moments are not accepted. */
export const FOLLOW_UP_MAX_MOMENT_AGE_MS = 15 * 60_000;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
/** The fix may be at most this long after the moment (the phone waits 20 s). */
export const FOLLOW_UP_MAX_FIX_DELAY_MS = 60_000;
const FIX_LOOKBACK_MS = 30_000;
/** `connection_moment` is stamped with millisecond precision. */
const MOMENT_MATCH_TOLERANCE_MS = 2;
const MIN_ALTITUDE_M = -1_000;
const MAX_ALTITUDE_M = 12_000;
const MAX_ACCURACY_M = 100_000;

type EncounterRow = {
  id: string;
  gps_lat: number | null;
  gps_lon: number | null;
  terrain_elevation_m: number | null;
  exact_barometric_elevation_m: number | null;
  sensor_observation: Record<string, unknown> | null;
};

function parseMs(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Validates the timing and ranges; returns an error message or null. */
export function validateAltitudeFollowUp(input: AltitudeFollowUpInput, nowMs: number): string | null {
  const momentMs = parseMs(input.connectionMoment);
  const observedMs = parseMs(input.observedAt);
  if (momentMs == null || observedMs == null) return 'Invalid timestamps';
  if (nowMs - momentMs > FOLLOW_UP_MAX_MOMENT_AGE_MS || momentMs - nowMs > MAX_FUTURE_SKEW_MS) {
    return 'Connection moment is out of range';
  }
  if (observedMs - momentMs > FOLLOW_UP_MAX_FIX_DELAY_MS || momentMs - observedMs > FIX_LOOKBACK_MS) {
    return 'Altitude fix is too far from the connection moment';
  }
  const altitude = finite(input.altitudeM);
  if (altitude == null || altitude < MIN_ALTITUDE_M || altitude > MAX_ALTITUDE_M) return 'Altitude out of range';
  for (const value of [input.accuracyM, input.precisionM]) {
    if (value == null) continue;
    const n = finite(value);
    if (n == null || n < 0 || n > MAX_ACCURACY_M) return 'Accuracy out of range';
  }
  return null;
}

function momentOf(row: EncounterRow): number | null {
  const raw = row.sensor_observation?.connection_moment;
  return typeof raw === 'string' ? parseMs(raw) : null;
}

export async function applyAltitudeFollowUp(
  admin: SupabaseClient,
  userId: string,
  input: AltitudeFollowUpInput,
  nowMs: number = Date.now(),
): Promise<AltitudeFollowUpResult> {
  const invalid = validateAltitudeFollowUp(input, nowMs);
  if (invalid) return { ok: false, status: 400, error: invalid };
  const momentMs = parseMs(input.connectionMoment)!;
  const observedMs = parseMs(input.observedAt)!;

  const { data, error } = await admin
    .from('connection_encounters')
    .select('id, gps_lat, gps_lon, terrain_elevation_m, exact_barometric_elevation_m, sensor_observation')
    .in('connection_id', input.connectionIds)
    .eq('reporting_user_id', userId)
    .gte('encountered_at', new Date(nowMs - FOLLOW_UP_MAX_MOMENT_AGE_MS - MAX_FUTURE_SKEW_MS).toISOString());
  if (error) throw new Error(`encounter lookup: ${error.message}`);

  const rows = ((data ?? []) as EncounterRow[]).filter((row) => {
    const rowMoment = momentOf(row);
    return (
      row.exact_barometric_elevation_m == null &&
      rowMoment != null &&
      Math.abs(rowMoment - momentMs) <= MOMENT_MATCH_TOLERANCE_MS
    );
  });
  if (rows.length === 0) return { ok: true, updated: 0 };

  // One forecast request at most, and none when the rows already carry their DEM elevation.
  const terrainCache = new Map<string, number | null>();
  const terrainAt = async (row: EncounterRow): Promise<number | null> => {
    const stored = finite(row.terrain_elevation_m);
    if (stored != null) return stored;
    const lat = finite(row.gps_lat);
    const lon = finite(row.gps_lon);
    if (lat == null || lon == null || (lat === 0 && lon === 0)) return null;
    const key = `${lat},${lon}`;
    if (!terrainCache.has(key)) terrainCache.set(key, (await fetchOpenMeteoForecast(lat, lon)).elevationM);
    return terrainCache.get(key) ?? null;
  };

  let updated = 0;
  for (const row of rows) {
    const updates: Record<string, unknown> = {
      exact_barometric_elevation_m: input.altitudeM,
      ...terrainColumns({
        barometricAltitudeM: input.altitudeM,
        barometricAccuracyM: input.accuracyM,
        terrainElevationM: await terrainAt(row),
      }),
    };
    if (input.accuracyM != null) updates.barometric_accuracy_m = input.accuracyM;
    if (input.precisionM != null) updates.barometric_precision_m = input.precisionM;

    // Kept beside the capture so the time to the absolute fix can be measured.
    const observation = row.sensor_observation ?? {};
    const barometer =
      observation.barometer && typeof observation.barometer === 'object' && !Array.isArray(observation.barometer)
        ? (observation.barometer as Record<string, unknown>)
        : {};
    updates.sensor_observation = {
      ...observation,
      barometer: {
        ...barometer,
        follow_up: {
          t_ms: observedMs - momentMs,
          received_t_ms: nowMs - momentMs,
          absolute_altitude_m: input.altitudeM,
          ...(input.accuracyM != null ? { absolute_accuracy_m: input.accuracyM } : {}),
        },
      },
    };

    const { error: updateError } = await admin
      .from('connection_encounters')
      .update(updates)
      .eq('id', row.id)
      .is('exact_barometric_elevation_m', null);
    if (updateError) throw new Error(`encounter altitude update: ${updateError.message}`);
    updated += 1;
  }
  return { ok: true, updated };
}
