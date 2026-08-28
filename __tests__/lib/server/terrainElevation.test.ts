/**
 * @jest-environment node
 */

import {
  deriveHeightCategoryFromRelativeAltitudeM,
  fetchTerrainElevationMeters,
} from '@/lib/server/terrainElevation';

describe('deriveHeightCategoryFromRelativeAltitudeM', () => {
  it('classifies AGL from AMSL − terrain (not raw AMSL)', () => {
    // AMSL 40 m, terrain 38 m → 2 m AGL → ground level (not high rise)
    expect(deriveHeightCategoryFromRelativeAltitudeM(40 - 38)).toBe('GROUND_LEVEL');
    // AMSL 5 m, terrain 10 m → −5 m AGL → below ground
    expect(deriveHeightCategoryFromRelativeAltitudeM(5 - 10)).toBe('BELOW_GROUND');
  });

  it('applies AGL thresholds', () => {
    expect(deriveHeightCategoryFromRelativeAltitudeM(-3.1)).toBe('BELOW_GROUND');
    expect(deriveHeightCategoryFromRelativeAltitudeM(-3.0)).toBe('GROUND_LEVEL');
    expect(deriveHeightCategoryFromRelativeAltitudeM(7.9)).toBe('GROUND_LEVEL');
    expect(deriveHeightCategoryFromRelativeAltitudeM(8.0)).toBe('ELEVATED');
    expect(deriveHeightCategoryFromRelativeAltitudeM(34.9)).toBe('ELEVATED');
    expect(deriveHeightCategoryFromRelativeAltitudeM(35.0)).toBe('HIGH_RISE');
    expect(deriveHeightCategoryFromRelativeAltitudeM(40)).toBe('HIGH_RISE');
  });

  it('returns null for invalid input', () => {
    expect(deriveHeightCategoryFromRelativeAltitudeM(null)).toBeNull();
    expect(deriveHeightCategoryFromRelativeAltitudeM(undefined)).toBeNull();
    expect(deriveHeightCategoryFromRelativeAltitudeM(Number.NaN)).toBeNull();
  });
});

describe('fetchTerrainElevationMeters', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('reads DEM AMSL from Open-Meteo forecast elevation', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain('api.open-meteo.com/v1/forecast');
      expect(url).not.toContain('open-elevation.com');
      return {
        ok: true,
        json: async () => ({ elevation: 38.2, current: { temperature_2m: 12 } }),
      } as Response;
    }) as typeof fetch;
    await expect(fetchTerrainElevationMeters(47.6, -122.3)).resolves.toBe(38.2);
  });
});
