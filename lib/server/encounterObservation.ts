/**
 * One reporting device's own location / altimeter observation quality and its versioned raw
 * connection sensor observation, as sent by clients on `/api/connections/proximity`,
 * `/api/qr` and `/api/connections`.
 *
 * Wire keys equal the `connection_encounters` column names. Every field is optional: older
 * clients send none of them and must keep working. Values are validated here once and then
 * copied verbatim onto the reporting user's own encounter row — never combined with, or
 * corrected by, another participant's observation.
 */

import type { Json } from '@/types/supabase-json';

export type LocationObservationColumns = {
  gps_horizontal_accuracy_m?: number;
  gps_vertical_accuracy_m?: number;
  gps_altitude_m?: number;
  gps_ellipsoidal_altitude_m?: number;
  gps_observed_at?: string;
  gps_floor?: number;
  gps_full_accuracy?: boolean;
  gps_speed_mps?: number;
  gps_speed_accuracy_mps?: number;
  gps_course_deg?: number;
  gps_course_accuracy_deg?: number;
  gps_simulated?: boolean;
  gps_external_accessory?: boolean;
};

export type BarometricObservationColumns = {
  barometric_accuracy_m?: number;
  barometric_precision_m?: number;
  barometric_relative_altitude_m?: number;
  barometric_pressure_kpa?: number;
};

/** Versioned raw sensor observation (motion, heading, BLE, ultrasonic, device…); stored as-is. */
export type SensorObservationJson = { [key: string]: Json | undefined };

export type SensorObservationColumns = {
  sensor_observation?: SensorObservationJson;
};

export type EncounterObservationColumns = LocationObservationColumns &
  BarometricObservationColumns &
  SensorObservationColumns;

/** Plausible ranges; anything outside is treated as a sensor/client fault and dropped. */
const MAX_ACCURACY_M = 100_000;
const MIN_ALTITUDE_M = -1_000;
const MAX_ALTITUDE_M = 12_000;
const MIN_FLOOR = -20;
const MAX_FLOOR = 300;
const MIN_PRESSURE_KPA = 20;
const MAX_PRESSURE_KPA = 120;
const MAX_RELATIVE_ALTITUDE_M = 2_000;
const MAX_SPEED_MPS = 350;
/** Bounded so a client cannot grow rows without limit (matches the column CHECK). */
export const MAX_SENSOR_OBSERVATION_BYTES = 64 * 1024;
const MAX_SENSOR_OBSERVATION_SCHEMA_VERSION = 100;
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

  // Negative speed/course (and their accuracies) mean "unavailable" — never substituted.
  const speed = inRange(source.gps_speed_mps, 0, MAX_SPEED_MPS);
  if (speed != null) {
    out.gps_speed_mps = speed;
    const speedAccuracy = inRange(source.gps_speed_accuracy_mps, 0, MAX_SPEED_MPS);
    if (speedAccuracy != null) out.gps_speed_accuracy_mps = speedAccuracy;
  }
  const course = inRange(source.gps_course_deg, 0, 360);
  if (course != null && course < 360) {
    out.gps_course_deg = course;
    const courseAccuracy = inRange(source.gps_course_accuracy_deg, 0, 180);
    if (courseAccuracy != null) out.gps_course_accuracy_deg = courseAccuracy;
  }
  if (typeof source.gps_simulated === 'boolean') out.gps_simulated = source.gps_simulated;
  if (typeof source.gps_external_accessory === 'boolean') out.gps_external_accessory = source.gps_external_accessory;
  return out;
}

/** Altimeter readings: pressure and relative change, plus the quality of `exact_barometric_elevation_m`. */
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
  'gps_speed_mps',
  'gps_speed_accuracy_mps',
  'gps_course_deg',
  'gps_course_accuracy_deg',
  'gps_simulated',
  'gps_external_accessory',
] as const satisfies readonly (keyof LocationObservationColumns)[];

export const BAROMETRIC_OBSERVATION_KEYS = [
  'barometric_accuracy_m',
  'barometric_precision_m',
  'barometric_relative_altitude_m',
  'barometric_pressure_kpa',
] as const satisfies readonly (keyof BarometricObservationColumns)[];

const BAROMETRIC_ALTITUDE_QUALITY_KEYS: ReadonlySet<keyof BarometricObservationColumns> = new Set([
  'barometric_accuracy_m',
  'barometric_precision_m',
]);

/**
 * The versioned raw sensor observation: a plain object with an integer `schema_version`, no
 * larger than `MAX_SENSOR_OBSERVATION_BYTES`. Anything else is dropped (never truncated).
 */
export function parseSensorObservation(value: unknown): SensorObservationJson | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const version = record.schema_version;
  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 1 ||
    version > MAX_SENSOR_OBSERVATION_SCHEMA_VERSION
  ) {
    return null;
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(record);
  } catch {
    return null;
  }
  if (new TextEncoder().encode(serialized).length > MAX_SENSOR_OBSERVATION_BYTES) return null;
  return JSON.parse(serialized) as SensorObservationJson;
}

/**
 * Columns for one reporting user's encounter row. Location quality is attached only when the
 * row carries that same device's coordinate; barometer accuracy/precision only with its altitude. The
 * raw sensor observation always belongs to the reporting device and travels with its row.
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
  // Pressure and the relative-altitude change are their own readings and are kept even when the
  // altimeter had no absolute fix yet; accuracy and precision describe that absolute altitude.
  for (const key of BAROMETRIC_OBSERVATION_KEYS) {
    if (observation[key] === undefined) continue;
    if (!opts.hasBarometricAltitude && BAROMETRIC_ALTITUDE_QUALITY_KEYS.has(key)) continue;
    (out as Record<string, unknown>)[key] = observation[key];
  }
  if (observation.sensor_observation !== undefined) out.sensor_observation = observation.sensor_observation;
  return out;
}

/** Parses every part from one request body (or one stored sensor payload). */
export function parseEncounterObservation(
  source: Record<string, unknown>,
  nowMs: number = Date.now(),
): EncounterObservationColumns {
  const sensorObservation = parseSensorObservation(source.sensor_observation);
  // The server's receipt time beside the phone's `clock.sent_at` measures that phone's clock skew,
  // so both sides of an encounter can be aligned. Kept if already stamped (a stored payload).
  if (sensorObservation != null && sensorObservation.server_received_at === undefined) {
    sensorObservation.server_received_at = new Date(nowMs).toISOString();
  }
  return {
    ...parseLocationObservation(source, nowMs),
    ...parseBarometricObservation(source),
    ...(sensorObservation != null ? { sensor_observation: sensorObservation } : {}),
  };
}
