/** @jest-environment node */

jest.mock('server-only', () => ({}));

import { returnMilestone, sanitizeProductProps } from '@/lib/server/telemetry/productEvents';

describe('product events', () => {
  it('keeps only allowlisted, short, scalar properties', () => {
    expect(sanitizeProductProps('drop_posted', { kind: 'event', user_id: 'abc', lat: 47.6 })).toEqual({ kind: 'event' });
    expect(sanitizeProductProps('beacon_created', { type: 'Hazard Zone!' })).toEqual({});
    expect(sanitizeProductProps('beacon_created', { type: 'hazard' })).toEqual({ type: 'hazard' });
    expect(sanitizeProductProps('install', { anything: 'x' })).toEqual({});
    expect(sanitizeProductProps('recap_opened', null)).toEqual({});
  });

  it('marks day-2 and day-7 returns from the install time', () => {
    const install = Date.parse('2026-10-01T09:00:00Z');
    const at = (hours: number) => install + hours * 3_600_000;
    expect(returnMilestone(install, at(5))).toBeNull();
    expect(returnMilestone(install, at(30))).toBe('day2_return');
    expect(returnMilestone(install, at(80))).toBeNull();
    expect(returnMilestone(install, at(6 * 24 + 2))).toBe('day7_return');
    expect(returnMilestone(install, at(9 * 24))).toBeNull();
  });
});
