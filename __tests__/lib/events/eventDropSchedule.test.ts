/** @jest-environment node */

import {
  eventDropSchedule,
  isEventDropWindowOpen,
  orderRecap,
  selectAbsenteeDrops,
} from '@/lib/events/eventDropSchedule';

const iso = (s: string) => Date.parse(s);

describe('eventDropSchedule', () => {
  it('opens at start, closes at local midnight, reveals at 10:00 local the next day', () => {
    // Fri Oct 2, 7–10 PM in Seattle (PDT, UTC-7).
    const s = eventDropSchedule({
      startMs: iso('2026-10-03T02:00:00Z'),
      endMs: iso('2026-10-03T05:00:00Z'),
      timeZone: 'America/Los_Angeles',
    });
    expect(new Date(s.opensAtMs).toISOString()).toBe('2026-10-03T02:00:00.000Z');
    expect(new Date(s.closesAtMs).toISOString()).toBe('2026-10-03T07:00:00.000Z'); // Sat 00:00 PDT
    expect(new Date(s.revealAtMs).toISOString()).toBe('2026-10-03T17:00:00.000Z'); // Sat 10:00 PDT
  });

  it('keeps an event that ends after midnight open until the following midnight', () => {
    // Fri 9 PM → Sat 1 AM PDT.
    const s = eventDropSchedule({
      startMs: iso('2026-10-03T04:00:00Z'),
      endMs: iso('2026-10-03T08:00:00Z'),
      timeZone: 'America/Los_Angeles',
    });
    expect(new Date(s.closesAtMs).toISOString()).toBe('2026-10-04T07:00:00.000Z'); // Sun 00:00
    expect(new Date(s.revealAtMs).toISOString()).toBe('2026-10-04T17:00:00.000Z'); // Sun 10:00
    expect(s.closesAtMs).toBeLessThan(s.revealAtMs);
  });

  it('treats an end at exactly midnight as the day before', () => {
    const s = eventDropSchedule({
      startMs: iso('2026-10-03T03:00:00Z'),
      endMs: iso('2026-10-03T07:00:00Z'), // Sat 00:00 PDT
      timeZone: 'America/Los_Angeles',
    });
    expect(new Date(s.closesAtMs).toISOString()).toBe('2026-10-03T07:00:00.000Z');
    expect(new Date(s.revealAtMs).toISOString()).toBe('2026-10-03T17:00:00.000Z');
  });

  it('reveals at 10:00 local across the fall-back DST change', () => {
    // Sat Oct 31 → Sun Nov 1 2026: PDT ends at 2 AM Sunday.
    const s = eventDropSchedule({
      startMs: iso('2026-11-01T03:00:00Z'), // Sat 8 PM PDT
      endMs: iso('2026-11-01T06:00:00Z'), // Sat 11 PM PDT
      timeZone: 'America/Los_Angeles',
    });
    expect(new Date(s.closesAtMs).toISOString()).toBe('2026-11-01T07:00:00.000Z'); // Sun 00:00 PDT
    expect(new Date(s.revealAtMs).toISOString()).toBe('2026-11-01T18:00:00.000Z'); // Sun 10:00 PST
  });

  it('reveals at 10:00 local across the spring-forward DST change', () => {
    // Sat Mar 7 → Sun Mar 8 2026: PST → PDT at 2 AM Sunday.
    const s = eventDropSchedule({
      startMs: iso('2026-03-08T04:00:00Z'), // Sat 8 PM PST
      endMs: iso('2026-03-08T07:00:00Z'), // Sat 11 PM PST
      timeZone: 'America/Los_Angeles',
    });
    expect(new Date(s.revealAtMs).toISOString()).toBe('2026-03-08T17:00:00.000Z'); // Sun 10:00 PDT
  });

  it('falls back to UTC for unknown zones and honours the configured hour', () => {
    const s = eventDropSchedule({
      startMs: iso('2026-10-02T18:00:00Z'),
      endMs: iso('2026-10-02T20:00:00Z'),
      timeZone: 'Not/AZone',
      revealHourLocal: 9,
    });
    expect(new Date(s.revealAtMs).toISOString()).toBe('2026-10-03T09:00:00.000Z');
  });

  it('only accepts posts inside the window', () => {
    const s = { opensAtMs: 100, closesAtMs: 200, revealAtMs: 300 };
    expect(isEventDropWindowOpen(s, 99)).toBe(false);
    expect(isEventDropWindowOpen(s, 100)).toBe(true);
    expect(isEventDropWindowOpen(s, 199)).toBe(true);
    expect(isEventDropWindowOpen(s, 200)).toBe(false);
  });
});

describe('recap ordering and absentee selection', () => {
  const drop = (id: string, userId: string, createdAtMs: number, showToAbsentees = true) => ({
    id,
    userId,
    createdAtMs,
    showToAbsentees,
  });

  it("puts the viewer's drops first, then everyone's by time", () => {
    const drops = [drop('a', 'x', 3), drop('b', 'me', 5), drop('c', 'y', 1), drop('d', 'me', 2)];
    expect(orderRecap(drops, 'me').map((d) => d.id)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('takes posters round-robin, skips opted-out posters, and stops at the limit', () => {
    const drops = [
      drop('x1', 'x', 1), drop('x2', 'x', 2), drop('x3', 'x', 3), drop('x4', 'x', 4),
      drop('y1', 'y', 5), drop('z1', 'z', 6, false), drop('w1', 'w', 7), drop('w2', 'w', 8),
    ];
    const picked = selectAbsenteeDrops(drops, 5).map((d) => d.id);
    expect(picked).toHaveLength(5);
    expect(picked).not.toContain('z1');
    expect(picked).toEqual(expect.arrayContaining(['x1', 'y1', 'w1', 'x2', 'w2']));
  });
});
