'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from '@/lib/maps/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin, Loader2, Layers, List } from 'lucide-react';
import type { ConnectionRecord } from './ConnectionTable';
import { getSupabaseClient } from '@/lib/supabase';
import {
  DEFAULT_MAP_LAYER_TOGGLES,
  type MapLayerToggles,
  type MapBeaconRecord,
  beaconGeoJsonFeatures,
  beaconLayerGroup,
  displayTitleForBeacon,
  humanizeBeaconType,
  mapLayerForBeacon,
  parseMapBeacon,
  rawBeaconRowsFromApiPayload,
} from '@/lib/map/mapBeacons';
import { useTheme } from '@/lib/theme/ThemeProvider';
import { FC_PRIMARY, FC_SECONDARY, mapStyleForTheme } from '@/lib/theme/mapStyles';
import { Toggle } from '@/components/ui/Toggle';
import { ConnectionPeerAvatar } from './ConnectionPeerAvatar';
import { MapSelectionPanel, type MapSelection } from './map/MapSelectionPanel';

interface ConnectionMapProps {
  connections: ConnectionRecord[];
  onConnectionClick?: (connection: ConnectionRecord) => void;
  /** Open a person's profile from a selected pin. */
  onOpenProfile?: (otherUserId: string, connectionId: string) => void;
  /** False while the Map tab is hidden but kept mounted. */
  active?: boolean;
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
const SRC_SELECTED = 'selected-point';

const INTERACTIVE_LAYERS = [
  'connection-clusters',
  'connection-unclustered',
  'official-beacon-clusters',
  'official-beacon-unclustered',
  'community-beacon-clusters',
  'community-beacon-unclustered',
  'hazard-beacon-clusters',
  'hazard-beacon-unclustered',
];

const CLUSTER_MAX_ZOOM = 14;
const CLUSTER_RADIUS = 52;
/** Beacons uncluster at a higher zoom than connections so pins stay legible above the network layer. */
const BEACON_CLUSTER_MAX_ZOOM = 16;
const BEACON_CLUSTER_RADIUS = 44;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, a)));
}

/** Query radius for `/api/beacons` from the visible map bounds (half diagonal × padding), clamped to API limits. */
function radiusMetersFromBounds(bounds: maplibregl.LngLatBounds): number {
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const diag = haversineMeters(sw.lat, sw.lng, ne.lat, ne.lng);
  return Math.min(50_000, Math.max(400, (diag / 2) * 1.28));
}

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
 * **Data contract:** pass rows from `GET /api/connections?statusScope=map` or the `map` array from `?bundle=dashboard`.
 */
export default function ConnectionMap({ connections, onConnectionClick, onOpenProfile, active = true }: ConnectionMapProps) {
  const { theme } = useTheme();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const initialFitDoneRef = useRef(false);
  const presentedRef = useRef(false);
  /** Map instance finished `load` (sources/layers exist) — drives GeoJSON updates. */
  const [mapInitialized, setMapInitialized] = useState(false);
  /** First fully idle paint (tiles + layout settled) — drives fade-in to avoid pre-tile flicker. */
  const [mapPresentationReady, setMapPresentationReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [layers, setLayers] = useState<MapLayerToggles>(() => ({ ...DEFAULT_MAP_LAYER_TOGGLES }));
  const [layersOpen, setLayersOpen] = useState(false);
  const [beacons, setBeacons] = useState<MapBeaconRecord[]>([]);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  /** Hover label is positioned imperatively: a mousemove must not re-render the map component. */
  const tooltipRef = useRef<HTMLDivElement>(null);
  /** Connections and events inside the current viewport (desktop "In view" list). */
  const [viewBounds, setViewBounds] = useState<maplibregl.LngLatBounds | null>(null);
  const [listOpenMobile, setListOpenMobile] = useState(false);

  const beaconsRef = useRef<MapBeaconRecord[]>([]);
  useEffect(() => {
    beaconsRef.current = beacons;
  }, [beacons]);
  const connectionsRef = useRef(connections);
  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);

  const geoConnections = useMemo(
    () =>
      connections.filter((c) => {
        if (!c.geo_location) return false;
        const { latitude, longitude } = c.geo_location;
        return (
          typeof latitude === 'number' && typeof longitude === 'number' &&
          isFinite(latitude) && isFinite(longitude) &&
          !(latitude === 0 && longitude === 0)
        );
      }),
    [connections],
  );
  const positionedConnections = useMemo(() => spreadOverlappingConnections(geoConnections), [geoConnections]);
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

  const wantsBeaconFetch =
    layers.events ||
    layers.socialVibes ||
    layers.soundtracks ||
    layers.alertsUtilities ||
    layers.other;

  /** Map viewport for beacon proximity — once the map exists, follows pan/zoom; until then uses connection center. */
  const [beaconViewport, setBeaconViewport] = useState<{ lng: number; lat: number; radiusM: number } | null>(null);
  /** Bumps when the session is ready so we retry `/api/beacons` after sign-in. */
  const [beaconAuthEpoch, setBeaconAuthEpoch] = useState(0);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        setBeaconAuthEpoch((n) => n + 1);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!mapInitialized || !map.current) return undefined;
    const m = map.current;
    const syncFromMap = () => {
      const c = m.getCenter();
      setBeaconViewport({ lng: c.lng, lat: c.lat, radiusM: radiusMetersFromBounds(m.getBounds()) });
      setViewBounds(m.getBounds());
    };
    syncFromMap();
    let debounceId: number | null = null;
    const onMoveEnd = () => {
      if (debounceId != null) window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => {
        syncFromMap();
        debounceId = null;
      }, 420) as unknown as number;
    };
    m.on('moveend', onMoveEnd);
    return () => {
      m.off('moveend', onMoveEnd);
      if (debounceId != null) window.clearTimeout(debounceId);
    };
  }, [mapInitialized]);

  const beaconQueryLng = beaconViewport?.lng ?? mapCenter[0];
  const beaconQueryLat = beaconViewport?.lat ?? mapCenter[1];
  const beaconQueryRadiusM = beaconViewport?.radiusM ?? 15_000;

  useEffect(() => {
    // With every place layer off, the layer filter already hides pins; no fetch needed.
    if (!wantsBeaconFetch || !active) return;
    let cancelled = false;

    const run = async () => {
      const supabase = getSupabaseClient();
      const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
      const headers: HeadersInit = { Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const q = new URLSearchParams({
        lat: String(beaconQueryLat),
        lng: String(beaconQueryLng),
        radius_m: String(Math.round(beaconQueryRadiusM)),
      });
      try {
        const res = await fetch(`/api/beacons?${q.toString()}`, { credentials: 'include', headers });
        // Keep the pins already on the map when a refresh fails; do not blank the layer.
        if (!res.ok || cancelled) return;
        const json: unknown = await res.json();
        if (cancelled) return;
        const list = rawBeaconRowsFromApiPayload(json);
        setBeacons(list.map(parseMapBeacon).filter((b): b is MapBeaconRecord => b != null));
      } catch {
        /* keep current pins */
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [wantsBeaconFetch, active, beaconQueryLng, beaconQueryLat, beaconQueryRadiusM, beaconAuthEpoch]);

  const attachMapInteractions = useCallback((mapInstance: maplibregl.Map) => {
    const zoomIntoCluster = (sourceId: string) => (e: maplibregl.MapLayerMouseEvent) => {
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

    const onConnPointClick = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const csv = f?.properties?.connIds;
      if (typeof csv !== 'string' || !f || f.geometry.type !== 'Point') return;
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      setSelection({ kind: 'connections', ids: csv.split(',').filter(Boolean), lng, lat });
    };

    const onBeaconPointClick = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const id = f?.properties?.id;
      if (typeof id !== 'string' || !id || !f || f.geometry.type !== 'Point') return;
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      setSelection({ kind: 'beacon', id, lng, lat });
    };

    const hoverLabel = (e: maplibregl.MapLayerMouseEvent): string | null => {
      const props = e.features?.[0]?.properties;
      if (!props) return null;
      if (props.cluster_id != null) return `${props.point_count} here · click to zoom`;
      if (typeof props.connIds === 'string') {
        const ids = props.connIds.split(',').filter(Boolean);
        const first = connectionsRef.current.find((c) => c.id === ids[0]);
        if (!first) return null;
        return ids.length > 1 ? `${first.name} + ${ids.length - 1} more` : first.name;
      }
      if (typeof props.title === 'string') return props.title;
      return null;
    };
    const onHover = (e: maplibregl.MapLayerMouseEvent) => {
      mapInstance.getCanvas().style.cursor = 'pointer';
      const el = tooltipRef.current;
      const label = hoverLabel(e);
      if (!el) return;
      if (!label) {
        el.style.opacity = '0';
        return;
      }
      if (el.textContent !== label) el.textContent = label;
      el.style.transform = `translate(${e.point.x}px, ${e.point.y}px) translate(-50%, calc(-100% - 18px))`;
      el.style.opacity = '1';
    };
    const onLeave = () => {
      mapInstance.getCanvas().style.cursor = '';
      if (tooltipRef.current) tooltipRef.current.style.opacity = '0';
    };

    mapInstance.on('click', 'connection-clusters', zoomIntoCluster(SRC_CONNECTIONS));
    mapInstance.on('click', 'connection-unclustered', onConnPointClick);
    for (const [prefix, src] of [
      ['official-beacon', SRC_OFFICIAL],
      ['community-beacon', SRC_COMMUNITY],
      ['hazard-beacon', SRC_HAZARDS],
    ] as const) {
      mapInstance.on('click', `${prefix}-clusters`, zoomIntoCluster(src));
      mapInstance.on('click', `${prefix}-unclustered`, onBeaconPointClick);
      mapInstance.on('click', `${prefix}-unclustered-icon`, onBeaconPointClick);
      for (const layer of [`${prefix}-clusters`, `${prefix}-unclustered`]) {
        mapInstance.on('mousemove', layer, onHover);
        mapInstance.on('mouseleave', layer, onLeave);
      }
    }
    for (const layer of ['connection-clusters', 'connection-unclustered']) {
      mapInstance.on('mousemove', layer, onHover);
      mapInstance.on('mouseleave', layer, onLeave);
    }
    // Clicking empty map clears the selection.
    mapInstance.on('click', (e) => {
      const hits = mapInstance.queryRenderedFeatures(e.point, {
        layers: INTERACTIVE_LAYERS.filter((id) => mapInstance.getLayer(id)),
      });
      if (hits.length === 0) setSelection(null);
    });
  }, []);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    /** Timer id — typed as number for browser `setTimeout` (avoids NodeJS.Timeout mismatch). */
    let fallbackRevealTimer: number | null = null;

    try {
      const mapInstance = new maplibregl.Map({
        container: mapContainer.current,
        style: mapStyleForTheme(theme),
        center: mapInitCenterRef.current ?? mapCenter,
        zoom: 12,
        attributionControl: false,
      });

      map.current = mapInstance;
      mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

      mapInstance.on('load', () => {
        mapInstance.addSource(SRC_CONNECTIONS, {
          type: 'geojson',
          data: emptyFc(),
          cluster: true,
          clusterMaxZoom: CLUSTER_MAX_ZOOM,
          clusterRadius: CLUSTER_RADIUS,
          clusterProperties: { people: ['+', ['get', 'count']] },
        });

        // People: solid violet. Cluster size/label counts people, not grouped spots.
        mapInstance.addLayer({
          id: 'connection-clusters',
          type: 'circle',
          source: SRC_CONNECTIONS,
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': FC_PRIMARY,
            'circle-radius': ['step', ['get', 'people'], 18, 10, 23, 30, 29],
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff',
          },
        });
        mapInstance.addLayer({
          id: 'connection-cluster-count',
          type: 'symbol',
          source: SRC_CONNECTIONS,
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['to-string', ['get', 'people']],
            'text-size': 13,
            'text-allow-overlap': true,
          },
          paint: { 'text-color': '#ffffff' },
        });
        mapInstance.addLayer({
          id: 'connection-unclustered',
          type: 'circle',
          source: SRC_CONNECTIONS,
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': FC_PRIMARY,
            'circle-radius': ['case', ['>', ['get', 'count'], 1], 15, 11],
            'circle-stroke-width': 3,
            'circle-stroke-color': '#ffffff',
          },
        });
        mapInstance.addLayer({
          id: 'connection-unclustered-count',
          type: 'symbol',
          source: SRC_CONNECTIONS,
          filter: ['all', ['!', ['has', 'point_count']], ['>', ['get', 'count'], 1]],
          layout: {
            'text-field': ['to-string', ['get', 'count']],
            'text-size': 12,
            'text-allow-overlap': true,
          },
          paint: { 'text-color': '#ffffff' },
        });

        // Places (beacons): light plates with a tinted ring and glyph, so they never read as people.
        const addBeaconStack = (sourceId: string, prefix: string, clusterColor: string) => {
          mapInstance.addSource(sourceId, {
            type: 'geojson',
            data: emptyFc(),
            cluster: true,
            clusterMaxZoom: BEACON_CLUSTER_MAX_ZOOM,
            clusterRadius: BEACON_CLUSTER_RADIUS,
          });
          mapInstance.addLayer({
            id: `${prefix}-clusters`,
            type: 'circle',
            source: sourceId,
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': '#ffffff',
              'circle-radius': ['step', ['get', 'point_count'], 16, 8, 20, 20, 24],
              'circle-stroke-width': 3,
              'circle-stroke-color': clusterColor,
            },
          });
          mapInstance.addLayer({
            id: `${prefix}-cluster-count`,
            type: 'symbol',
            source: sourceId,
            filter: ['has', 'point_count'],
            layout: {
              'text-field': ['get', 'point_count_abbreviated'],
              'text-size': 12,
                'text-allow-overlap': true,
            },
            paint: { 'text-color': clusterColor },
          });
          mapInstance.addLayer({
            id: `${prefix}-unclustered`,
            type: 'circle',
            source: sourceId,
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-color': '#ffffff',
              'circle-radius': 12,
              'circle-stroke-width': 3,
              'circle-stroke-color': ['get', 'tint'],
            },
          });
          mapInstance.addLayer({
            id: `${prefix}-unclustered-icon`,
            type: 'symbol',
            source: sourceId,
            filter: ['!', ['has', 'point_count']],
            layout: {
              'text-field': ['get', 'icon_char'],
              'text-size': 12,
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            },
            paint: { 'text-color': ['get', 'tint'] },
          });
        };

        addBeaconStack(SRC_OFFICIAL, 'official-beacon', FC_SECONDARY);
        addBeaconStack(SRC_COMMUNITY, 'community-beacon', FC_SECONDARY);
        addBeaconStack(SRC_HAZARDS, 'hazard-beacon', '#c2410c');

        // Selection ring above everything.
        mapInstance.addSource(SRC_SELECTED, { type: 'geojson', data: emptyFc() });
        mapInstance.addLayer({
          id: 'selected-ring',
          type: 'circle',
          source: SRC_SELECTED,
          paint: {
            'circle-radius': 22,
            'circle-color': 'rgba(124,58,237,0.18)',
            'circle-stroke-width': 2.5,
            'circle-stroke-color': FC_PRIMARY,
          },
        });

        attachMapInteractions(mapInstance);
        setMapInitialized(true);
        mapInstance.resize();

        let revealed = false;
        const reveal = () => {
          if (revealed) return;
          revealed = true;
          presentedRef.current = true;
          if (fallbackRevealTimer != null) {
            window.clearTimeout(fallbackRevealTimer);
            fallbackRevealTimer = null;
          }
          setMapPresentationReady(true);
        };
        fallbackRevealTimer = window.setTimeout(reveal, 2800) as unknown as number;
        mapInstance.once('idle', reveal);
      });

      mapInstance.on('error', (e) => {
        console.error('Map error:', e);
        // Individual tile errors after the first paint are recoverable; only fail before it.
        if (!presentedRef.current) setMapError('Failed to load map tiles');
      });
    } catch (err) {
      console.error('Failed to initialize map:', err);
      setMapError('Failed to initialize map');
    }

    return () => {
      if (fallbackRevealTimer != null) {
        window.clearTimeout(fallbackRevealTimer);
        fallbackRevealTimer = null;
      }
      initialFitDoneRef.current = false;
      presentedRef.current = false;
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      setMapInitialized(false);
      setMapPresentationReady(false);
    };
  }, [attachMapInteractions, theme]);

  useEffect(() => {
    const m = map.current;
    if (!m || !mapInitialized) return;
    const src = m.getSource(SRC_CONNECTIONS) as maplibregl.GeoJSONSource | undefined;
    src?.setData({ type: 'FeatureCollection', features: buildConnectionFeatures(positionedConnections) });

    const vis = layers.myNetwork ? 'visible' : 'none';
    ['connection-clusters', 'connection-cluster-count', 'connection-unclustered', 'connection-unclustered-count'].forEach((id) => {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', vis);
    });

    if (!initialFitDoneRef.current && geoConnections.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      geoConnections.forEach((conn) => {
        if (conn.geo_location) bounds.extend([conn.geo_location.longitude, conn.geo_location.latitude]);
      });
      m.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
      initialFitDoneRef.current = true;
    }
  }, [mapInitialized, positionedConnections, geoConnections, layers.myNetwork]);

  useEffect(() => {
    const m = map.current;
    if (!m || !mapInitialized) return;
    const setSrc = (id: string, feats: GeoJSON.Feature[]) => {
      (m.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: feats });
    };
    const visibleBeacons = beacons.filter((beacon) => layers[mapLayerForBeacon(beacon.beacon_type)]);
    setSrc(SRC_OFFICIAL, beaconGeoJsonFeatures(visibleBeacons, 'official'));
    setSrc(SRC_COMMUNITY, beaconGeoJsonFeatures(visibleBeacons, 'community'));
    setSrc(SRC_HAZARDS, beaconGeoJsonFeatures(visibleBeacons, 'hazard'));
  }, [mapInitialized, beacons, layers]);

  // Selection ring follows the selection.
  useEffect(() => {
    const m = map.current;
    if (!m || !mapInitialized) return;
    const src = m.getSource(SRC_SELECTED) as maplibregl.GeoJSONSource | undefined;
    src?.setData(
      selection
        ? {
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [selection.lng, selection.lat] }, properties: {} }],
          }
        : emptyFc(),
    );
  }, [mapInitialized, selection]);

  useEffect(() => {
    if (!selection) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selection]);

  useEffect(() => {
    const handleResize = () => {
      map.current?.resize();
    };
    window.addEventListener('resize', handleResize);
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && mapContainer.current ? new ResizeObserver(handleResize) : null;
    if (resizeObserver && mapContainer.current) resizeObserver.observe(mapContainer.current);
    const resizeTimer = setTimeout(handleResize, 100);
    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
      clearTimeout(resizeTimer);
    };
  }, [mapInitialized]);

  // A hidden (kept-alive) map has zero size; re-measure when the tab comes back.
  useEffect(() => {
    if (active) map.current?.resize();
  }, [active]);

  const inView = useMemo(() => {
    if (!viewBounds) return { spots: positionedConnections.slice(0, 40), places: [] as MapBeaconRecord[] };
    const spots = layers.myNetwork
      ? positionedConnections.filter((p) => viewBounds.contains([p.markerLongitude, p.markerLatitude]))
      : [];
    const places = beacons
      .filter((b) => layers[mapLayerForBeacon(b.beacon_type)] && viewBounds.contains([b.lng, b.lat]))
      .sort((a, b) => Number(b.beacon_type === 'event') - Number(a.beacon_type === 'event'));
    return {
      spots: spots.sort((a, b) => b.connection.dateMet.getTime() - a.connection.dateMet.getTime()).slice(0, 40),
      places: places.slice(0, 40),
    };
  }, [beacons, layers, positionedConnections, viewBounds]);

  const focusOn = (sel: MapSelection) => {
    setSelection(sel);
    setListOpenMobile(false);
    map.current?.easeTo({ center: [sel.lng, sel.lat], zoom: Math.max(map.current.getZoom(), 15), duration: 480 });
  };

  const toggle = (key: keyof MapLayerToggles) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!hasGeoConnections) {
    return (
      <div className="fc-card flex flex-1 flex-col items-center justify-center rounded-[16px] border border-border-hard p-12 text-center">
        <MapPin className="mx-auto mb-4 h-12 w-12 text-outline" />
        <h3 className="mb-2 text-xl font-semibold">No places yet</h3>
        <p className="max-w-sm text-on-surface-variant">
          Your Click map will appear here once you start making clicks!
        </p>
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="fc-card flex flex-1 flex-col items-center justify-center rounded-[16px] border border-border-hard p-12 text-center">
        <MapPin className="mx-auto mb-4 h-12 w-12 text-error" />
        <h3 className="mb-2 text-xl font-semibold">Map unavailable</h3>
        <p className="text-on-surface-variant">{mapError}</p>
      </div>
    );
  }

  const selectedConnections =
    selection?.kind === 'connections'
      ? selection.ids
          .map((id) => connections.find((c) => c.id === id))
          .filter((c): c is ConnectionRecord => c != null)
          .sort((a, b) => b.dateMet.getTime() - a.dateMet.getTime())
      : [];
  const selectedBeacon = selection?.kind === 'beacon' ? beacons.find((b) => b.id === selection.id) ?? null : null;

  const layerRows: { key: keyof MapLayerToggles; label: string }[] = [
    { key: 'myNetwork', label: 'People I met' },
    { key: 'events', label: 'Events' },
    { key: 'socialVibes', label: 'Social vibes' },
    { key: 'soundtracks', label: 'Soundtracks' },
    { key: 'alertsUtilities', label: 'Alerts & utilities' },
    { key: 'other', label: 'Other' },
  ];

  const inViewList = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border-hard px-4 py-3">
        <p className="text-sm font-bold text-on-surface">In view</p>
        <p className="text-xs text-on-surface-variant">
          {inView.spots.reduce((n, s) => n + s.groupedConnections.length, 0)} people · {inView.places.length} places
        </p>
      </div>
      <div className="chat-thread-scroll min-h-0 flex-1 p-1.5">
        {inView.spots.length === 0 && inView.places.length === 0 ? (
          <p className="px-3 py-6 text-sm text-on-surface-variant">Nothing here. Zoom out or pan to see more.</p>
        ) : null}
        {inView.spots.map((spot) => (
          <button
            key={spot.connection.id}
            type="button"
            onClick={() =>
              focusOn({
                kind: 'connections',
                ids: spot.groupedConnections.map((c) => c.id),
                lng: spot.markerLongitude,
                lat: spot.markerLatitude,
              })
            }
            className="flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left hover:bg-surface-container-low"
          >
            <ConnectionPeerAvatar label={spot.connection.name} imageUrl={spot.connection.avatarUrl} size="md" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-on-surface">
                {spot.connection.name}
                {spot.groupedConnections.length > 1 ? ` +${spot.groupedConnections.length - 1}` : ''}
              </span>
              <span className="block truncate text-xs text-on-surface-variant">{spot.connection.location}</span>
            </span>
          </button>
        ))}
        {inView.places.length > 0 ? (
          <p className="px-2.5 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-on-surface-variant">Places</p>
        ) : null}
        {inView.places.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => focusOn({ kind: 'beacon', id: b.id, lng: b.lng, lat: b.lat })}
            className="flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left hover:bg-surface-container-low"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[3px] bg-white text-sm"
              style={{ borderColor: beaconRowTint(b), color: beaconRowTint(b) }}
              aria-hidden
            >
              {b.beacon_type === 'event' ? '◆' : '•'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-on-surface">{displayTitleForBeacon(b)}</span>
              <span className="block truncate text-xs text-on-surface-variant">{humanizeBeaconType(b.beacon_type)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="relative flex min-h-[420px] w-full flex-1 gap-4 overflow-hidden" data-testid="connection-map">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[16px] border border-border-hard bg-surface-container">
        <div
          className={`absolute inset-0 z-10 flex items-center justify-center bg-surface-container transition-opacity duration-500 ease-out ${
            mapPresentationReady ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
          aria-hidden={mapPresentationReady}
        >
          <div className="text-center">
            <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-on-surface-variant">Loading map…</p>
          </div>
        </div>

        <div
          ref={mapContainer}
          className={`absolute inset-0 transition-opacity duration-500 ease-out ${mapPresentationReady ? 'opacity-100' : 'opacity-0'}`}
        />

        <div
          ref={tooltipRef}
          className="pointer-events-none absolute left-0 top-0 z-[7] whitespace-nowrap rounded-[8px] border border-border-hard bg-surface px-2.5 py-1.5 text-xs font-semibold text-on-surface opacity-0 shadow-lg transition-opacity duration-100"
          role="tooltip"
          aria-hidden
        />

        {mapPresentationReady ? (
          <div className="absolute left-3 top-3 z-[6] flex flex-col items-start gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLayersOpen((o) => !o)}
                aria-expanded={layersOpen}
                className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-border-hard bg-surface px-3 text-sm font-semibold text-on-surface shadow-lg hover:bg-surface-container-low"
              >
                <Layers className="h-4 w-4 text-primary" aria-hidden />
                Layers
              </button>
              <button
                type="button"
                onClick={() => setListOpenMobile((o) => !o)}
                aria-expanded={listOpenMobile}
                className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-border-hard bg-surface px-3 text-sm font-semibold text-on-surface shadow-lg hover:bg-surface-container-low lg:hidden"
              >
                <List className="h-4 w-4 text-primary" aria-hidden />
                In view
              </button>
            </div>
            {layersOpen ? (
              <div className="w-60 rounded-[12px] border border-border-hard bg-surface p-3 text-sm text-on-surface shadow-xl">
                <div className="mb-2 flex items-center gap-3 text-xs text-on-surface-variant">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full bg-primary ring-2 ring-white" aria-hidden />
                    People
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full border-[3px] border-secondary bg-white" aria-hidden />
                    Places
                  </span>
                </div>
                {layerRows.map((row) => (
                  <label key={row.key} className="flex cursor-pointer items-center justify-between gap-2 py-1.5 font-medium">
                    {row.label}
                    <Toggle checked={layers[row.key]} onCheckedChange={() => toggle(row.key)} aria-label={row.label} className="scale-75" />
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Narrow: bottom sheet for the selection or the in-view list. */}
        {selection || listOpenMobile ? (
          <div className="absolute inset-x-2 bottom-2 z-[8] max-h-[60%] overflow-y-auto rounded-[16px] border border-border-hard bg-surface shadow-xl lg:hidden">
            {selection ? (
              <MapSelectionPanel
                selection={selection}
                connections={selectedConnections}
                beacon={selectedBeacon}
                onClose={() => setSelection(null)}
                onMessage={onConnectionClick}
                onProfile={
                  onOpenProfile ? (c) => c.otherUserId && onOpenProfile(c.otherUserId, c.id) : undefined
                }
              />
            ) : (
              <div className="h-[min(22rem,55vh)]">{inViewList}</div>
            )}
          </div>
        ) : null}
      </div>

      {/* Desktop: map and detail side by side. */}
      <aside className="hidden w-[20rem] shrink-0 overflow-hidden rounded-[16px] border border-border-hard bg-surface lg:flex lg:flex-col">
        {selection ? (
          <div className="chat-thread-scroll min-h-0 flex-1">
            <MapSelectionPanel
              selection={selection}
              connections={selectedConnections}
              beacon={selectedBeacon}
              onClose={() => setSelection(null)}
              onMessage={onConnectionClick}
              onProfile={onOpenProfile ? (c) => c.otherUserId && onOpenProfile(c.otherUserId, c.id) : undefined}
            />
          </div>
        ) : (
          inViewList
        )}
      </aside>
    </div>
  );
}

function beaconRowTint(b: MapBeaconRecord): string {
  return beaconGeoJsonFeatures([b], beaconLayerGroup(b))[0]?.properties?.tint ?? FC_SECONDARY;
}
