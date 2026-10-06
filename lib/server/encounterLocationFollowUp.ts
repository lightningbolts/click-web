/**
 * A tighter location for encounters the reporting phone already logged.
 *
 * GPS keeps converging for tens of seconds after a tap or QR scan, while the people who just
 * met are still together reading the result. The phone keeps location running briefly, only
 * while it stays still, and sends a clearly tighter fix of the same spot. This replaces that
 * phone's own fix on its rows for the tap (see `followUpRows`) only when it is better and agrees
 * with the stored one, so a stored location is never made worse or moved elsewhere.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  finite,
  followUpRows,
  parseMs,
  validateFollowUpTiming,
  type FollowUpTiming,
} from '@/lib/server/encounterFollowUpRows';

export type LocationFollowUpInput = FollowUpTiming & {
  lat: number;
  lon: number;
  accuracyM: number;
};

export type LocationFollowUpResult =
  | { ok: true; updated: number }
  | { ok: false; status: 400; error: string };

/** Coarser fixes are never attached to an encounter (the client's limit too). */
const MAX_USEFUL_ACCURACY_M = 50;

type EncounterRow = {
  id: string;
  connection_id: string;
  gps_lat: number | null;
  gps_lon: number | null;
  gps_horizontal_accuracy_m: number | null;
  sensor_observation: Record<string, unknown> | null;
};

/** Validates the timing and ranges; returns an error message or null. */
export function validateLocationFollowUp(input: LocationFollowUpInput, nowMs: number): string | null {
  const timing = validateFollowUpTiming(input, nowMs);
  if (timing) return timing;
  const lat = finite(input.lat);
  const lon = finite(input.lon);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
    return 'Location out of range';
  }
  const accuracy = finite(input.accuracyM);
  if (accuracy == null || accuracy <= 0 || accuracy > MAX_USEFUL_ACCURACY_M) return 'Accuracy out of range';
  return null;
}

/** Ground distance (m) between two nearby coordinates. */
export function metersBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const metersPerDegree = 111_320;
  const x = (lon2 - lon1) * metersPerDegree * Math.cos((lat1 * Math.PI) / 180);
  const y = (lat2 - lat1) * metersPerDegree;
  return Math.hypot(x, y);
}

export async function applyLocationFollowUp(
  admin: SupabaseClient,
  userId: string,
  input: LocationFollowUpInput,
  nowMs: number = Date.now(),
): Promise<LocationFollowUpResult> {
  const invalid = validateLocationFollowUp(input, nowMs);
  if (invalid) return { ok: false, status: 400, error: invalid };
  const momentMs = parseMs(input.connectionMoment)!;
  const observedMs = parseMs(input.observedAt)!;

  const rows = (
    await followUpRows<EncounterRow>(
      admin,
      userId,
      input,
      'id, connection_id, gps_lat, gps_lon, gps_horizontal_accuracy_m, sensor_observation',
      nowMs,
    )
  ).filter((row) => {
    const lat = finite(row.gps_lat);
    const lon = finite(row.gps_lon);
    const stored = finite(row.gps_horizontal_accuracy_m);
    // Better than the stored fix, and the same spot: within both radii of it.
    return (
      lat != null &&
      lon != null &&
      stored != null &&
      input.accuracyM < stored &&
      metersBetween(lat, lon, input.lat, input.lon) <= stored + input.accuracyM
    );
  });

  let updated = 0;
  for (const row of rows) {
    const observation = row.sensor_observation ?? {};
    const location =
      observation.location && typeof observation.location === 'object' && !Array.isArray(observation.location)
        ? (observation.location as Record<string, unknown>)
        : {};
    const { error } = await admin
      .from('connection_encounters')
      .update({
        gps_lat: input.lat,
        gps_lon: input.lon,
        gps_horizontal_accuracy_m: input.accuracyM,
        gps_observed_at: new Date(observedMs).toISOString(),
        // The capture's own fix stays in the observation beside the refinement.
        sensor_observation: {
          ...observation,
          location: {
            ...location,
            follow_up: {
              t_ms: observedMs - momentMs,
              received_t_ms: nowMs - momentMs,
              horizontal_accuracy_m: input.accuracyM,
            },
          },
        },
      })
      .eq('id', row.id)
      .gt('gps_horizontal_accuracy_m', input.accuracyM);
    if (error) throw new Error(`encounter location update: ${error.message}`);
    updated += 1;
  }
  return { ok: true, updated };
}
