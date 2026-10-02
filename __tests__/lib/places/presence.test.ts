import { DEFAULT_PLACES_CONFIG } from '@/lib/places/config';
import { resolvePresence } from '@/lib/places/presence';

describe('resolvePresence', () => {
  const nowMs = Date.parse('2026-10-01T20:00:00Z');
  const config = DEFAULT_PLACES_CONFIG;
  const checkIn = (proof: 'gps' | 'qr', weight: number, expiresInMin = 60) => ({
    id: 'ci-1',
    proof,
    proof_weight: weight,
    expires_at: new Date(nowMs + expiresInMin * 60_000).toISOString(),
    checked_out_at: null,
  });

  it('is not present with no sources', () => {
    expect(resolvePresence({ nowMs, config })).toEqual({ present: false });
  });

  it('ignores an expired check-in', () => {
    expect(resolvePresence({ openCheckIn: checkIn('gps', 0.8, -1), nowMs, config })).toEqual({ present: false });
  });

  it('picks the strongest source', () => {
    expect(
      resolvePresence({ openCheckIn: checkIn('gps', 0.8), eventCheckIn: { beacon_id: 'b1', is_live: true }, nowMs, config }),
    ).toEqual({ present: true, proof: 'event', weight: 0.9, beaconId: 'b1' });
    expect(
      resolvePresence({
        openCheckIn: checkIn('gps', 0.6),
        recentEncounter: { encountered_at: new Date(nowMs - 30 * 60_000).toISOString() },
        nowMs,
        config,
      }),
    ).toEqual({ present: true, proof: 'encounter', weight: 1 });
  });

  it('prefers the Place check-in on a tie', () => {
    expect(
      resolvePresence({
        openCheckIn: checkIn('qr', 1),
        recentEncounter: { encountered_at: new Date(nowMs - 5 * 60_000).toISOString() },
        nowMs,
        config,
      }),
    ).toEqual({ present: true, proof: 'qr', weight: 1, checkInId: 'ci-1' });
  });

  it('ignores an old encounter and a non-live event', () => {
    expect(
      resolvePresence({
        eventCheckIn: { beacon_id: 'b1', is_live: false },
        recentEncounter: { encountered_at: new Date(nowMs - 181 * 60_000).toISOString() },
        nowMs,
        config,
      }),
    ).toEqual({ present: false });
  });
});
