/** @jest-environment node */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/cron/places/route';
import { runPlacesRollup } from '@/lib/server/places/rollupJob';
import type { SupabaseClient } from '@supabase/supabase-js';
import { FakeDb } from '../../../helpers/fakeSupabase';

const mockState: { db: FakeDb | null } = { db: null };
jest.mock('@/lib/server/admin/supabaseAdmin', () => ({ createAdminSupabaseClient: () => mockState.db!.client }));

const SECRET = 'cron-secret-test';

function world() {
  const now = Date.parse('2026-10-05T19:00:00Z');
  return {
    now,
    db: new FakeDb({
      tables: {
        places: [
          { id: 'p1', timezone: 'America/Los_Angeles', verification_status: 'verified' },
          { id: 'p-draft', timezone: 'America/Los_Angeles', verification_status: 'draft' },
        ],
        place_check_ins: [
          // 2026-10-04 09:00 PDT, eligible.
          { place_id: 'p1', user_id: 'u1', checked_at: '2026-10-04T16:00:00Z', checked_out_at: '2026-10-04T16:45:00Z', checkout_reason: 'user', count_for_insights: true },
          // Opted out: never counted.
          { place_id: 'p1', user_id: 'u2', checked_at: '2026-10-04T16:10:00Z', checked_out_at: null, checkout_reason: null, count_for_insights: false },
        ],
        place_pulses: [{ place_id: 'p1', energy: 3, talkable: 1, would_return: null, created_at: '2026-10-04T16:20:00Z', count_for_insights: true }],
        map_beacons: [],
        connection_encounters: [],
        connections: [],
        place_daily_stats: [],
      },
      rpc: { purge_place_presence: () => ({ closed: 0, check_ins_deleted: 0, pulses_anonymized: 0, pulses_deleted: 0 }) },
    }),
  };
}

describe('GET /api/cron/places', () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    mockState.db = world().db;
  });
  afterAll(() => {
    process.env.CRON_SECRET = original;
  });

  it('returns 401 without the cron secret', async () => {
    const res = await GET(new NextRequest('http://localhost/api/cron/places'));
    expect(res.status).toBe(401);
    const wrong = await GET(new NextRequest('http://localhost/api/cron/places', { headers: { authorization: 'Bearer nope' } }));
    expect(wrong.status).toBe(401);
    expect(mockState.db!.log).toHaveLength(0);
  });

  it('runs the rollup and the retention purge', async () => {
    const res = await GET(new NextRequest('http://localhost/api/cron/places', { headers: { authorization: `Bearer ${SECRET}` } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, rollup: { places: 1, days: 3 }, purge: { closed: 0 } });
    expect(mockState.db!.log).toEqual(
      expect.arrayContaining([
        { table: 'rpc:purge_place_presence', op: 'rpc', payload: { p_check_in_days: 90, p_pulse_identity_days: 30, p_pulse_days: 400 } },
      ]),
    );
  });
});

describe('runPlacesRollup', () => {
  it('upserts the last three local days for verified Places, insights-eligible rows only', async () => {
    const { db, now } = world();
    const result = await runPlacesRollup(db.client as unknown as SupabaseClient, now);
    expect(result).toEqual({ places: 1, days: 3, errors: [] });
    const rows = db.rows('place_daily_stats');
    expect(rows.map((r) => r.day).sort()).toEqual(['2026-10-02', '2026-10-03', '2026-10-04']);
    const oct4 = rows.find((r) => r.day === '2026-10-04')!;
    expect(oct4).toMatchObject({ place_id: 'p1', check_ins: 1, unique_visitors: 1, dwell_samples: 1, dwell_minutes_sum: 45, pulses: 1 });
    expect(Object.keys(oct4)).not.toContain('user_id');

    // Idempotent: a second run rewrites the same three rows.
    await runPlacesRollup(db.client as unknown as SupabaseClient, now);
    expect(db.rows('place_daily_stats')).toHaveLength(3);
  });
});
