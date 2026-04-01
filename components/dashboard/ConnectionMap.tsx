'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin, Loader2 } from 'lucide-react';
import type { ConnectionRecord } from './ConnectionTable';
import { escapeHtml } from '@/lib/dashboard/connectionExtras';

function atmosphereHtml(conn: ConnectionRecord): string {
  const bits = [conn.weatherSummary, conn.noiseSummary].filter((b): b is string => typeof b === 'string' && b.length > 0);
  if (bits.length === 0) return '';
  return `<span style="color:#a1a1aa;font-size:10px;display:block;margin-top:6px;line-height:1.35;">${bits.map((b) => escapeHtml(b)).join(' · ')}</span>`;
}

interface ConnectionMapProps {
  connections: ConnectionRecord[];
  onConnectionClick?: (connection: ConnectionRecord) => void;
}

type PositionedConnection = {
  connection: ConnectionRecord;
  markerLongitude: number;
  markerLatitude: number;
  groupedConnections: ConnectionRecord[];
};

const FEET_TO_METERS = 0.3048;
const GROUPING_DISTANCE_METERS = 10 * FEET_TO_METERS;

const spreadOverlappingConnections = (input: ConnectionRecord[]): PositionedConnection[] => {
  const withLocation = input.filter((connection) => connection.geo_location);

  const distanceMeters = (a: ConnectionRecord, b: ConnectionRecord): number => {
    if (!a.geo_location || !b.geo_location) return Number.POSITIVE_INFINITY;

    const lat1 = (a.geo_location.latitude * Math.PI) / 180;
    const lon1 = (a.geo_location.longitude * Math.PI) / 180;
    const lat2 = (b.geo_location.latitude * Math.PI) / 180;
    const lon2 = (b.geo_location.longitude * Math.PI) / 180;

    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    const haversine =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    return 2 * 6371000 * Math.asin(Math.sqrt(haversine));
  };

  const sorted = withLocation
    .slice()
    .sort((a, b) => b.dateMet.getTime() - a.dateMet.getTime());

  const clusters: ConnectionRecord[][] = [];

  // Greedy clustering around each group's anchor point (first member) prevents
  // transitive chain-merges that can move grouped dots far from expected locations.
  sorted.forEach((connection) => {
    const targetCluster = clusters.find((cluster) => {
      const anchor = cluster[0];
      return distanceMeters(connection, anchor) <= GROUPING_DISTANCE_METERS;
    });

    if (targetCluster) {
      targetCluster.push(connection);
    } else {
      clusters.push([connection]);
    }
  });

  const positioned: PositionedConnection[] = [];

  clusters.forEach((group) => {
    if (group.length === 0) return;

    const valid = group.filter((connection) => connection.geo_location);
    if (valid.length === 0) return;

    const centroidLatitude = valid.reduce((sum, connection) => sum + (connection.geo_location?.latitude ?? 0), 0) / valid.length;
    const centroidLongitude = valid.reduce((sum, connection) => sum + (connection.geo_location?.longitude ?? 0), 0) / valid.length;

    const displayConnection = group
      .slice()
      .sort((a, b) => b.dateMet.getTime() - a.dateMet.getTime())[0];

    positioned.push({
      connection: displayConnection,
      markerLatitude: centroidLatitude,
      markerLongitude: centroidLongitude,
      groupedConnections: group,
    });
  });

  return positioned;
};

/**
 * ConnectionMap - MapLibre GL map component for displaying connection locations
 * Separated into its own component for better isolation and rendering
 */
export default function ConnectionMap({ connections, onConnectionClick }: ConnectionMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  // Keep a ref to connections so event delegation can read them without stale closures
  const connectionsRef = useRef(connections);
  useEffect(() => { connectionsRef.current = connections; }, [connections]);

  // Filter connections with valid geo_location (exclude NaN, null, and 0,0 sentinel values)
  const geoConnections = connections.filter(c => {
    if (!c.geo_location) return false;
    const { latitude, longitude } = c.geo_location;
    return (
      typeof latitude === 'number' && typeof longitude === 'number' &&
      isFinite(latitude) && isFinite(longitude) &&
      !(latitude === 0 && longitude === 0)
    );
  });
  const positionedConnections = spreadOverlappingConnections(geoConnections);
  const hasGeoConnections = geoConnections.length > 0;

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Calculate center from connections or use Seattle default
    const initialCenter: [number, number] = hasGeoConnections && geoConnections[0]?.geo_location
      ? [geoConnections[0].geo_location.longitude, geoConnections[0].geo_location.latitude]
      : [-122.3321, 47.6062]; // Seattle default

    try {
      const mapInstance = new maplibregl.Map({
        container: mapContainer.current,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: initialCenter,
        zoom: 12,
        attributionControl: false,
      });

      map.current = mapInstance;

      // Add navigation controls
      mapInstance.addControl(new maplibregl.NavigationControl(), 'top-right');

      // Handle map load
      mapInstance.on('load', () => {
        setMapLoaded(true);

        // Resize to ensure proper rendering
        mapInstance.resize();

        // Add markers
        positionedConnections.forEach(({ connection, markerLatitude, markerLongitude, groupedConnections }) => {
          if (connection.geo_location) {
            // Zero-size anchor div: MapLibre positions this 0×0 point exactly at the
            // coordinate (no offsetWidth/offsetHeight measurement needed), so the dot
            // never drifts at any zoom level.
            const anchor = document.createElement('div');
            anchor.style.cssText = 'position: relative; width: 0; height: 0;';

            const el = document.createElement('div');
            el.className = 'connection-marker';
            // translate(-50%, -50%) centers the dot on the anchor point regardless of
            // its size, which also means the grow-on-hover effect stays perfectly centered.
            el.style.cssText = 'position: absolute; transform: translate(-50%, -50%); width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #8338EC, #3A86FF); border: 3px solid white; cursor: pointer; box-shadow: 0 0 16px rgba(131, 56, 236, 0.6); transition: box-shadow 0.2s ease, width 0.2s ease, height 0.2s ease;';
            el.onmouseenter = () => { el.style.width = '34px'; el.style.height = '34px'; el.style.boxShadow = '0 0 24px rgba(131, 56, 236, 0.8)'; };
            el.onmouseleave = () => { el.style.width = '28px'; el.style.height = '28px'; el.style.boxShadow = '0 0 16px rgba(131, 56, 236, 0.6)'; };

            if (groupedConnections.length > 1) {
              const badge = document.createElement('div');
              badge.style.cssText = 'position:absolute; right:-8px; top:-8px; min-width:18px; height:18px; padding:0 4px; border-radius:9999px; background:#18181b; color:#C3A6FF; border:1px solid #8338EC; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; line-height:1;';
              badge.textContent = String(groupedConnections.length);
              // el is already position:absolute so it creates a positioning context
              // for the badge — no need to override position here.
              el.appendChild(badge);
            }

            anchor.appendChild(el);

            const groupedRows = groupedConnections
              .map((conn) => {
                const date = conn.dateMet.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
                const ctx = conn.context
                  ? `<span style="color:#8338EC; font-size:10px; display:inline-block; margin-top:6px; padding:2px 8px; background:rgba(131,56,236,0.2); border-radius:9999px;">${escapeHtml(conn.context)}</span>`
                  : '';
                const atm = atmosphereHtml(conn);
                return `<div style="padding:8px 0; border-bottom:1px solid rgba(63,63,70,0.35);">
                  <strong style="color:#8338EC; font-size:13px; display:block; margin-bottom:2px;">${escapeHtml(conn.name)}</strong>
                  <span style="color:#a1a1aa; font-size:11px; display:block;">${escapeHtml(conn.location)}</span>
                  <span style="color:#71717a; font-size:10px; display:block; margin-top:4px;">${escapeHtml(date)}</span>
                  ${ctx}${atm}
                  <button data-conn-id="${conn.id}" style="display:block; width:100%; margin-top:8px; padding:5px 10px; background:linear-gradient(135deg, #8338EC, #6520c0); color:white; font-size:11px; font-weight:600; border:none; border-radius:8px; cursor:pointer; text-align:center;">
                    Chat →
                  </button>
                </div>`;
              })
              .join('');

            const single = groupedConnections.length === 1;
            const singleDate = connection.dateMet.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
            const singleCtx = connection.context
              ? `<span style="color: #8338EC; font-size: 10px; display: inline-block; margin-top: 8px; padding: 2px 8px; background: rgba(131, 56, 236, 0.2); border-radius: 9999px;">${escapeHtml(connection.context)}</span>`
              : '';
            const singleAtm = atmosphereHtml(connection);
            const popupContent = `<div style="color: white; background: #18181b; padding: 14px; border-radius: 14px; border: 1px solid #27272a; box-shadow: 0 8px 32px rgba(0,0,0,0.4); max-height: 260px; overflow-y: auto;">
              ${single ? `<strong style="color: #8338EC; font-size: 14px; display: block; margin-bottom: 4px;">${escapeHtml(connection.name)}</strong>
              <span style="color: #a1a1aa; font-size: 12px; display: block;">${escapeHtml(connection.location)}</span>
              <span style="color: #71717a; font-size: 11px; display: block; margin-top: 6px;">${escapeHtml(singleDate)}</span>
              ${singleCtx}${singleAtm}
              <button data-conn-id="${connection.id}" style="display: block; width: 100%; margin-top: 10px; padding: 6px 12px; background: linear-gradient(135deg, #8338EC, #6520c0); color: white; font-size: 12px; font-weight: 600; border: none; border-radius: 8px; cursor: pointer; text-align: center;">Chat →</button>`
              : `<strong style="color:#8338EC; font-size:14px; display:block; margin-bottom:6px;">${groupedConnections.length} connections at this location</strong>${groupedRows}`}
            </div>`;

            const popup = new maplibregl.Popup({
              offset: 25,
              closeButton: false,
              maxWidth: '280px',
            }).setHTML(popupContent);

            const marker = new maplibregl.Marker({ element: anchor })
              .setLngLat([markerLongitude, markerLatitude])
              .setPopup(popup)
              .addTo(mapInstance);

            markersRef.current.push(marker);
          }
        });

        // Fit bounds to show all markers if we have multiple
        if (geoConnections.length > 1) {
          const bounds = new maplibregl.LngLatBounds();
          geoConnections.forEach(conn => {
            if (conn.geo_location) {
              bounds.extend([conn.geo_location.longitude, conn.geo_location.latitude]);
            }
          });
          mapInstance.fitBounds(bounds, { padding: 60, maxZoom: 14 });
        }
      });

      // Handle map errors
      mapInstance.on('error', (e) => {
        console.error('Map error:', e);
        setMapError('Failed to load map tiles');
      });

    } catch (err) {
      console.error('Failed to initialize map:', err);
      setMapError('Failed to initialize map');
    }

    // Event delegation for popup "Chat" buttons
    const handlePopupClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('[data-conn-id]') as HTMLElement | null;
      if (btn && onConnectionClick) {
        const id = btn.getAttribute('data-conn-id');
        const conn = connectionsRef.current.find(c => c.id === id);
        if (conn) onConnectionClick(conn);
      }
    };
    mapContainer.current.addEventListener('click', handlePopupClick);

    // Cleanup on unmount
    return () => {
      mapContainer.current?.removeEventListener('click', handlePopupClick);
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      setMapLoaded(false);
    };
  }, [positionedConnections, hasGeoConnections, geoConnections]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (map.current && mapLoaded) {
        map.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);

    // Initial resize after a short delay
    const resizeTimer = setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimer);
    };
  }, [mapLoaded]);

  // Show empty state if no geo connections
  if (!hasGeoConnections) {
    return (
      <div className="glass p-12 rounded-3xl border border-zinc-800 text-center">
        <MapPin className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold mb-2">No Locations Yet</h3>
        <p className="text-zinc-400">
          Your Click map will appear here once you start making clicks!
        </p>
      </div>
    );
  }

  // Show error state
  if (mapError) {
    return (
      <div className="glass p-12 rounded-3xl border border-zinc-800 text-center">
        <MapPin className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold mb-2">Map Error</h3>
        <p className="text-zinc-400">{mapError}</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-3xl border border-zinc-800 overflow-hidden bg-zinc-900 h-[600px]">
      {/* Loading overlay */}
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-10">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-[#8338EC] animate-spin mx-auto mb-2" />
            <p className="text-sm text-zinc-400">Loading map...</p>
          </div>
        </div>
      )}

      {/* Map container */}
      <div
        ref={mapContainer}
        className="absolute inset-0"
      />

      {/* Connection count badge */}
      {mapLoaded && (
        <div className="absolute bottom-4 left-4 bg-zinc-900/90 backdrop-blur-sm px-4 py-2 rounded-xl border border-zinc-700">
          <span className="text-sm text-zinc-400">
            <span className="text-[#8338EC] font-bold">{geoConnections.length}</span> locations mapped
          </span>
        </div>
      )}
    </div>
  );
}