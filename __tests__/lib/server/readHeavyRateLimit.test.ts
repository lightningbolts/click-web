/**
 * @jest-environment node
 */

import {
  isReadHeavyApiPath,
  shouldApplyReadHeavyRateLimit,
} from '@/lib/server/readHeavyRateLimit';

describe('readHeavyRateLimit', () => {
  it('matches beacon and map read prefixes', () => {
    expect(isReadHeavyApiPath('/api/beacons')).toBe(true);
    expect(isReadHeavyApiPath('/api/beacons/abc/rsvp')).toBe(true);
    expect(isReadHeavyApiPath('/api/map/beacons')).toBe(true);
    expect(isReadHeavyApiPath('/api/hub/nearby')).toBe(true);
    expect(isReadHeavyApiPath('/api/connections')).toBe(false);
  });

  it('applies rate limit only to GET/HEAD on read-heavy paths', () => {
    expect(shouldApplyReadHeavyRateLimit('/api/beacons/x/rsvp', 'GET')).toBe(true);
    expect(shouldApplyReadHeavyRateLimit('/api/beacons/x/rsvp', 'HEAD')).toBe(true);
    expect(shouldApplyReadHeavyRateLimit('/api/beacons/x/rsvp', 'POST')).toBe(false);
    expect(shouldApplyReadHeavyRateLimit('/api/beacons/x/rsvp', 'DELETE')).toBe(false);
    expect(shouldApplyReadHeavyRateLimit('/api/beacons/x/bookmark', 'PUT')).toBe(false);
    expect(shouldApplyReadHeavyRateLimit('/api/beacons/x/check-in', 'POST')).toBe(false);
    expect(shouldApplyReadHeavyRateLimit('/api/connections', 'GET')).toBe(false);
  });
});
