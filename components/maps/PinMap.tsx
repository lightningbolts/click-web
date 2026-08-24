'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { dropSameOriginMapRequest } from '@/lib/map/dropSameOriginMapRequest';
import { useTheme } from '@/lib/theme/ThemeProvider';
import { FC_PRIMARY, FC_SECONDARY, mapStyleForTheme } from '@/lib/theme/mapStyles';

export type PinMapMarker = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  tone?: 'primary' | 'secondary';
};

function padBounds(markers: PinMapMarker[]): maplibregl.LngLatBoundsLike {
  const lngs = markers.map((m) => m.lng);
  const lats = markers.map((m) => m.lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const padLng = Math.max(0.01, (maxLng - minLng) * 0.35);
  const padLat = Math.max(0.008, (maxLat - minLat) * 0.35);
  return [
    [minLng - padLng, minLat - padLat],
    [maxLng + padLng, maxLat + padLat],
  ];
}

function markerEl(tone: PinMapMarker['tone']): HTMLDivElement {
  const el = document.createElement('div');
  el.style.width = '18px';
  el.style.height = '18px';
  el.style.borderRadius = '9999px';
  el.style.border = '2px solid #fff';
  el.style.background = tone === 'secondary' ? FC_SECONDARY : FC_PRIMARY;
  el.style.boxShadow = '0 0 0 1px rgba(0,0,0,0.25)';
  return el;
}

export default function PinMap({
  markers,
  className = '',
  testId = 'pin-map',
}: {
  markers: PinMapMarker[];
  className?: string;
  testId?: string;
}) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const themeRef = useRef(theme);
  const markerKey = markers.map((m) => `${m.id}:${m.lat}:${m.lng}`).join('|');

  useEffect(() => {
    themeRef.current = theme;
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    const zoom = map.getZoom();
    map.setStyle(mapStyleForTheme(theme), { diff: true });
    map.once('styledata', () => {
      map.jumpTo({ center, zoom });
    });
  }, [theme]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current || markers.length === 0) return;
    const first = markers[0];
    const map = new maplibregl.Map({
      container,
      style: mapStyleForTheme(themeRef.current),
      center: [first.lng, first.lat],
      zoom: markers.length > 1 ? 14 : 15,
      attributionControl: false,
      fadeDuration: 0,
      renderWorldCopies: false,
      maxPitch: 0,
      pixelRatio: 1,
      cooperativeGestures: true,
      transformRequest: dropSameOriginMapRequest,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      map.resize();
      if (markers.length > 1) {
        map.fitBounds(padBounds(markers), { padding: 48, duration: 0, maxZoom: 16 });
      }
    });
    mapRef.current = map;
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [markerKey, markers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = markers.map((pin) => {
      const marker = new maplibregl.Marker({ element: markerEl(pin.tone) })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);
      if (pin.label) {
        marker.setPopup(new maplibregl.Popup({ closeButton: false, offset: 12 }).setText(pin.label));
      }
      return marker;
    });
  }, [markers]);

  if (markers.length === 0) {
    return (
      <div
        data-testid={testId}
        className={`flex h-64 items-center justify-center rounded-[16px] border border-border-hard bg-surface-container text-sm text-on-surface-variant ${className}`}
      >
        Location pin is not available yet.
      </div>
    );
  }

  return (
    <div
      data-testid={testId}
      className={`relative h-64 overflow-hidden rounded-[16px] border border-border-hard bg-surface-container ${className}`}
    >
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}
