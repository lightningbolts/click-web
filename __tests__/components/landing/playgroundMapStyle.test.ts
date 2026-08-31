import { MAP_STYLE_DARK, MAP_STYLE_LIGHT } from '@/lib/theme/mapStyles';
import {
  applyPlaygroundMapTheme,
  isCartoBasemapStyle,
  playgroundMapStyle,
  playgroundTransformRequest,
} from '@/components/landing/playground/playgroundMapStyle';

describe('playgroundMapStyle', () => {
  it('uses Carto Positron / Dark Matter (browser CDN, not Click APIs)', () => {
    expect(playgroundMapStyle('light')).toBe(MAP_STYLE_LIGHT);
    expect(playgroundMapStyle('dark')).toBe(MAP_STYLE_DARK);
    expect(isCartoBasemapStyle(playgroundMapStyle('light'))).toBe(true);
    expect(playgroundMapStyle('light')).toContain('basemaps.cartocdn.com');
    expect(playgroundMapStyle('dark')).not.toMatch(/joinclick|\/api\//);
  });

  it('swaps style in place and restores the camera', () => {
    const jumpTo = jest.fn();
    const setStyle = jest.fn();
    const once = jest.fn((event: string, cb: () => void) => {
      if (event === 'style.load') cb();
    });
    applyPlaygroundMapTheme(
      {
        getCenter: () => ({ lng: -122.3085, lat: 47.6554 }),
        getZoom: () => 14.2,
        setStyle,
        once,
        jumpTo,
      },
      'dark',
    );

    expect(setStyle).toHaveBeenCalledWith(MAP_STYLE_DARK, { diff: true });
    expect(jumpTo).toHaveBeenCalledWith({
      center: { lng: -122.3085, lat: 47.6554 },
      zoom: 14.2,
    });
  });

  it('blocks same-origin tile requests so they never hit the Worker', () => {
    const origin = window.location.origin;
    expect(playgroundTransformRequest(`${origin}/api/map/beacons`).url).toBe('about:blank');
    expect(playgroundTransformRequest(MAP_STYLE_LIGHT).url).toBe(MAP_STYLE_LIGHT);
  });
});
