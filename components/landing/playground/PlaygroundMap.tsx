'use client';

import { useEffect, useRef, useState } from 'react';
import * as maplibregl from '@/lib/maps/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPinOff } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeProvider';
import { avatarFallbackColor, avatarInitials } from '@/lib/ui/avatarFallback';
import { generateCardVisual } from '@/lib/ui/generateCardVisual';
import { cardVisualStyleCss } from '@/lib/ui/cardVisualPattern';
import { cn } from '@/lib/cn';
import {
  applyPlaygroundMapTheme,
  PLAYGROUND_MAP_CENTER,
  PLAYGROUND_MAP_MAX_ZOOM,
  PLAYGROUND_MAP_MIN_ZOOM,
  PLAYGROUND_MAP_ZOOM,
  PLAYGROUND_MAX_BOUNDS,
  playgroundMapStyle,
  playgroundTransformRequest,
} from './playgroundMapStyle';
import type { LatLng } from './types';

export type MapPinData = { id: string; kind: 'person' | 'event'; label: string; geo: LatLng };

const PIN_BASE = 'display:flex;align-items:center;gap:6px;padding:0;border:0;background:none;cursor:pointer;';
const RING = (selected: boolean) =>
  `box-shadow:0 0 0 ${selected ? 3 : 2}px ${selected ? 'var(--accent)' : 'var(--bg)'}, var(--shadow-pin);`;

/** Pins match the app: people are avatar circles, events rounded squares with a title label. */
function pinElement(pin: MapPinData, selected: boolean, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.dataset.testid = 'playground-map-pin';
  el.setAttribute('aria-label', pin.label);
  el.setAttribute('aria-pressed', String(selected));
  el.style.cssText = PIN_BASE;
  const mark = document.createElement('span');
  if (pin.kind === 'person') {
    mark.textContent = avatarInitials(pin.label);
    mark.style.cssText = `display:flex;width:36px;height:36px;align-items:center;justify-content:center;border-radius:9999px;color:#fff;font:600 13px/1 var(--font-sans);background:${avatarFallbackColor(pin.id)};${RING(selected)}`;
    el.append(mark);
  } else {
    mark.style.cssText = `display:block;width:32px;height:32px;border-radius:10px;${cardVisualStyleCss(generateCardVisual(pin.id))};${RING(selected)}`;
    const label = document.createElement('span');
    label.textContent = pin.label;
    label.style.cssText =
      'max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 8px;border-radius:9999px;background:var(--surface);color:var(--fg);font:600 12px/1.3 var(--font-sans);box-shadow:var(--shadow-pin);';
    el.append(mark, label);
  }
  el.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return el;
}

/**
 * Carto basemap clamped to Seattle with the demo's pins. Selection lives in React (the
 * caller renders the sheet), so the map only draws pins. Theme swaps styles in place.
 */
export default function PlaygroundMap({
  pins,
  selectedId,
  onSelect,
  className,
}: {
  pins: readonly MapPinData[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  className?: string;
}) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const themeRef = useRef(theme);
  const appliedThemeRef = useRef(theme);
  const onSelectRef = useRef(onSelect);
  const fittedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    themeRef.current = theme;
    const map = mapRef.current;
    if (!map || !ready || appliedThemeRef.current === theme) return;
    appliedThemeRef.current = theme;
    applyPlaygroundMapTheme(map, theme);
  }, [theme, ready]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    let fallback: number | null = null;
    let frame = 0;
    let observer: ResizeObserver | null = null;
    try {
      const map = new maplibregl.Map({
        container,
        style: playgroundMapStyle(themeRef.current),
        center: PLAYGROUND_MAP_CENTER,
        zoom: PLAYGROUND_MAP_ZOOM,
        minZoom: PLAYGROUND_MAP_MIN_ZOOM,
        maxZoom: PLAYGROUND_MAP_MAX_ZOOM,
        maxBounds: PLAYGROUND_MAX_BOUNDS,
        attributionControl: false,
        fadeDuration: 0,
        renderWorldCopies: false,
        maxPitch: 0,
        pixelRatio: 1,
        cooperativeGestures: true,
        // Tap-then-drag zoom isn't covered by cooperativeGestures and stalls page scrolling
        // on phones; coarse pointers zoom with the +/- control instead.
        touchZoomRotate: !(window.matchMedia?.('(pointer: coarse)').matches ?? false),
        transformRequest: playgroundTransformRequest,
      });
      mapRef.current = map;
      appliedThemeRef.current = themeRef.current;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => map.resize());
      });
      observer.observe(container);
      map.on('click', () => onSelectRef.current(null));
      let loaded = false;
      map.on('load', () => {
        loaded = true;
        map.resize();
        const reveal = () => {
          if (fallback != null) window.clearTimeout(fallback);
          setReady(true);
        };
        fallback = window.setTimeout(reveal, 2800);
        map.once('idle', reveal);
      });
      // A tile failing after load leaves a working map; only a map that never loads failed.
      map.on('error', () => {
        if (!loaded) setFailed(true);
      });
    } catch {
      setFailed(true);
    }
    return () => {
      if (fallback != null) window.clearTimeout(fallback);
      cancelAnimationFrame(frame);
      observer?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      fittedRef.current = false;
      setReady(false);
    };
    // Mount once: a remount would reset the camera and refetch the style.
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || fittedRef.current || pins.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    pins.forEach((p) => bounds.extend([p.geo.lng, p.geo.lat]));
    map.fitBounds(bounds, { padding: { top: 72, bottom: 180, left: 48, right: 48 }, maxZoom: 14.5, duration: 0 });
    fittedRef.current = true;
  }, [ready, pins]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const markers = pins.map((pin) =>
      new maplibregl.Marker({
        element: pinElement(pin, pin.id === selectedId, () => onSelectRef.current(pin.id)),
        anchor: 'center',
      })
        .setLngLat([pin.geo.lng, pin.geo.lat])
        .addTo(map),
    );
    return () => markers.forEach((m) => m.remove());
  }, [ready, pins, selectedId]);

  return (
    <div className={cn('relative overflow-hidden bg-surface-raised', className)} data-testid="playground-map">
      <div
        ref={containerRef}
        className={cn('absolute inset-0 transition-opacity duration-[var(--d-slow)]', ready ? 'opacity-100' : 'opacity-0')}
      />
      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
          <MapPinOff size={28} className="text-fg-tertiary" aria-hidden />
          <p className="type-body text-fg-secondary">The map couldn’t load. Everything nearby is listed below.</p>
        </div>
      ) : null}
    </div>
  );
}
