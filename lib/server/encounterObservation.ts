/**
 * One reporting device's own location / altimeter observation quality, as sent by clients
 * on `/api/connections/proximity`, `/api/qr` and `/api/connections`.
 *
 * Wire keys equal the `connection_encounters` column names. Every field is optional: older
 * clients send none of them and must keep working. Values are validated here once and then
 * copied verbatim onto the reporting user's own encounter row — never combined with, or
 * corrected by, another participant's observation.
 */

export type LocationObservationColumns = {
  gps_horizontal_accuracy_m?: number;
  gps_vertical_accuracy_m?: number;
  gps_altitude_m?: number;
  gps_ellipsoidal_altitude_m?: number;
  gps_observed_at?: string;
  gps_floor?: number;
  gps_full_accuracy?: boolean;
};

export type BarometricObservationColumns = {
  barometric_accuracy_m?: number;
  barometric_precision_m?: number;
  barometric_relative_altitude_m?: number;
  barometric_pressure_kpa?: number;
};

export type EncounterObservationColumns = LocationObservationColumns & BarometricObservationColumns;

/** Plausible ranges; anything outside is treated as a sensor/client fault and dropped. */
const MAX_ACCURACY_M = 100_000;
const MIN_ALTITUDE_M = -1_000;
const MAX_ALTITUDE_M = 12_000;
const MIN_FLOOR = -20;
const MAX_FLOOR = 300;
const MIN_PRESSURE_KPA = 20;
const MAX_PRESSURE_KPA = 120;
const MAX_RELATIVE_ALTITUDE_M = 2_000;
/** Device clocks drift; a fix stamped further in the future than this is not trusted. */
const MAX_OBSERVED_AT_FUTURE_SKEW_MS = 5 * 60_000;

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function inRange(value: unknown, min: number, max: number): number | null {
  const n = finite(value);
  return n != null && n >= min && n <= max ? n : null;
}

function observedAtIso(value: unknown, nowMs: number): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms > nowMs + MAX_OBSERVED_AT_FUTURE_SKEW_MS) return null;
  return new Date(ms).toISOString();
}

/**
 * Location quality for the coordinate the same body carries. Core Location altitude is kept
 * only with a positive vertical accuracy (zero/negative means the altitude is invalid).
 */
export function parseLocationObservation(
  source: Record<string, unknown>,
  nowMs: number = Date.now(),
): LocationObservationColumns {
  const out: LocationObservationColumns = {};
  const horizontal = inRange(source.gps_horizontal_accuracy_m, 0, MAX_ACCURACY_M);
  if (horizontal != null) out.gps_horizontal_accuracy_m = horizontal;

  const vertical = inRange(source.gps_vertical_accuracy_m, 0, MAX_ACCURACY_M);
  if (vertical != null && vertical > 0) {
    out.gps_vertical_accuracy_m = vertical;
    const altitude = inRange(source.gps_altitude_m, MIN_ALTITUDE_M, MAX_ALTITUDE_M);
    if (altitude != null) out.gps_altitude_m = altitude;
    const ellipsoidal = inRange(source.gps_ellipsoidal_altitude_m, MIN_ALTITUDE_M, MAX_ALTITUDE_M);
    if (ellipsoidal != null) out.gps_ellipsoidal_altitude_m = ellipsoidal;
  }

  const observedAt = observedAtIso(source.gps_observed_at, nowMs);
  if (observedAt != null) out.gps_observed_at = observedAt;

  const floor = inRange(source.gps_floor, MIN_FLOOR, MAX_FLOOR);
  if (floor != null && Number.isInteger(floor)) out.gps_floor = floor;

  if (typeof source.gps_full_accuracy === 'boolean') out.gps_full_accuracy = source.gps_full_accuracy;
  return out;
}

/** Altimeter quality that accompanies `exact_barometric_elevation_m` in the same body. */
export function parseBarometricObservation(source: Record<string, unknown>): BarometricObservationColumns {
  const out: BarometricObservationColumns = {};
  const accuracy = inRange(source.barometric_accuracy_m, 0, MAX_ACCURACY_M);
  if (accuracy != null) out.barometric_accuracy_m = accuracy;
  const precision = inRange(source.barometric_precision_m, 0, MAX_ACCURACY_M);
  if (precision != null) out.barometric_precision_m = precision;
  const relative = inRange(source.barometric_relative_altitude_m, -MAX_RELATIVE_ALTITUDE_M, MAX_RELATIVE_ALTITUDE_M);
  if (relative != null) out.barometric_relative_altitude_m = relative;
  const pressure = inRange(source.barometric_pressure_kpa, MIN_PRESSURE_KPA, MAX_PRESSURE_KPA);
  if (pressure != null) out.barometric_pressure_kpa = pressure;
  return out;
}

export const LOCATION_OBSERVATION_KEYS = [
  'gps_horizontal_accuracy_m',
  'gps_vertical_accuracy_m',
  'gps_altitude_m',
  'gps_ellipsoidal_altitude_m',
  'gps_observed_at',
  'gps_floor',
  'gps_full_accuracy',
] as const satisfies readonly (keyof LocationObservationColumns)[];

export const BAROMETRIC_OBSERVATION_KEYS = [
  'barometric_accuracy_m',
  'barometric_precision_m',
  'barometric_relative_altitude_m',
  'barometric_pressure_kpa',
] as const satisfies readonly (keyof BarometricObservationColumns)[];

/**
 * Columns for one reporting user's encounter row. Location quality is attached only when the
 * row carries that same device's coordinate; barometer quality only with its altitude.
 */
export function encounterObservationColumns(
  observation: EncounterObservationColumns,
  opts: { hasOwnCoordinate: boolean; hasBarometricAltitude: boolean },
): EncounterObservationColumns {
  const out: EncounterObservationColumns = {};
  if (opts.hasOwnCoordinate) {
    for (const key of LOCATION_OBSERVATION_KEYS) {
      if (observation[key] !== undefined) (out as Record<string, unknown>)[key] = observation[key];
    }
  }
  if (opts.hasBarometricAltitude) {
    for (const key of BAROMETRIC_OBSERVATION_KEYS) {
      if (observation[key] !== undefined) (out as Record<string, unknown>)[key] = observation[key];
    }
  }
  return out;
}

/** Parses both halves from one request body (or one stored sensor payload). */
export function parseEncounterObservation(
  source: Record<string, unknown>,
  nowMs: number = Date.now(),
): EncounterObservationColumns {
  return { ...parseLocationObservation(source, nowMs), ...parseBarometricObservation(source) };
}
