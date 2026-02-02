'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin, Loader2 } from 'lucide-react';
import type { ConnectionRecord } from './ConnectionTable';

interface ConnectionMapProps {
  connections: ConnectionRecord[];
}

/**
 * ConnectionMap - MapLibre GL map component for displaying connection locations
 * Separated into its own component for better isolation and rendering
 */
export default function ConnectionMap({ connections }: ConnectionMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Filter connections with geo_location
  const geoConnections = connections.filter(c => c.geo_location);
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
        geoConnections.forEach((connection) => {
          if (connection.geo_location) {
            const el = document.createElement('div');
            el.className = 'connection-marker';
            el.style.cssText = 'width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #8338EC, #3A86FF); border: 3px solid white; cursor: pointer; box-shadow: 0 0 16px rgba(131, 56, 236, 0.6); transition: transform 0.2s ease;';
            el.onmouseenter = () => { el.style.transform = 'scale(1.2)'; };
            el.onmouseleave = () => { el.style.transform = 'scale(1)'; };

            const popupContent = `<div style="color: white; background: #18181b; padding: 14px; border-radius: 14px; border: 1px solid #27272a; box-shadow: 0 8px 32px rgba(0,0,0,0.4);">
              <strong style="color: #8338EC; font-size: 14px; display: block; margin-bottom: 4px;">${connection.name}</strong>
              <span style="color: #a1a1aa; font-size: 12px; display: block;">${connection.location}</span>
              <span style="color: #71717a; font-size: 11px; display: block; margin-top: 6px;">${connection.dateMet.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</span>
              ${connection.context ? `<span style="color: #8338EC; font-size: 10px; display: inline-block; margin-top: 8px; padding: 2px 8px; background: rgba(131, 56, 236, 0.2); border-radius: 9999px;">${connection.context}</span>` : ''}
            </div>`;

            const popup = new maplibregl.Popup({ 
              offset: 25,
              closeButton: false,
              maxWidth: '280px',
            }).setHTML(popupContent);

            const marker = new maplibregl.Marker({ element: el })
              .setLngLat([connection.geo_location.longitude, connection.geo_location.latitude])
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

    // Cleanup on unmount
    return () => {
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      setMapLoaded(false);
    };
  }, []);

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
      <div className="glass p-12 rounded-3xl border-zinc-800 text-center">
        <MapPin className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold mb-2">No Locations Yet</h3>
        <p className="text-zinc-400">
          Your connection map will appear here once you start making connections!
        </p>
      </div>
    );
  }

  // Show error state
  if (mapError) {
    return (
      <div className="glass p-12 rounded-3xl border-zinc-800 text-center">
        <MapPin className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold mb-2">Map Error</h3>
        <p className="text-zinc-400">{mapError}</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-3xl border border-zinc-800 overflow-hidden bg-zinc-900">
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
        style={{
          width: '100%',
          height: '600px',
        }}
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