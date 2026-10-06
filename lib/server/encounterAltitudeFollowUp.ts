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
 * Rows are the caller's for that tap (see `followUpRows`: a group tap's pairwise rows too), and
 * are only ever filled — an altitude already stored is never overwritten.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchOpenMeteoForecast } from '@/lib/server/proximity/bindSupport';
import { terrainColumns } from '@/lib/server/terrainElevation';
import {
  finite,
  followUpRows,
  parseMs,
  validateFollowUpTiming,
  type FollowUpTiming,
} from '@/lib/server/encounterFollowUpRows';

export type AltitudeFollowUpInput = FollowUpTiming & {
  altitudeM: number;
  accuracyM: number | null;
  precisionM: number | null;
};

export type AltitudeFollowUpResult =
  | { ok: true; updated: number }
  | { ok: false; status: 400; error: string };

const MIN_ALTITUDE_M = -1_000;
const MAX_ALTITUDE_M = 12_000;
const MAX_ACCURACY_M = 100_000;

type EncounterRow = {
  id: string;
  connection_id: string;
  gps_lat: number | null;
  gps_lon: number | null;
  terrain_elevation_m: number | null;
  exact_barometric_elevation_m: number | null;
  sensor_observation: Record<string, unknown> | null;
};

/** Validates the timing and ranges; returns an error message or null. */
export function validateAltitudeFollowUp(input: AltitudeFollowUpInput, nowMs: number): string | null {
  const timing = validateFollowUpTiming(input, nowMs);
  if (timing) return timing;
  const altitude = finite(input.altitudeM);
  if (altitude == null || altitude < MIN_ALTITUDE_M || altitude > MAX_ALTITUDE_M) return 'Altitude out of range';
  for (const value of [input.accuracyM, input.precisionM]) {
    if (value == null) continue;
    const n = finite(value);
    if (n == null || n < 0 || n > MAX_ACCURACY_M) return 'Accuracy out of range';
  }
  return null;
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

  const rows = (
    await followUpRows<EncounterRow>(
      admin,
      userId,
      input,
      'id, connection_id, gps_lat, gps_lon, terrain_elevation_m, exact_barometric_elevation_m, sensor_observation',
      nowMs,
    )
  ).filter((row) => row.exact_barometric_elevation_m == null);
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
