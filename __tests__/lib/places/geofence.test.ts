import { DEFAULT_PLACES_CONFIG } from '@/lib/places/config';
import { accuracyBucket, distanceBucket, evaluateGpsProof, evaluateQrProof } from '@/lib/places/geofence';

const place = { id: 'place-1', latitude: 47.6588, longitude: -122.3131, radius_meters: 75 };
const config = DEFAULT_PLACES_CONFIG;
// ~0.000009° latitude ≈ 1 m.
const north = (m: number) => place.latitude + m / 111_195;
const anchor = { id: 'anchor-1', venue_id: 'place-1', purpose: 'check_in', active: true };

describe('buckets', () => {
  it('buckets distance', () => {
    expect([0, 24.9, 25, 74, 75, 149, 150, 399, 400].map(distanceBucket)).toEqual([
      '0_25', '0_25', '25_75', '25_75', '75_150', '75_150', '150_400', '150_400', '400_plus',
    ]);
  });

  it('buckets accuracy', () => {
    expect([null, 5, 20, 49, 50, 99, 100, 500].map(accuracyBucket)).toEqual([
      '100_plus', '0_20', '20_50', '20_50', '50_100', '50_100', '100_plus', '100_plus',
    ]);
  });
});

describe('evaluateGpsProof', () => {
  it('accepts inside the radius with a precise fix', () => {
    expect(evaluateGpsProof({ place, lat: north(30), lng: place.longitude, accuracy: 18, config })).toEqual({
      ok: true,
      proof: 'gps',
      weight: 0.8,
      distance_bucket: '25_75',
      accuracy_bucket: '0_20',
      anchor_id: null,
    });
  });

  it('gives a lower weight to a coarse fix', () => {
    const r = evaluateGpsProof({ place, lat: north(10), lng: place.longitude, accuracy: 80, config });
    expect(r).toMatchObject({ ok: true, weight: 0.6, accuracy_bucket: '50_100' });
  });

  it('allows the radius plus up to 50 m of accuracy', () => {
    expect(evaluateGpsProof({ place, lat: north(120), lng: place.longitude, accuracy: 60, config }).ok).toBe(true);
    expect(evaluateGpsProof({ place, lat: north(130), lng: place.longitude, accuracy: 60, config })).toMatchObject({
      ok: false,
      reason: 'out_of_bounds',
    });
  });

  it('rejects far away with the distance', () => {
    const r = evaluateGpsProof({ place, lat: north(300), lng: place.longitude, accuracy: 10, config });
    expect(r).toEqual({ ok: false, reason: 'out_of_bounds', distance_meters: 300 });
  });

  it('rejects missing or invalid coordinates', () => {
    expect(evaluateGpsProof({ place, lat: null, lng: null, accuracy: 5, config })).toEqual({ ok: false, reason: 'no_location' });
    expect(evaluateGpsProof({ place, lat: 0, lng: 0, accuracy: 5, config })).toEqual({ ok: false, reason: 'no_location' });
  });

  it('rejects low accuracy', () => {
    expect(evaluateGpsProof({ place, lat: north(5), lng: place.longitude, accuracy: 150, config })).toEqual({
      ok: false,
      reason: 'low_accuracy',
    });
    expect(evaluateGpsProof({ place, lat: north(5), lng: place.longitude, accuracy: null, config })).toEqual({
      ok: false,
      reason: 'low_accuracy',
    });
  });
});

describe('evaluateQrProof', () => {
  it('accepts a valid anchor with nearby GPS at full weight', () => {
    expect(evaluateQrProof({ place, anchor, lat: north(150), lng: place.longitude, accuracy: 20, config })).toMatchObject({
      ok: true,
      proof: 'qr',
      weight: 1,
      anchor_id: 'anchor-1',
    });
  });

  it('accepts a valid anchor without location at reduced weight', () => {
    expect(evaluateQrProof({ place, anchor, config })).toEqual({
      ok: true,
      proof: 'qr',
      weight: 0.6,
      distance_bucket: null,
      accuracy_bucket: null,
      anchor_id: 'anchor-1',
    });
  });

  it('rejects a photographed code used far away', () => {
    // 75 m × 3 + min(20, 100) = 245 m.
    expect(evaluateQrProof({ place, anchor, lat: north(1000), lng: place.longitude, accuracy: 20, config })).toMatchObject({
      ok: false,
      reason: 'out_of_bounds',
    });
  });

  it.each([
    ['missing', null],
    ['another Place', { ...anchor, venue_id: 'place-2' }],
    ['a floorplan anchor', { ...anchor, purpose: 'floorplan' }],
    ['inactive', { ...anchor, active: false }],
  ])('rejects an anchor that is %s', (_, a) => {
    expect(evaluateQrProof({ place, anchor: a, config })).toEqual({ ok: false, reason: 'invalid_anchor' });
  });
});
