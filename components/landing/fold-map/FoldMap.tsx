'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type ExpressionSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTheme } from '@/lib/theme/ThemeProvider';
import {
  applyPlaygroundMapTheme,
  playgroundMapStyle,
  playgroundTransformRequest,
} from '@/components/landing/playground/playgroundMapStyle';
import {
  FOLD_MAP_CENTER,
  FOLD_MAP_MAX_BOUNDS,
  FOLD_MAP_MAX_ZOOM,
  FOLD_MAP_MIN_ZOOM,
  FOLD_MAP_ZOOM,
} from './foldMapPins';
import {
  PRESENCE_HEATMAP_MAX_ZOOM,
  type PresenceHeatmapCell,
} from '@/lib/landing/presenceHeatmap';

const HEAT_SOURCE = 'landing-presence';
const HEAT_LAYER = 'landing-presence-heat';

function cellsToGeoJson(cells: readonly PresenceHeatmapCell[]) {
  return {
    type: 'FeatureCollection' as const,
    features: cells.map((cell) => ({
      type: 'Feature' as const,
      properties: { weight: cell.weight },
      geometry: { type: 'Point' as const, coordinates: [cell.lng, cell.lat] },
    })),
  };
}

function heatmapColor(theme: 'light' | 'dark'): ExpressionSpecification {
  if (theme === 'dark') {
    return [
      'interpolate',
      ['linear'],
      ['heatmap-density'],
      0,
      'rgba(124,58,237,0)',
      0.04,
      'rgba(91,33,182,0.22)',
      0.12,
      'rgba(124,58,237,0.42)',
      0.28,
      'rgba(124,58,237,0.62)',
      0.5,
      'rgba(139,92,246,0.78)',
      0.75,
      'rgba(167,139,250,0.9)',
      1,
      'rgba(196,181,253,0.96)',
    ];
  }
  return [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0,
    'rgba(124,58,237,0)',
    0.04,
    'rgba(167,139,250,0.28)',
    0.12,
    'rgba(124,58,237,0.45)',
    0.28,
    'rgba(124,58,237,0.62)',
    0.5,
    'rgba(109,40,217,0.78)',
    0.75,
    'rgba(91,33,182,0.9)',
    1,
    'rgba(76,29,149,0.96)',
  ];
}

function atSorted(arr: number[], t: number) {
  return arr[Math.round((arr.length - 1) * t)];
}

/** Keep one GPS outlier from yanking the hero to an empty coastline. */
function cameraBounds(cells: readonly PresenceHeatmapCell[]) {
  const bounds = new maplibregl.LngLatBounds();
  if (cells.length < 8) {
    cells.forEach((cell) => bounds.extend([cell.lng, cell.lat]));
    return bounds;
  }
  const lats = cells.map((cell) => cell.lat).sort((a, b) => a - b);
  const lngs = cells.map((cell) => cell.lng).sort((a, b) => a - b);
  bounds.extend([atSorted(lngs, 0.06), atSorted(lats, 0.06)]);
  bounds.extend([atSorted(lngs, 0.94), atSorted(lats, 0.94)]);
  return bounds;
}

/** Fit density into the map that is not covered by the offer plate. */
function cameraPadding(container: HTMLElement) {
  const w = container.clientWidth;
  const h = container.clientHeight;
  const plateW = Math.min(448 + 64, w * 0.92);
  const plateH = Math.min(390, h * 0.5);
  const left = Math.min(plateW, w * 0.42);
  const bottom = Math.min(plateH, h * 0.42);
  if (w < 720) {
    return { top: 72, right: 16, bottom, left: 16 };
  }
  return { top: 88, right: Math.min(80, w * 0.12), bottom, left };
}

function paintHeatmap(
  map: maplibregl.Map,
  cells: readonly PresenceHeatmapCell[],
  theme: 'light' | 'dark',
) {
  const data = cellsToGeoJson(cells);
  const existing = map.getSource(HEAT_SOURCE) as maplibregl.GeoJSONSource | undefined;
  if (existing) {
    existing.setData(data);
  } else {
    map.addSource(HEAT_SOURCE, { type: 'geojson', data });
  }
  if (map.getLayer(HEAT_LAYER)) map.removeLayer(HEAT_LAYER);
  if (map.getLayer('landing-presence-core')) map.removeLayer('landing-presence-core');
  if (map.getLayer('landing-presence-bands')) map.removeLayer('landing-presence-bands');
  if (map.getSource('landing-presence-bands')) map.removeSource('landing-presence-bands');
  map.addLayer({
    id: HEAT_LAYER,
    type: 'heatmap',
    source: HEAT_SOURCE,
    maxzoom: 22,
    paint: {
      'heatmap-weight': ['get', 'weight'],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 0.95, 13, 1.1, 16, 1.2, 18, 1.3],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 9, 16, 12, 20, 15, 24, 17, 30, 18, 38],
      'heatmap-color': heatmapColor(theme),
      'heatmap-opacity': 0.9,
    },
  });
}

/**
 * First-viewport Fold Map. Carto tiles in the browser only.
 * Presence is a heatmap of real handshake points (block-offset for privacy).
 */
export default function FoldMap({ cells }: { cells: readonly PresenceHeatmapCell[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const themeRef = useRef<'light' | 'dark'>('light');
  const appliedThemeRef = useRef<'light' | 'dark' | null>(null);
  const fittedRef = useRef(false);
  const cellsRef = useRef(cells);
  const { theme } = useTheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  themeRef.current = theme;
  cellsRef.current = cells;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let fallback: number | undefined;
    let resizeObserver: ResizeObserver | null = null;
    let resizeFrame = 0;
    try {
      const hasHeat = cellsRef.current.length > 0;
      const map = new maplibregl.Map({
        container,
        style: playgroundMapStyle(themeRef.current),
        center: FOLD_MAP_CENTER,
        zoom: FOLD_MAP_ZOOM,
        minZoom: FOLD_MAP_MIN_ZOOM,
        maxZoom: Math.min(FOLD_MAP_MAX_ZOOM, PRESENCE_HEATMAP_MAX_ZOOM),
        maxBounds: hasHeat ? undefined : FOLD_MAP_MAX_BOUNDS,
        attributionControl: { compact: true },
        fadeDuration: 0,
        renderWorldCopies: false,
        maxPitch: 0,
        pixelRatio: 1,
        cooperativeGestures: true,
        transformRequest: playgroundTransformRequest,
      });
      mapRef.current = map;
      appliedThemeRef.current = themeRef.current;
      resizeObserver = new ResizeObserver(() => {
        if (resizeFrame) cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = 0;
          map.resize();
        });
      });
      resizeObserver.observe(container);
      map.on('load', () => {
        map.resize();
        let revealed = false;
        const reveal = () => {
          if (revealed) return;
          revealed = true;
          if (fallback != null) window.clearTimeout(fallback);
          setReady(true);
        };
        fallback = window.setTimeout(reveal, 2800);
        map.once('idle', reveal);
      });
      map.on('error', () => setError('Map tiles failed to load'));
    } catch {
      setError('Map failed to start');
    }

    return () => {
      if (fallback != null) window.clearTimeout(fallback);
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      fittedRef.current = false;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || appliedThemeRef.current === theme) return;
    applyPlaygroundMapTheme(map, theme);
    appliedThemeRef.current = theme;
  }, [ready, theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const apply = () => paintHeatmap(map, cells, themeRef.current);
    if (map.isStyleLoaded()) apply();
    const onStyle = () => apply();
    map.on('style.load', onStyle);

    if (!fittedRef.current && cells.length > 0) {
      map.fitBounds(cameraBounds(cells), {
        padding: cameraPadding(map.getContainer()),
        maxZoom: 12.4,
        duration: 0,
      });
      fittedRef.current = true;
    }

    return () => {
      map.off('style.load', onStyle);
    };
  }, [ready, cells, theme]);

  return (
    <div className="absolute inset-0" data-testid="landing-fold-map-canvas">
      <div
        ref={containerRef}
        className="absolute inset-0 bg-[#ebeef1] dark:bg-[#15121c] [&_.maplibregl-ctrl-bottom-right]:!right-2 [&_.maplibregl-ctrl-bottom-right]:!bottom-2"
        aria-hidden={Boolean(error)}
      />
      {error ? (
        <p className="absolute right-4 top-4 z-[1] max-w-xs rounded-[8px] border border-border-hard bg-surface px-3 py-2 text-sm text-on-surface-variant shadow-sm">
          {error}. The offer below still works.
        </p>
      ) : (
        <p className="pointer-events-none absolute right-4 top-4 z-[1] max-w-[16rem] rounded-[8px] border border-border-hard bg-surface px-3 py-2 text-sm text-on-surface-variant shadow-sm">
          Approximate handshake locations — each glow is offset by a block so nobody can be found.
        </p>
      )}
    </div>
  );
}
