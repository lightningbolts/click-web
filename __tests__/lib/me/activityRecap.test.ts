import { recapWindowStart } from '@/lib/me/activityRecap';

describe('recapWindowStart', () => {
  const now = Date.parse('2026-08-13T12:00:00.000Z');

  it('uses 24h for day and 7d for week', () => {
    expect(now - recapWindowStart('day', now)).toBe(24 * 60 * 60 * 1000);
    expect(now - recapWindowStart('week', now)).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
