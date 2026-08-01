/**
 * @jest-environment node
 */

import { deriveHeightCategoryFromRelativeAltitudeM } from '@/lib/server/terrainElevation';

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
