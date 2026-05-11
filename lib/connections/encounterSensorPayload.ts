/**
 * Maps client `sensor_data` into `connection_encounters` insert columns.
 * Unknown keys are folded into `vibe_capture` so the parent `connections` row stays untouched.
 */

const ENCOUNTER_COLUMN_KEYS = new Set<string>([
  'lux_level',
  'motion_variance',
  'compass_azimuth',
  'battery_level',
  'exact_noise_level_db',
  'exact_barometric_elevation_m',
  'relative_altitude_m',
  'gps_lat',
  'gps_lon',
  'weather_snapshot',
  'noise_level',
  'semantic_location',
  'display_location',
  'location_name',
  'context_tags',
  'elevation_category',
]);

export type EncounterSensorInsert = Record<string, unknown>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function buildEncounterInsertFromSensor(
  connectionId: string,
  sensorData: unknown,
): EncounterSensorInsert {
  const row: EncounterSensorInsert = {
    connection_id: connectionId,
    encountered_at: new Date().toISOString(),
    context_tags: [] as string[],
  };

  const extras: Record<string, unknown> = {};

  if (!isPlainObject(sensorData)) {
    return row;
  }

  for (const [key, value] of Object.entries(sensorData)) {
    if (ENCOUNTER_COLUMN_KEYS.has(key)) {
      row[key] = value;
      continue;
    }
    extras[key] = value;
  }

  if (Object.keys(extras).length > 0) {
    row.vibe_capture = extras;
  }

  return row;
}
