/**
 * @jest-environment node
 */

import { enrichEncounterEnvironment } from '@/lib/server/connections/encounterEnrichment';

type Update = { values: Record<string, unknown>; id: unknown };

function fakeAdmin() {
  const updates: Update[] = [];
  const admin = {
    from: () => ({
      update: (values: Record<string, unknown>) => ({
        eq: async (_column: string, id: unknown) => {
          updates.push({ values, id });
          return { error: null };
        },
      }),
    }),
  };
  return { admin: admin as unknown as Parameters<typeof enrichEncounterEnvironment>[0], updates };
}

const forecast = {
  elevation: 31,
  current: {
    temperature_2m: 10.8,
    weather_code: 3,
    wind_speed_10m: 9.6,
    wind_direction_10m: 192.6,
    pressure_msl: 1015.4,
  },
};

describe('enrichEncounterEnvironment', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => forecast }) as Response) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('stores the full weather snapshot and the DEM elevation on the inserted row', async () => {
    const { admin, updates } = fakeAdmin();
    await enrichEncounterEnvironment(admin, 'enc-1', 47.66, -122.3, { includeWeather: true });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('enc-1');
    expect(updates[0].values.terrain_elevation_m).toBe(31);
    expect(updates[0].values.relative_altitude_m).toBeUndefined();
    expect(JSON.parse(String(updates[0].values.weather_snapshot))).toEqual({
      iconCode: 'cloudy',
      condition: 'Cloudy',
      windSpeedKph: 9.6,
      pressureMslHpa: 1015.4,
      temperatureCelsius: 10.8,
      windDirectionDegrees: 193,
    });
  });

  it('keeps the client weather and derives altitude from the barometer', async () => {
    const { admin, updates } = fakeAdmin();
    await enrichEncounterEnvironment(admin, 'enc-1', 47.66, -122.3, {
      includeWeather: false,
      barometricElevationM: 52,
      barometricAccuracyM: 3,
    });

    expect(updates[0].values).toEqual({
      relative_altitude_m: 21,
      terrain_elevation_m: 31,
      elevation_category: 'ELEVATED',
    });
  });

  it('skips the null island without a forecast request', async () => {
    const { admin, updates } = fakeAdmin();
    await enrichEncounterEnvironment(admin, 'enc-1', 0, 0, { includeWeather: true });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });
});
