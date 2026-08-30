import {
  foldMapCameraBounds,
  foldMapCameraPadding,
  FOLD_MAP_FIT_MAX_ZOOM,
} from '@/components/landing/fold-map/foldMapPins';

describe('foldMapCameraBounds', () => {
  it('returns null when there is no heatmap', () => {
    expect(foldMapCameraBounds([])).toBeNull();
  });

  it('uses every cell when the set is small', () => {
    expect(
      foldMapCameraBounds([
        { lat: 47.6, lng: -122.4, weight: 1 },
        { lat: 47.7, lng: -122.2, weight: 1 },
      ]),
    ).toEqual([
      [-122.4, 47.6],
      [-122.2, 47.7],
    ]);
  });

  it('trims extrema once the set is large enough to trim', () => {
    const cluster = (count: number) =>
      Array.from({ length: count - 1 }, (_, i) => ({
        lat: 47.6 + i * 0.002,
        lng: -122.33 + i * 0.002,
        weight: 1,
      })).concat({ lat: 20, lng: -150, weight: 1 });

    for (const count of [8, 9, 21]) {
      const bounds = foldMapCameraBounds(cluster(count));
      expect(bounds).not.toBeNull();
      expect(bounds![0][0]).toBeGreaterThan(-150);
      expect(bounds![0][1]).toBeGreaterThan(20);
    }
  });
});

describe('foldMapCameraPadding', () => {
  it('leaves room for the offer plate on desktop', () => {
    const padding = foldMapCameraPadding(1280, 800);
    expect(padding.left).toBeGreaterThan(padding.right);
    expect(padding.bottom).toBeGreaterThan(padding.top);
    expect(FOLD_MAP_FIT_MAX_ZOOM).toBe(12.4);
  });

  it('does not pad the left for the plate on a narrow phone', () => {
    const padding = foldMapCameraPadding(390, 720);
    expect(padding.left).toBe(16);
    expect(padding.right).toBe(16);
  });
});
