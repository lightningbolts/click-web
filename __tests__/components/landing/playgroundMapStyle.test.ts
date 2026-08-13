import {
  applyPlaygroundMapTheme,
  PLAYGROUND_MAP_PAINT,
  playgroundMapStyle,
  styleHasRemoteUrls,
} from '@/components/landing/playground/playgroundMapStyle';

describe('playgroundMapStyle', () => {
  it('is a local MapLibre style with no remote urls for light and dark', () => {
    const light = playgroundMapStyle('light');
    const dark = playgroundMapStyle('dark');

    expect(light.version).toBe(8);
    expect(dark.version).toBe(8);
    expect(styleHasRemoteUrls(light)).toBe(false);
    expect(styleHasRemoteUrls(dark)).toBe(false);
    expect(JSON.stringify(light)).not.toMatch(/https?:\/\//i);
    expect(JSON.stringify(dark)).not.toMatch(/cartocdn|mapbox|api\//i);
  });

  it('retints existing layers in place', () => {
    const setPaintProperty = jest.fn();
    const getLayer = jest.fn(() => true);
    applyPlaygroundMapTheme({ getLayer, setPaintProperty }, 'dark');

    expect(setPaintProperty).toHaveBeenCalledWith(
      'background',
      'background-color',
      PLAYGROUND_MAP_PAINT.dark.background,
    );
    expect(setPaintProperty).toHaveBeenCalledWith(
      'water',
      'fill-color',
      PLAYGROUND_MAP_PAINT.dark.water,
    );
  });
});
