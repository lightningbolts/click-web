/**
 * @jest-environment node
 */

import { encounterMetricPills } from '@/lib/userProfile/profileDisplay';
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
