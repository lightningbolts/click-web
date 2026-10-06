/**
 * @jest-environment node
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyAltitudeFollowUp,
  validateAltitudeFollowUp,
  type AltitudeFollowUpInput,
} from '@/lib/server/encounterAltitudeFollowUp';

const NOW = Date.parse('2026-10-05T15:30:00.000Z');
const MOMENT = '2026-10-05T15:29:43.325Z';
const CONN = '105eaba1-cbab-4aca-971c-8c07622757d8';

const input = (overrides: Partial<AltitudeFollowUpInput> = {}): AltitudeFollowUpInput => ({
  connectionIds: [CONN],
  connectionMoment: MOMENT,
  observedAt: '2026-10-05T15:29:47.900Z',
  altitudeM: 26.4,
  accuracyM: 3.2,
  precisionM: 0.5,
  ...overrides,
});

type Row = Record<string, unknown>;

function fakeAdmin(rows: Row[]) {
  const lookups: Record<string, unknown>[] = [];
  const updates: { id: unknown; values: Row; guard: [string, unknown] | null }[] = [];
  const admin = {
    from: () => ({
      select: () => {
        const filters: Record<string, unknown> = {};
        const chain = {
          in: (column: string, values: unknown) => ((filters[column] = values), chain),
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
          is: async (column: string, value: unknown) => {
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
  gps_lat: 47.66,
  gps_lon: -122.3,
  terrain_elevation_m: 17,
  exact_barometric_elevation_m: null,
  sensor_observation: { schema_version: 3, connection_moment: MOMENT, barometer: { pressure_kpa: 101.788 } },
  ...overrides,
});

describe('validateAltitudeFollowUp', () => {
  it('accepts a fix a few seconds after a recent moment', () => {
    expect(validateAltitudeFollowUp(input(), NOW)).toBeNull();
  });

  it('rejects stale moments, late fixes and implausible values', () => {
    expect(validateAltitudeFollowUp(input({ connectionMoment: '2026-10-05T15:00:00.000Z', observedAt: '2026-10-05T15:00:05.000Z' }), NOW)).not.toBeNull();
    expect(validateAltitudeFollowUp(input({ observedAt: '2026-10-05T15:31:00.000Z' }), NOW)).not.toBeNull();
    expect(validateAltitudeFollowUp(input({ altitudeM: 20_000 }), NOW)).not.toBeNull();
    expect(validateAltitudeFollowUp(input({ accuracyM: -1 }), NOW)).not.toBeNull();
    expect(validateAltitudeFollowUp(input({ observedAt: 'soon' }), NOW)).not.toBeNull();
  });
});

describe('applyAltitudeFollowUp', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fills only the caller's row for that exact moment and derives height", async () => {
    const { admin, lookups, updates } = fakeAdmin([
      row(),
      row({ id: 'other-moment', sensor_observation: { connection_moment: '2026-10-05T15:20:00.000Z' } }),
      row({ id: 'already-set', exact_barometric_elevation_m: 30 }),
      row({ id: 'no-observation', sensor_observation: null }),
    ]);
    global.fetch = jest.fn() as typeof fetch;

    await expect(applyAltitudeFollowUp(admin, 'user-1', input(), NOW)).resolves.toEqual({ ok: true, updated: 1 });

    expect(lookups[0]).toMatchObject({ reporting_user_id: 'user-1' });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('enc-1');
    expect(updates[0].guard).toEqual(['exact_barometric_elevation_m', null]);
    expect(updates[0].values).toMatchObject({
      exact_barometric_elevation_m: 26.4,
      barometric_accuracy_m: 3.2,
      barometric_precision_m: 0.5,
      terrain_elevation_m: 17,
      elevation_category: 'ELEVATED',
    });
    expect(updates[0].values.relative_altitude_m).toBeCloseTo(9.4);
    expect(updates[0].values.sensor_observation).toEqual({
      schema_version: 3,
      connection_moment: MOMENT,
      barometer: {
        pressure_kpa: 101.788,
        follow_up: { t_ms: 4575, received_t_ms: 16675, absolute_altitude_m: 26.4, absolute_accuracy_m: 3.2 },
      },
    });
  });

  it('looks up the DEM once when the rows have none', async () => {
    const { admin, updates } = fakeAdmin([row({ terrain_elevation_m: null }), row({ id: 'enc-2', terrain_elevation_m: null })]);
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ elevation: 20, current: {} }) }) as Response) as typeof fetch;

    await expect(applyAltitudeFollowUp(admin, 'user-1', input(), NOW)).resolves.toEqual({ ok: true, updated: 2 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(updates.map((u) => u.values.terrain_elevation_m)).toEqual([20, 20]);
  });

  it("fills a group tap's pairwise rows too, but only for a moment of a named connection", async () => {
    const pair = row({ id: 'pair', connection_id: 'b054368e-8df5-42e9-b40e-c8e6d35b9610' });
    const filled = fakeAdmin([row(), pair]);
    await expect(applyAltitudeFollowUp(filled.admin, 'user-1', input(), NOW)).resolves.toEqual({ ok: true, updated: 2 });
    expect(filled.updates.map((u) => u.id)).toEqual(['enc-1', 'pair']);

    const unnamed = fakeAdmin([pair]);
    await expect(applyAltitudeFollowUp(unnamed.admin, 'user-1', input(), NOW)).resolves.toEqual({ ok: true, updated: 0 });
    expect(unnamed.updates).toHaveLength(0);
  });

  it('writes nothing for an invalid request or no matching row', async () => {
    const { admin, updates } = fakeAdmin([row({ sensor_observation: { connection_moment: '2026-10-05T15:29:43.330Z' } })]);
    await expect(applyAltitudeFollowUp(admin, 'user-1', input(), NOW)).resolves.toEqual({ ok: true, updated: 0 });
    await expect(applyAltitudeFollowUp(admin, 'user-1', input({ altitudeM: Number.NaN }), NOW)).resolves.toMatchObject({ ok: false });
    expect(updates).toHaveLength(0);
  });
});
