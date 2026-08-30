import {
  parseConnectionLatLng,
  privacyJitterPoint,
  toPresenceCells,
  PRESENCE_JITTER_MAX_M,
  PRESENCE_JITTER_MIN_M,
} from '@/lib/landing/presenceHeatmap';

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(s)));
}

describe('presenceHeatmap', () => {
  it('reads lat/lon and latitude/longitude aliases and drops null island', () => {
    expect(parseConnectionLatLng({ lat: 47.655, lon: -122.308 })).toEqual({
      lat: 47.655,
      lng: -122.308,
    });
    expect(parseConnectionLatLng({ latitude: 47.61, longitude: -122.34 })).toEqual({
      lat: 47.61,
      lng: -122.34,
    });
    expect(parseConnectionLatLng({ lat: 0, lon: 0 })).toBeNull();
    expect(parseConnectionLatLng(null)).toBeNull();
  });

  it('offsets a handshake by about a block, deterministically', () => {
    const origin = { lat: 47.6553, lng: -122.308 };
    const once = privacyJitterPoint(origin.lat, origin.lng);
    const twice = privacyJitterPoint(origin.lat, origin.lng);
    expect(once).toEqual(twice);
    expect(once.lat).not.toBe(origin.lat);
    expect(once.lng).not.toBe(origin.lng);
    const meters = haversineMeters({ lat: origin.lat, lng: origin.lng }, { lat: once.lat, lng: once.lng });
    expect(meters).toBeGreaterThan(PRESENCE_JITTER_MIN_M - 15);
    expect(meters).toBeLessThan(PRESENCE_JITTER_MAX_M + 15);
  });

  it('keeps one glow per handshake instead of snapping to a synthetic grid', () => {
    const cells = toPresenceCells([
      { lat: 47.6553, lng: -122.308 },
      { lat: 47.668, lng: -122.3 },
      { lat: 47.61, lng: -122.2 },
    ]);
    expect(cells).toHaveLength(3);
    const lats = new Set(cells.map((cell) => cell.lat));
    expect(lats.size).toBe(3);
  });
});
