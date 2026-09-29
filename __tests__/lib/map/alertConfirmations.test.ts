/** @jest-environment node */

import { DEFAULT_ALERT_CONFIG, decideAlertConfirmation, isAlertBeaconType } from '@/lib/map/alertConfirmations';

const NOW = Date.parse('2026-10-05T18:00:00Z');
const MIN = 60_000;
const base = {
  creatorId: 'creator',
  createdAtMs: NOW - 30 * MIN,
  expiresAtMs: NOW + 30 * MIN,
  voterId: 'alice',
  distanceMeters: 50,
  votes: [],
  nowMs: NOW,
  config: DEFAULT_ALERT_CONFIG,
};

describe('decideAlertConfirmation', () => {
  it('only treats hazard types as alerts', () => {
    expect(isAlertBeaconType('hazard')).toBe(true);
    expect(isAlertBeaconType('hazard_utility')).toBe(true);
    expect(isAlertBeaconType('study')).toBe(false);
    expect(isAlertBeaconType(undefined)).toBe(false);
  });

  it('rejects votes on an expired alert', () => {
    expect(decideAlertConfirmation({ ...base, status: 'still_here', expiresAtMs: NOW })).toEqual({
      outcome: 'rejected',
      reason: 'expired',
    });
  });

  it('requires a location and rejects out-of-range voters', () => {
    expect(decideAlertConfirmation({ ...base, status: 'still_here', distanceMeters: null })).toMatchObject({
      reason: 'location_required',
    });
    expect(decideAlertConfirmation({ ...base, status: 'cleared', distanceMeters: 301 })).toMatchObject({
      reason: 'out_of_range',
    });
    expect(decideAlertConfirmation({ ...base, status: 'still_here', distanceMeters: 300 }).outcome).toBe('extended');
  });

  it('lets the creator clear from anywhere, immediately', () => {
    expect(
      decideAlertConfirmation({ ...base, voterId: 'creator', status: 'cleared', distanceMeters: null }),
    ).toEqual({ outcome: 'cleared' });
  });

  it('extends to now + TTL on "still here", never shortening and never past the max lifetime', () => {
    expect(decideAlertConfirmation({ ...base, status: 'still_here' })).toEqual({
      outcome: 'extended',
      expiresAtMs: NOW + 120 * MIN,
    });
    // Already further out than now + TTL: unchanged.
    expect(decideAlertConfirmation({ ...base, status: 'still_here', expiresAtMs: NOW + 200 * MIN })).toEqual({
      outcome: 'extended',
      expiresAtMs: NOW + 200 * MIN,
    });
    // Near the 24 h ceiling: capped there.
    const old = { ...base, createdAtMs: NOW - 23.5 * 60 * MIN };
    expect(decideAlertConfirmation({ ...old, status: 'still_here' })).toEqual({
      outcome: 'extended',
      expiresAtMs: old.createdAtMs + 24 * 60 * MIN,
    });
  });

  it('allows one vote per person per window', () => {
    const votes = [{ userId: 'alice', status: 'still_here' as const, createdAtMs: NOW - 10 * MIN }];
    expect(decideAlertConfirmation({ ...base, status: 'cleared', votes })).toMatchObject({ reason: 'already_voted' });
    const stale = [{ userId: 'alice', status: 'still_here' as const, createdAtMs: NOW - 121 * MIN }];
    expect(decideAlertConfirmation({ ...base, status: 'cleared', votes: stale }).outcome).toBe('recorded');
  });

  it('clears at the threshold of distinct clearers since the last sighting', () => {
    const oneClear = [{ userId: 'bob', status: 'cleared' as const, createdAtMs: NOW - 5 * MIN }];
    expect(decideAlertConfirmation({ ...base, status: 'cleared', votes: [] }).outcome).toBe('recorded');
    expect(decideAlertConfirmation({ ...base, status: 'cleared', votes: oneClear })).toEqual({ outcome: 'cleared' });

    // A newer "still here" resets the count.
    const resighted = [...oneClear, { userId: 'carol', status: 'still_here' as const, createdAtMs: NOW - 2 * MIN }];
    expect(decideAlertConfirmation({ ...base, status: 'cleared', votes: resighted }).outcome).toBe('recorded');
  });

  it('honours tuned config', () => {
    const config = { ...DEFAULT_ALERT_CONFIG, clearedThreshold: 1, radiusMeters: 50 };
    expect(decideAlertConfirmation({ ...base, config, status: 'cleared' })).toEqual({ outcome: 'cleared' });
    expect(decideAlertConfirmation({ ...base, config, status: 'cleared', distanceMeters: 60 })).toMatchObject({
      reason: 'out_of_range',
    });
  });
});
