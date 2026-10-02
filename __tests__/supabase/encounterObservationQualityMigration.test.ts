import fs from 'node:fs';
import path from 'node:path';

describe('encounter observation quality migration', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261012000000_encounter_observation_quality.sql'),
    'utf8',
  );
  const added = [...sql.matchAll(/ADD COLUMN IF NOT EXISTS (\w+) ([^,;\n]+)/g)].map((m) => ({
    name: m[1]!,
    type: m[2]!.trim(),
  }));

  it('adds every per-device quality column', () => {
    expect(added.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'gps_horizontal_accuracy_m',
        'gps_vertical_accuracy_m',
        'gps_altitude_m',
        'gps_ellipsoidal_altitude_m',
        'gps_observed_at',
        'gps_floor',
        'gps_full_accuracy',
        'barometric_accuracy_m',
        'barometric_precision_m',
        'barometric_relative_altitude_m',
        'barometric_pressure_kpa',
        'terrain_elevation_m',
        'horizontal_accuracy_m',
        'location_observed_at',
      ]),
    );
  });

  it('keeps every new column nullable with no default so old clients keep working', () => {
    for (const column of added) {
      expect(column.type).not.toMatch(/NOT NULL|DEFAULT/i);
    }
  });

  it('is additive only', () => {
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE|RENAME)\b/i);
  });
});

describe('connection sensor observation migration', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261012010000_connection_sensor_observation.sql'),
    'utf8',
  );
  const added = [...sql.matchAll(/ADD COLUMN IF NOT EXISTS (\w+) ([^,;\n]+)/g)].map((m) => ({
    name: m[1]!,
    type: m[2]!.trim(),
  }));

  it('adds velocity, provenance, the raw observation and capture quality as nullable columns', () => {
    expect(added.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'gps_speed_mps',
        'gps_speed_accuracy_mps',
        'gps_course_deg',
        'gps_course_accuracy_deg',
        'gps_simulated',
        'gps_external_accessory',
        'sensor_observation',
        'capture_quality',
      ]),
    );
    for (const column of added) expect(column.type).not.toMatch(/NOT NULL|DEFAULT/i);
  });

  it('bounds the raw observation size and stays additive', () => {
    expect(sql).toContain('octet_length(sensor_observation::text) <= 65536');
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE|RENAME)\b/i);
  });
});
