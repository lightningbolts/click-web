'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin, Loader2, Layers } from 'lucide-react';
import type { ConnectionRecord } from './ConnectionTable';
import { escapeHtml } from '@/lib/dashboard/connectionExtras';
import { getSupabaseClient } from '@/lib/supabase';
import {
  DEFAULT_MAP_LAYER_TOGGLES,
  type MapLayerToggles,
  type MapBeaconRecord,
  beaconGeoJsonFeatures,
  isSafeBeaconUri,
  parseMapBeacon,
} from '@/lib/map/mapBeacons';

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

const SRC_CONNECTIONS = 'connections-geo';
const SRC_OFFICIAL = 'beacons-official-geo';
const SRC_COMMUNITY = 'beacons-community-geo';
const SRC_HAZARDS = 'beacons-hazards-geo';

const CLUSTER_MAX_ZOOM = 14;
const CLUSTER_RADIUS = 52;

function emptyFc() {
  return { type: 'FeatureCollection' as const, features: [] as GeoJSON.Feature[] };
}

function buildConnectionFeatures(positioned: PositionedConnection[]): GeoJSON.Feature[] {
  return positioned.map((pc) => ({
    type: 'Feature' as const,
    geometry: {
      type: 'Point' as const,
      coordinates: [pc.markerLongitude, pc.markerLatitude],
    },
    properties: {
      count: pc.groupedConnections.length,
      connIds: pc.groupedConnections.map((c) => c.id).join(','),
    },
  }));
}

/**
 * MapLibre GL map for connection locations + optional map beacon layers (clustered).
 *
 * **Data contract:** pass rows from `GET /api/connections?statusScope=map` (or equivalent).
 */
export default function ConnectionMap({ connections, onConnectionClick }: ConnectionMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const initialFitDoneRef = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [layers, setLayers] = useState<MapLayerToggles>(() => ({ ...DEFAULT_MAP_LAYER_TOGGLES }));
  const [beacons, setBeacons] = useState<MapBeaconRecord[]>([]);
  const connectionsRef = useRef(connections);
  const onConnectionClickRef = useRef(onConnectionClick);
  useEffect(() => { connectionsRef.current = connections; }, [connections]);
  useEffect(() => { onConnectionClickRef.current = onConnectionClick; }, [onConnectionClick]);

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

  const mapCenter = useMemo((): [number, number] => {
    if (hasGeoConnections && geoConnections[0]?.geo_location) {
      const g = geoConnections[0].geo_location;
      return [g.longitude, g.latitude];
    }
    return [-122.3321, 47.6062];
  }, [hasGeoConnections, geoConnections]);

  const mapInitCenterRef = useRef<[number, number] | null>(null);
  if (mapInitCenterRef.current === null) {
    mapInitCenterRef.current = mapCenter;
  }

  const wantsBeaconFetch = layers.officialSoundtracks || layers.communityBeacons || layers.hazards;

  useEffect(() => {
    if (!wantsBeaconFetch) {
      setBeacons([]);
      return;
    }
    const [lng, lat] = mapCenter;
    let cancelled = false;

    const run = async () => {
      const supabase = getSupabaseClient();
      const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
      const headers: HeadersInit = { Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const url = `/api/map/beacons?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}&radius_m=15000`;
      try {
        const res = await fetch(url, { credentials: 'include', headers });
        const payload = (await res.json()) as { beacons?: unknown[] };
        if (cancelled) return;
        const list = Array.isArray(payload.beacons) ? payload.beacons : [];
        setBeacons(list.map(parseMapBeacon).filter((b): b is MapBeaconRecord => b != null));
      } catch {
        if (!cancelled) setBeacons([]);
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [wantsBeaconFetch, mapCenter[0], mapCenter[1]]);

  const buildConnectionPopupHtml = useCallback((connIdsCsv: string) => {
    const ids = connIdsCsv.split(',').filter(Boolean);
    const groupedConnections = ids
      .map((id) => connectionsRef.current.find((c) => c.id === id))
      .filter((c): c is ConnectionRecord => c != null);
    if (groupedConnections.length === 0) return '';

    const connection = groupedConnections
      .slice()
      .sort((a, b) => b.dateMet.getTime() - a.dateMet.getTime())[0];

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

    return `<div style="color: white; background: #18181b; padding: 14px; border-radius: 14px; border: 1px solid #27272a; box-shadow: 0 8px 32px rgba(0,0,0,0.4); max-height: 260px; overflow-y: auto;">
      ${single ? `<strong style="color: #8338EC; font-size: 14px; display: block; margin-bottom: 4px;">${escapeHtml(connection.name)}</strong>
      <span style="color: #a1a1aa; font-size: 12px; display: block;">${escapeHtml(connection.location)}</span>
      <span style="color: #71717a; font-size: 11px; display: block; margin-top: 6px;">${escapeHtml(singleDate)}</span>
      ${singleCtx}${singleAtm}
      <button data-conn-id="${connection.id}" style="display: block; width: 100%; margin-top: 10px; padding: 6px 12px; background: linear-gradient(135deg, #8338EC, #6520c0); color: white; font-size: 12px; font-weight: 600; border: none; border-radius: 8px; cursor: pointer; text-align: center;">Chat →</button>`
      : `<strong style="color:#8338EC; font-size:14px; display:block; margin-bottom:6px;">${groupedConnections.length} connections at this location</strong>${groupedRows}`}
    </div>`;
  }, []);

  const attachMapInteractions = useCallback((mapInstance: maplibregl.Map) => {
    const onConnClusterClick = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f || f.geometry.type !== 'Point') return;
      const clusId = f.properties?.cluster_id;
      const src = mapInstance.getSource(SRC_CONNECTIONS) as maplibregl.GeoJSONSource | undefined;
      if (clusId == null || !src || typeof src.getClusterExpansionZoom !== 'function') return;
      src.getClusterExpansionZoom(clusId as number).then((z) => {
        const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        mapInstance.easeTo({ center: coords, zoom: z + 0.35, duration: 420 });
      }).catch(() => {});
    };

    const onConnPointClick = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const csv = f?.properties?.connIds;
      if (typeof csv !== 'string') return;
      popupRef.current?.remove();
      const html = buildConnectionPopupHtml(csv);
      const popup = new maplibregl.Popup({ offset: 18, closeButton: false, maxWidth: '280px' }).setLngLat(e.lngLat).setHTML(html);
      popup.addTo(mapInstance);
      popupRef.current = popup;
    };

    const beaconClusterClick = (sourceId: string) => (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f || f.geometry.type !== 'Point') return;
      const clusId = f.properties?.cluster_id;
      const src = mapInstance.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (clusId == null || !src || typeof src.getClusterExpansionZoom !== 'function') return;
      src.getClusterExpansionZoom(clusId as number).then((z) => {
        const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        mapInstance.easeTo({ center: coords, zoom: z + 0.35, duration: 420 });
      }).catch(() => {});
    };

    const onBeaconPointClick = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const title = escapeHtml(String(f.properties?.title ?? 'Beacon'));
      const typ = escapeHtml(String(f.properties?.beacon_type ?? ''));
      const spotifyRaw = typeof f.properties?.spotify === 'string' ? f.properties.spotify : '';
      const spotify = spotifyRaw && isSafeBeaconUri(spotifyRaw) ? spotifyRaw : '';
      const open = spotify
        ? `<a href="${escapeHtml(spotify)}" target="_blank" rel="noreferrer" style="display:inline-block;margin-top:10px;color:#67e8f9;font-size:12px;">Open in Spotify →</a>`
        : '';
      popupRef.current?.remove();
      const html = `<div style="color:#fff;background:#18181b;padding:12px 14px;border-radius:12px;border:1px solid #27272a;max-width:240px;">
        <div style="font-weight:600;color:#e4e4e7;margin-bottom:4px;">${title}</div>
        <div style="font-size:11px;color:#a1a1aa;">${typ}</div>
        ${open}
      </div>`;
      const popup = new maplibregl.Popup({ offset: 14, closeButton: true, maxWidth: '260px' }).setLngLat(e.lngLat).setHTML(html);
      popup.addTo(mapInstance);
      popupRef.current = popup;
    };

    mapInstance.on('click', 'connection-clusters', onConnClusterClick);
    mapInstance.on('click', 'connection-unclustered', onConnPointClick);
    mapInstance.on('click', 'official-beacon-clusters', beaconClusterClick(SRC_OFFICIAL));
    mapInstance.on('click', 'official-beacon-unclustered', onBeaconPointClick);
    mapInstance.on('click', 'community-beacon-clusters', beaconClusterClick(SRC_COMMUNITY));
    mapInstance.on('click', 'community-beacon-unclustered', onBeaconPointClick);
    mapInstance.on('click', 'hazard-beacon-clusters', beaconClusterClick(SRC_HAZARDS));
    mapInstance.on('click', 'hazard-beacon-unclustered', onBeaconPointClick);

    mapInstance.on('mouseenter', 'connection-clusters', () => { mapInstance.getCanvas().style.cursor = 'pointer'; });
    mapInstance.on('mouseleave', 'connection-clusters', () => { mapInstance.getCanvas().style.cursor = ''; });
    mapInstance.on('mouseenter', 'connection-unclustered', () => { mapInstance.getCanvas().style.cursor = 'pointer'; });
    mapInstance.on('mouseleave', 'connection-unclustered', () => { mapInstance.getCanvas().style.cursor = ''; });
    ['official-beacon-clusters', 'official-beacon-unclustered', 'community-beacon-clusters', 'community-beacon-unclustered', 'hazard-beacon-clusters', 'hazard-beacon-unclustered'].forEach((id) => {
      mapInstance.on('mouseenter', id, () => { mapInstance.getCanvas().style.cursor = 'pointer'; });
      mapInstance.on('mouseleave', id, () => { mapInstance.getCanvas().style.cursor = ''; });
    });
  }, [buildConnectionPopupHtml]);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    try {
      const mapInstance = new maplibregl.Map({
        container: mapContainer.current,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: mapInitCenterRef.current ?? mapCenter,
        zoom: 12,
        attributionControl: false,
      });

      map.current = mapInstance;
      mapInstance.addControl(new maplibregl.NavigationControl(), 'top-right');

      mapInstance.on('load', () => {
        mapInstance.addSource(SRC_CONNECTIONS, {
          type: 'geojson',
          data: emptyFc(),
          cluster: true,
          clusterMaxZoom: CLUSTER_MAX_ZOOM,
          clusterRadius: CLUSTER_RADIUS,
        });

        mapInstance.addLayer({
          id: 'connection-clusters',
          type: 'circle',
          source: SRC_CONNECTIONS,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#6520c0',
            'circle-radius': ['step', ['get', 'point_count'], 20, 10, 24, 28, 30],
            'circle-opacity': 0.92,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        });
        mapInstance.addLayer({
          id: 'connection-cluster-count',
          type: 'symbol',
          source: SRC_CONNECTIONS,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-size': 12,
          },
          paint: { 'text-color': '#ffffff' },
        });
        mapInstance.addLayer({
          id: 'connection-unclustered',
          type: 'circle',
          source: SRC_CONNECTIONS,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': '#8338EC',
            'circle-radius': 14,
            'circle-opacity': 0.95,
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff',
          },
        });

        const addBeaconStack = (sourceId: string, prefix: string, defaultColor: string) => {
          mapInstance.addSource(sourceId, {
            type: 'geojson',
            data: emptyFc(),
            cluster: true,
            clusterMaxZoom: CLUSTER_MAX_ZOOM,
            clusterRadius: CLUSTER_RADIUS + 4,
          });
          mapInstance.addLayer({
            id: `${prefix}-clusters`,
            type: 'circle',
            source: sourceId,
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': defaultColor,
              'circle-radius': ['step', ['get', 'point_count'], 18, 8, 22, 20, 26],
              'circle-opacity': 0.88,
              'circle-stroke-width': 2,
              'circle-stroke-color': 'rgba(255,255,255,0.85)',
            },
          });
          mapInstance.addLayer({
            id: `${prefix}-cluster-count`,
            type: 'symbol',
            source: sourceId,
            filter: ['has', 'point_count'],
            layout: {
              'text-field': ['get', 'point_count_abbreviated'],
              'text-size': 11,
            },
            paint: { 'text-color': '#0a0a0a' },
          });
          mapInstance.addLayer({
            id: `${prefix}-unclustered`,
            type: 'circle',
            source: sourceId,
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-color': ['get', 'tint'],
              'circle-radius': 11,
              'circle-opacity': 0.95,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
            },
          });
        };

        addBeaconStack(SRC_OFFICIAL, 'official-beacon', '#22d3ee');
        addBeaconStack(SRC_COMMUNITY, 'community-beacon', '#34d399');
        addBeaconStack(SRC_HAZARDS, 'hazard-beacon', '#f97316');

        attachMapInteractions(mapInstance);
        setMapLoaded(true);
        mapInstance.resize();
      });

      mapInstance.on('error', (e) => {
        console.error('Map error:', e);
        setMapError('Failed to load map tiles');
      });
    } catch (err) {
      console.error('Failed to initialize map:', err);
      setMapError('Failed to initialize map');
    }

    const handlePopupClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('[data-conn-id]') as HTMLElement | null;
      const openChat = onConnectionClickRef.current;
      if (btn && openChat) {
        const id = btn.getAttribute('data-conn-id');
        const conn = connectionsRef.current.find(c => c.id === id);
        if (conn) openChat(conn);
      }
    };
    mapContainer.current.addEventListener('click', handlePopupClick);

    return () => {
      mapContainer.current?.removeEventListener('click', handlePopupClick);
      popupRef.current?.remove();
      popupRef.current = null;
      initialFitDoneRef.current = false;
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      setMapLoaded(false);
    };
  }, [attachMapInteractions]);

  useEffect(() => {
    const m = map.current;
    if (!m || !mapLoaded) return;
    const fc = { type: 'FeatureCollection' as const, features: buildConnectionFeatures(positionedConnections) };
    const src = m.getSource(SRC_CONNECTIONS) as maplibregl.GeoJSONSource | undefined;
    src?.setData(fc);

    const vis = layers.myNetwork ? 'visible' : 'none';
    ['connection-clusters', 'connection-cluster-count', 'connection-unclustered'].forEach((id) => {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', vis);
    });

    if (!initialFitDoneRef.current && geoConnections.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      geoConnections.forEach(conn => {
        if (conn.geo_location) bounds.extend([conn.geo_location.longitude, conn.geo_location.latitude]);
      });
      m.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
      initialFitDoneRef.current = true;
    }
  }, [mapLoaded, positionedConnections, geoConnections, layers.myNetwork]);

  useEffect(() => {
    const m = map.current;
    if (!m || !mapLoaded) return;
    const setSrc = (id: string, feats: GeoJSON.Feature[]) => {
      const src = m.getSource(id) as maplibregl.GeoJSONSource | undefined;
      src?.setData({ type: 'FeatureCollection', features: feats });
    };
    setSrc(SRC_OFFICIAL, beaconGeoJsonFeatures(beacons, 'official'));
    setSrc(SRC_COMMUNITY, beaconGeoJsonFeatures(beacons, 'community'));
    setSrc(SRC_HAZARDS, beaconGeoJsonFeatures(beacons, 'hazard'));

    const vis = (on: boolean) => (on ? 'visible' : 'none');
    ['official-beacon-clusters', 'official-beacon-cluster-count', 'official-beacon-unclustered'].forEach((lid) => {
      if (m.getLayer(lid)) m.setLayoutProperty(lid, 'visibility', vis(layers.officialSoundtracks));
    });
    ['community-beacon-clusters', 'community-beacon-cluster-count', 'community-beacon-unclustered'].forEach((lid) => {
      if (m.getLayer(lid)) m.setLayoutProperty(lid, 'visibility', vis(layers.communityBeacons));
    });
    ['hazard-beacon-clusters', 'hazard-beacon-cluster-count', 'hazard-beacon-unclustered'].forEach((lid) => {
      if (m.getLayer(lid)) m.setLayoutProperty(lid, 'visibility', vis(layers.hazards));
    });
  }, [mapLoaded, beacons, layers.officialSoundtracks, layers.communityBeacons, layers.hazards]);

  useEffect(() => {
    const handleResize = () => { map.current?.resize(); };
    window.addEventListener('resize', handleResize);
    const resizeTimer = setTimeout(handleResize, 100);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimer);
    };
  }, [mapLoaded]);

  const toggle = (key: keyof MapLayerToggles) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-10">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-[#8338EC] animate-spin mx-auto mb-2" />
            <p className="text-sm text-zinc-400">Loading map...</p>
          </div>
        </div>
      )}

      <div ref={mapContainer} className="absolute inset-0" />

      {mapLoaded && (
        <div className="absolute top-4 left-4 z-[6] max-w-[220px] rounded-2xl border border-white/10 bg-zinc-950/70 backdrop-blur-xl shadow-lg shadow-black/40 p-3 text-xs text-zinc-200">
          <div className="flex items-center gap-2 mb-2 font-semibold text-white">
            <Layers className="w-3.5 h-3.5 text-[#8338EC]" />
            Map layers
          </div>
          <label className="flex items-center gap-2 py-1 cursor-pointer select-none">
            <input type="checkbox" className="accent-[#8338EC]" checked={layers.myNetwork} onChange={() => toggle('myNetwork')} />
            My Network
          </label>
          <label className="flex items-center gap-2 py-1 cursor-pointer select-none">
            <input type="checkbox" className="accent-[#8338EC]" checked={layers.officialSoundtracks} onChange={() => toggle('officialSoundtracks')} />
            Official Soundtracks
          </label>
          <label className="flex items-center gap-2 py-1 cursor-pointer select-none">
            <input type="checkbox" className="accent-[#8338EC]" checked={layers.communityBeacons} onChange={() => toggle('communityBeacons')} />
            Community Beacons
          </label>
          <label className="flex items-center gap-2 py-1 cursor-pointer select-none">
            <input type="checkbox" className="accent-[#8338EC]" checked={layers.hazards} onChange={() => toggle('hazards')} />
            Hazards
          </label>
        </div>
      )}

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
