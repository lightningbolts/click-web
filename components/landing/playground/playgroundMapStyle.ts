import { dropSameOriginMapRequest } from '@/lib/map/dropSameOriginMapRequest';
import { MAP_STYLE_DARK, MAP_STYLE_LIGHT, mapStyleForTheme } from '@/lib/theme/mapStyles';

export const PLAYGROUND_MAP_CENTER: [number, number] = [-122.3085, 47.6554];
export const PLAYGROUND_MAP_ZOOM = 14.2;
export const PLAYGROUND_MAP_MIN_ZOOM = 11;
export const PLAYGROUND_MAP_MAX_ZOOM = 16;

/** Greater Seattle covering UW campus + Pike Place demo pins. */
export const PLAYGROUND_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-122.38, 47.58],
  [-122.25, 47.68],
];

export function playgroundMapStyle(theme: 'light' | 'dark'): string {
  return mapStyleForTheme(theme);
}

type ThemeableMap = {
  getCenter: () => { lng: number; lat: number };
  getZoom: () => number;
  setStyle: (style: string, options?: { diff?: boolean }) => void;
  once: (event: string, cb: () => void) => void;
  jumpTo: (opts: { center: { lng: number; lat: number }; zoom: number }) => void;
};

/**
 * Swap Carto Positron / Dark Matter without remounting MapLibre.
 * Camera is restored after `style.load` so the page does not jump.
 * Tiles still come from cartocdn.com (browser → CDN), never the Worker.
 */
export function applyPlaygroundMapTheme(map: ThemeableMap, theme: 'light' | 'dark') {
  const center = map.getCenter();
  const zoom = map.getZoom();
  map.setStyle(mapStyleForTheme(theme), { diff: true });
  map.once('style.load', () => {
    map.jumpTo({ center, zoom });
  });
}

/** Drop same-origin URLs so MapLibre cannot proxy tiles through the Cloudflare Worker. */
export function playgroundTransformRequest(url: string): { url: string } {
  return dropSameOriginMapRequest(url);
}

export function isCartoBasemapStyle(style: string): boolean {
  return style === MAP_STYLE_LIGHT || style === MAP_STYLE_DARK;
}
