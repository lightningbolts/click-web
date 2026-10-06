/**
 * @jest-environment node
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyLocationFollowUp,
  metersBetween,
  validateLocationFollowUp,
  type LocationFollowUpInput,
} from '@/lib/server/encounterLocationFollowUp';

const NOW = Date.parse('2026-10-06T00:43:40.000Z');
const MOMENT = '2026-10-06T00:43:08.831Z';
const CONN = '7a482d2d-6a4b-4e96-b855-7d2ce8642342';
const LAT = 47.65290309882816;
const LON = -122.30412939494381;

const input = (overrides: Partial<LocationFollowUpInput> = {}): LocationFollowUpInput => ({
  connectionIds: [CONN],
  connectionMoment: MOMENT,
  observedAt: '2026-10-06T00:43:21.000Z',
  lat: LAT + 2 / 111_320,
  lon: LON,
  accuracyM: 4.8,
  ...overrides,
});

type Row = Record<string, unknown>;

function fakeAdmin(rows: Row[]) {
  const lookups: Record<string, unknown>[] = [];
  const updates: { id: unknown; values: Row; guard: [string, unknown] }[] = [];
  const admin = {
    from: () => ({
      select: () => {
        const filters: Record<string, unknown> = {};
        const chain = {
          eq: (column: string, value: unknown) => ((filters[column] = value), chain),
          gte: (column: string, value: unknown) => {
            filters[column] = value;
            lookups.push(filters);
            return Promise.resolve({ data: rows, error: null });
          },
        };
        return chain;
      },
      update: (values: Row) => ({
        eq: (_column: string, id: unknown) => ({
          gt: async (column: string, value: unknown) => {
            updates.push({ id, values, guard: [column, value] });
            return { error: null };
          },
        }),
      }),
    }),
  };
  return { admin: admin as unknown as SupabaseClient, lookups, updates };
}

const row = (overrides: Row = {}): Row => ({
  id: 'enc-1',
  connection_id: CONN,
  gps_lat: LAT,
  gps_lon: LON,
  gps_horizontal_accuracy_m: 12.69,
  sensor_observation: { schema_version: 3, connection_moment: MOMENT, location: { horizontal_accuracy_m: 12.69 } },
  ...overrides,
});

describe('validateLocationFollowUp', () => {
  it('accepts a tighter fix seconds after a recent moment', () => {
    expect(validateLocationFollowUp(input(), NOW)).toBeNull();
  });

  it('rejects late fixes, null island and implausible accuracy', () => {
    expect(validateLocationFollowUp(input({ observedAt: '2026-10-06T00:45:00.000Z' }), NOW)).not.toBeNull();
    expect(validateLocationFollowUp(input({ lat: 0, lon: 0 }), NOW)).not.toBeNull();
    expect(validateLocationFollowUp(input({ lat: 91 }), NOW)).not.toBeNull();
    expect(validateLocationFollowUp(input({ accuracyM: 0 }), NOW)).not.toBeNull();
    expect(validateLocationFollowUp(input({ accuracyM: 80 }), NOW)).not.toBeNull();
  });
});

describe('applyLocationFollowUp', () => {
  it("replaces the caller's fix for that moment, keeping the capture's in the observation", async () => {
    const { admin, lookups, updates } = fakeAdmin([
      row(),
      row({ id: 'other-moment', sensor_observation: { connection_moment: '2026-10-06T00:40:00.000Z' } }),
    ]);

    await expect(applyLocationFollowUp(admin, 'user-1', input(), NOW)).resolves.toEqual({ ok: true, updated: 1 });
    expect(lookups[0]).toMatchObject({ reporting_user_id: 'user-1' });
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('enc-1');
    expect(updates[0].guard).toEqual(['gps_horizontal_accuracy_m', 4.8]);
    expect(updates[0].values).toMatchObject({
      gps_lat: LAT + 2 / 111_320,
      gps_lon: LON,
      gps_horizontal_accuracy_m: 4.8,
      gps_observed_at: '2026-10-06T00:43:21.000Z',
      sensor_observation: {
        schema_version: 3,
        connection_moment: MOMENT,
        location: {
          horizontal_accuracy_m: 12.69,
          follow_up: { t_ms: 12169, received_t_ms: 31169, horizontal_accuracy_m: 4.8 },
        },
      },
    });
  });

  it('never makes a fix worse or moves it somewhere else', async () => {
    const { admin, updates } = fakeAdmin([
      row({ id: 'already-tight', gps_horizontal_accuracy_m: 4 }),
      row({ id: 'no-fix', gps_lat: null, gps_lon: null, gps_horizontal_accuracy_m: null }),
    ]);
    await expect(applyLocationFollowUp(admin, 'user-1', input(), NOW)).resolves.toEqual({ ok: true, updated: 0 });
    // 40 m away from a 12.69 m fix: the phone was carried off.
    await expect(
      applyLocationFollowUp(fakeAdmin([row()]).admin, 'user-1', input({ lat: LAT + 40 / 111_320 }), NOW),
    ).resolves.toEqual({ ok: true, updated: 0 });
    expect(updates).toHaveLength(0);
  });

  it('measures short ground distances', () => {
    expect(metersBetween(LAT, LON, LAT + 10 / 111_320, LON)).toBeCloseTo(10, 5);
  });
});
