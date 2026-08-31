/**
 * @jest-environment node
 */

import { encounterMetricPills, ageFromBirthday } from '@/lib/userProfile/profileDisplay';
import type { ConnectionEncounterRow } from '@/lib/dashboard/connectionEncounters';

function enc(partial: Partial<ConnectionEncounterRow>): ConnectionEncounterRow {
  return {
    id: 'e1',
    encounteredAt: '2026-08-18T12:00:00Z',
    weatherSnapshot: null,
    contextTags: [],
    ...partial,
  };
}

describe('encounterMetricPills elevation', () => {
  it('shows meters only when relativeAltitudeM (AGL) is present', () => {
    const pills = encounterMetricPills(
      enc({ elevationCategory: 'GROUND_LEVEL', relativeAltitudeM: 2.4, exactBarometricElevationM: 34 }),
    );
    const labels = pills.filter((p) => p.metricKey === 'el' || p.metricKey === 'el-cat').map((p) => p.label);
    expect(labels).toContain('Ground level');
    expect(labels).toContain('2 m');
  });

  it('omits AMSL barometer meters next to Ground level', () => {
    const pills = encounterMetricPills(
      enc({ elevationCategory: 'GROUND_LEVEL', exactBarometricElevationM: 34 }),
    );
    expect(pills.some((p) => p.metricKey === 'el')).toBe(false);
    expect(pills.some((p) => p.metricKey === 'el-cat' && p.label === 'Ground level')).toBe(true);
  });
});

describe('ageFromBirthday', () => {
  const today = new Date('2026-08-28T12:00:00Z');

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(today);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('returns age for a valid birthday within display bounds', () => {
    expect(ageFromBirthday('2000-01-15')).toBe(26);
  });

  it('rejects malformed, future, and implausible birthdays', () => {
    expect(ageFromBirthday('')).toBeNull();
    expect(ageFromBirthday('not-a-date')).toBeNull();
    expect(ageFromBirthday('2026-09-01')).toBeNull();
    expect(ageFromBirthday('2015-01-01')).toBeNull();
    expect(ageFromBirthday('1900-01-01')).toBeNull();
    expect(ageFromBirthday('2024-02-30')).toBeNull();
  });

  it('enforces minimum age 13 and maximum age 100', () => {
    expect(ageFromBirthday('2013-08-28')).toBe(13);
    expect(ageFromBirthday('2013-08-29')).toBeNull();
    expect(ageFromBirthday('1926-08-28')).toBe(100);
    expect(ageFromBirthday('1925-08-28')).toBeNull();
  });
});
