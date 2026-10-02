import { addDaysToKey, zonedDayStartMs } from '@/lib/places/hours';
import { rollupPlaceDay } from '@/lib/places/rollup';

const TZ = 'America/Los_Angeles';

describe('zonedDayStartMs', () => {
  it('finds local midnight, including across DST', () => {
    expect(new Date(zonedDayStartMs(TZ, '2026-10-01')).toISOString()).toBe('2026-10-01T07:00:00.000Z');
    expect(new Date(zonedDayStartMs(TZ, '2026-11-02')).toISOString()).toBe('2026-11-02T08:00:00.000Z');
    expect(new Date(zonedDayStartMs('UTC', '2026-11-02')).toISOString()).toBe('2026-11-02T00:00:00.000Z');
  });

  it('adds days to a key', () => {
    expect(addDaysToKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('rollupPlaceDay', () => {
  const day = '2026-10-01';
  const base = { day, timezone: TZ, priorVisitorIds: [] as string[], pulses: [], eventWindows: [], encounters: [] };

  it('is all zeros for an empty day', () => {
    const r = rollupPlaceDay({ ...base, checkIns: [] });
    expect(r).toMatchObject({ check_ins: 0, unique_visitors: 0, repeat_visitors: 0, dwell_samples: 0, pulses: 0 });
    expect(r.check_ins_by_hour).toHaveLength(24);
    expect(r.energy_counts).toEqual([0, 0, 0, 0]);
  });

  it('counts check-ins, visitors, repeat visitors and local hours', () => {
    const r = rollupPlaceDay({
      ...base,
      priorVisitorIds: ['u1'],
      checkIns: [
        // 09:15 PDT
        { user_id: 'u1', checked_at: '2026-10-01T16:15:00Z', checked_out_at: '2026-10-01T17:05:00Z', checkout_reason: 'user' },
        // 09:40 PDT, expired (no dwell sample)
        { user_id: 'u2', checked_at: '2026-10-01T16:40:00Z', checked_out_at: '2026-10-01T19:40:00Z', checkout_reason: 'expired' },
        // 20:00 PDT, same user again, 10-hour stay capped at 480 min
        { user_id: 'u1', checked_at: '2026-10-02T03:00:00Z', checked_out_at: '2026-10-02T13:00:00Z', checkout_reason: 'user' },
      ],
    });
    expect(r.check_ins).toBe(3);
    expect(r.unique_visitors).toBe(2);
    expect(r.repeat_visitors).toBe(1);
    expect(r.check_ins_by_hour[9]).toBe(2);
    expect(r.check_ins_by_hour[20]).toBe(1);
    expect(r.dwell_samples).toBe(2);
    expect(r.dwell_minutes_sum).toBe(50 + 480);
  });

  it('counts Pulses, follow-ups and would-return answers', () => {
    const r = rollupPlaceDay({
      ...base,
      checkIns: [],
      pulses: [
        { energy: 3, talkable: 1, would_return: null },
        { energy: 4, talkable: 0, would_return: null },
        { energy: null, talkable: null, would_return: 1 },
        { energy: null, talkable: null, would_return: 0 },
      ],
    });
    expect(r).toMatchObject({ pulses: 2, talkable_yes: 1, talkable_no: 1, would_return_yes: 1, would_return_no: 1 });
    expect(r.energy_counts).toEqual([0, 0, 1, 1]);
  });

  it('counts check-ins during official events', () => {
    const r = rollupPlaceDay({
      ...base,
      eventWindows: [{ starts_at: '2026-10-02T02:00:00Z', ends_at: '2026-10-02T05:00:00Z' }],
      checkIns: [
        { user_id: 'a', checked_at: '2026-10-02T03:00:00Z', checked_out_at: null, checkout_reason: null },
        { user_id: 'b', checked_at: '2026-10-01T18:00:00Z', checked_out_at: null, checkout_reason: null },
      ],
    });
    expect(r.event_check_ins).toBe(1);
  });

  it('splits new and repeat connections by their first encounter anywhere', () => {
    const r = rollupPlaceDay({
      ...base,
      checkIns: [],
      encounters: [
        { connection_id: 'c-new', first_encountered_at: '2026-10-01T20:00:00Z' },
        { connection_id: 'c-new', first_encountered_at: '2026-10-01T20:00:00Z' },
        { connection_id: 'c-old', first_encountered_at: '2026-09-01T20:00:00Z' },
      ],
    });
    expect(r).toMatchObject({ new_connections: 1, repeat_connections: 1 });
  });
});
