/**
 * @jest-environment node
 */
import { distanceMeters, isValidCoordinate, serializeHangout, type HangoutRow } from '@/lib/hangouts/hangouts';

describe('hangout helpers', () => {
  it('measures short distances accurately', () => {
    const a = { lat: 47.6097, lon: -122.3331 };
    const b = { lat: 47.6106, lon: -122.3331 }; // ~100 m north
    expect(distanceMeters(a, b)).toBeGreaterThan(95);
    expect(distanceMeters(a, b)).toBeLessThan(105);
  });

  it('rejects missing, out-of-range and null-island coordinates', () => {
    expect(isValidCoordinate(47.6, -122.3)).toBe(true);
    expect(isValidCoordinate(0, 0)).toBe(false);
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate('47', -122)).toBe(false);
  });

  it('serializes from the viewer side', () => {
    const row: HangoutRow = {
      id: 'h1', connection_id: 'c1', user_ids: ['me', 'maya'], confirmed_user_ids: ['maya'], source: 'manual',
      requested_by: 'maya', occurred_at: '2026-09-25T19:00:00Z', gps_lat: null, gps_lon: null,
      location_name: 'Café Allegro', status: 'pending', encounter_id: null, expires_at: '2026-09-27T19:00:00Z',
    };
    expect(serializeHangout(row, 'me')).toMatchObject({ peer_user_id: 'maya', confirmed_by_me: false, requested_by_me: false });
    expect(serializeHangout(row, 'maya')).toMatchObject({ peer_user_id: 'me', confirmed_by_me: true, requested_by_me: true });
  });
});
