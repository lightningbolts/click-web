'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from '@/lib/maps/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Layers, LocateFixed, MapPin, Minus, Plus } from 'lucide-react';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { getSupabaseClient } from '@/lib/supabase';
import {
  DEFAULT_MAP_LAYER_TOGGLES,
  type MapLayerToggles,
  type MapBeaconRecord,
  beaconGeoJsonFeatures,
  mapLayerForBeacon,
  parseMapBeacon,
  rawBeaconRowsFromApiPayload,
} from '@/lib/map/mapBeacons';
import { useTheme } from '@/lib/theme/ThemeProvider';
import { FC_PRIMARY, FC_SECONDARY, mapStyleForTheme } from '@/lib/theme/mapStyles';
import type { PlaceSummary } from '@/lib/places/types';
import {
  buildConnectionFeatures,
  buildPlaceFeatures,
  emptyFc,
  radiusMetersFromBounds,
  spreadOverlappingConnections,
} from '@/lib/map/connectionMapGeo';
import Link from 'next/link';
import { EmptyState } from '@/components/ds/EmptyState';
import { IconButton } from '@/components/ds/IconButton';
import { Loader } from '@/components/ds/Loader';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ds/Popover';
import { ToggleList, ToggleRow } from '@/components/settings/ToggleRows';
import { MapSelectionPanel, type MapSelection } from './MapSelectionPanel';
import { NearbyList, nearbyTotal } from './NearbyList';
import { collectPins, hideGlPins, selectionKey, type PinSources } from './collectPins';
import { MapMarkerLayer, pinLabel, type PinModel } from './mapMarkers';

interface ConnectionMapProps {
  connections: ConnectionRecord[];
  onConnectionClick?: (connection: ConnectionRecord) => void;
  /** Open a person's profile from a selected pin. */
  onOpenProfile?: (otherUserId: string, connectionId: string) => void;
  /** False while the Map tab is hidden but kept mounted. */
  active?: boolean;
  /** The first connections load hasn't finished: Nearby shows placeholders, not "nothing here". */
  connectionsLoading?: boolean;
}

const SRC_CONNECTIONS = 'connections-geo';
const SRC_OFFICIAL = 'beacons-official-geo';
const SRC_COMMUNITY = 'beacons-community-geo';
const SRC_HAZARDS = 'beacons-hazards-geo';
const SRC_SELECTED = 'selected-point';
const SRC_PLACES = 'places-geo';
const PIN_SOURCES: PinSources = {
  connections: SRC_CONNECTIONS,
  beacons: [SRC_OFFICIAL, SRC_COMMUNITY, SRC_HAZARDS],
  places: SRC_PLACES,
};

/** Every source and layer this component adds: carried across theme swaps (see `transformStyle`). */
export const CUSTOM_SOURCE_IDS = [SRC_CONNECTIONS, SRC_OFFICIAL, SRC_COMMUNITY, SRC_HAZARDS, SRC_PLACES, SRC_SELECTED];

const CLUSTER_MAX_ZOOM = 14;
const CLUSTER_RADIUS = 52;
/** Beacons uncluster at a higher zoom than connections so pins stay legible above the network layer. */
const BEACON_CLUSTER_MAX_ZOOM = 16;
const BEACON_CLUSTER_RADIUS = 44;
/** `/api/beacons` page size (its maximum) and a safety ceiling for one area (10 × 500). */
const BEACON_PAGE_SIZE = 500;
const BEACON_MAX_PAGES = 10;

/** Pages can repeat a beacon (the caller's own pins ride on the first page). */
function dedupeById(beacons: MapBeaconRecord[]): MapBeaconRecord[] {
  return [...new Map(beacons.map((b) => [b.id, b])).values()];
}

/**
 * MapLibre GL map for connection locations + optional map beacon layers (clustered).
 *
 * **Data contract:** pass rows from `GET /api/connections?statusScope=map` or the `map` array from `?bundle=dashboard`.
 */
export default function ConnectionMap({
  connections,
  onConnectionClick,
  onOpenProfile,
  active = true,
  connectionsLoading = false,
}: ConnectionMapProps) {
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const initialFitDoneRef = useRef(false);
  const presentedRef = useRef(false);
  /** Map instance finished `load` (sources/layers exist) — drives GeoJSON updates. */
  const [mapInitialized, setMapInitialized] = useState(false);
  /** First fully idle paint (tiles + layout settled) — drives fade-in to avoid pre-tile flicker. */
  const [mapPresentationReady, setMapPresentationReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [layers, setLayers] = useState<MapLayerToggles>(() => ({
    ...DEFAULT_MAP_LAYER_TOGGLES,
  }));
  const [layersOpen, setLayersOpen] = useState(false);
  const [beacons, setBeacons] = useState<MapBeaconRecord[]>([]);
  const [places, setPlaces] = useState<PlaceSummary[]>([]);
  /** The first beacon / Places answer arrived (or failed), so an empty list means empty. */
  const [beaconsSettled, setBeaconsSettled] = useState(false);
  const [placesSettled, setPlacesSettled] = useState(false);
  const [selection, setSelection] = useState<MapSelection | null>(null);
  /** Hover label is positioned imperatively: a mousemove must not re-render the map component. */
  const tooltipRef = useRef<HTMLDivElement>(null);
  /** Connections and events inside the current viewport (desktop "In view" list). */
  const [viewBounds, setViewBounds] = useState<maplibregl.LngLatBounds | null>(null);
  const [listOpenMobile, setListOpenMobile] = useState(false);

  const beaconsRef = useRef<MapBeaconRecord[]>([]);
  const placesRef = useRef<PlaceSummary[]>([]);
  const layersRef = useRef(layers);
  const markerLayerRef = useRef<MapMarkerLayer | null>(null);
  const scheduleSyncRef = useRef<() => void>(() => {});
  useEffect(() => {
    placesRef.current = places;
    layersRef.current = layers;
    scheduleSyncRef.current();
  }, [places, layers]);
  useEffect(() => {
    markerLayerRef.current?.setSelected(selectionKey(selection));
  }, [selection]);
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
          typeof latitude === 'number' &&
          typeof longitude === 'number' &&
          isFinite(latitude) &&
          isFinite(longitude) &&
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

  const wantsBeaconFetch = layers.events || layers.socialVibes || layers.soundtracks || layers.alertsUtilities || layers.other;

  /** Map viewport for beacon proximity: follows pan/zoom once the map exists, null until then. */
  const [beaconViewport, setBeaconViewport] = useState<{
    lng: number;
    lat: number;
    radiusM: number;
  } | null>(null);
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

  // Pins load for the map's real viewport only: a guess before it exists (the default city) would
  // fetch the wrong area and then be thrown away.
  const viewportReady = beaconViewport != null;
  const beaconQueryLng = beaconViewport?.lng ?? 0;
  const beaconQueryLat = beaconViewport?.lat ?? 0;
  const beaconQueryRadiusM = beaconViewport?.radiusM ?? 0;

  useEffect(() => {
    // With every place layer off, the layer filter already hides pins; no fetch needed.
    if (!wantsBeaconFetch || !active || !viewportReady) return;
    let cancelled = false;

    const run = async () => {
      const supabase = getSupabaseClient();
      const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
      const headers: HeadersInit = { Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      // The API pages newest first; an area with more beacons than one page would drop the
      // older ones (an event posted a while back). The first page shows at once and the rest
      // fill in behind it, as on iOS. A failed later page keeps what already loaded. Until the
      // last page, pins from the previous view stay (merged), so a pan never blinks events out;
      // the complete answer then replaces them.
      const loaded: MapBeaconRecord[] = [];
      let cursor: string | null = null;
      try {
        for (let page = 0; page < BEACON_MAX_PAGES && !cancelled; page++) {
          const q = new URLSearchParams({
            lat: String(beaconQueryLat),
            lng: String(beaconQueryLng),
            radius_m: String(Math.round(beaconQueryRadiusM)),
            limit: String(BEACON_PAGE_SIZE),
          });
          if (cursor) q.set('cursor', cursor);
          const res = await fetch(`/api/beacons?${q.toString()}`, {
            credentials: 'include',
            headers,
          });
          // Keep the pins already on the map when a refresh fails; do not blank the layer.
          if (!res.ok || cancelled) return;
          const json: unknown = await res.json();
          if (cancelled) return;
          for (const row of rawBeaconRowsFromApiPayload(json)) {
            const beacon = parseMapBeacon(row);
            if (beacon) loaded.push(beacon);
          }
          const next = (json as { next_cursor?: unknown } | null)?.next_cursor;
          cursor = typeof next === 'string' && next ? next : null;
          const sofar = dedupeById(loaded);
          setBeacons(cursor ? (prev) => dedupeById([...prev, ...sofar]) : sofar);
          setBeaconsSettled(true);
          if (!cursor) return;
        }
      } catch {
        /* keep current pins */
      } finally {
        if (!cancelled) setBeaconsSettled(true);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [wantsBeaconFetch, active, viewportReady, beaconQueryLng, beaconQueryLat, beaconQueryRadiusM, beaconAuthEpoch]);

  // Click Places near the view (feature-flagged: a 403/404 simply means no Places layer).
  useEffect(() => {
    if (!layers.places || !active || !viewportReady) return;
    let cancelled = false;
    const run = async () => {
      const supabase = getSupabaseClient();
      const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
      const q = new URLSearchParams({
        lat: String(beaconQueryLat),
        lon: String(beaconQueryLng),
        radius_meters: String(Math.round(Math.min(beaconQueryRadiusM, 25_000))),
      });
      try {
        const res = await fetch(`/api/places/nearby?${q.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { places?: PlaceSummary[] };
        if (!cancelled) setPlaces(Array.isArray(json.places) ? json.places : []);
      } catch {
        /* keep current pins */
      } finally {
        if (!cancelled) setPlacesSettled(true);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [layers.places, active, viewportReady, beaconQueryLng, beaconQueryLat, beaconQueryRadiusM, beaconAuthEpoch]);

  /**
   * DOM pins (spec §7.5) over MapLibre's clustering: rebuilt when tiles or the view settle, never
   * per frame (markers ride the camera on their own). Clicking empty map clears the selection.
   */
  const attachMapInteractions = useCallback((mapInstance: maplibregl.Map) => {
    hideGlPins(mapInstance, CUSTOM_SOURCE_IDS, ['selected-ring']);
    const showTip = (model: PinModel | null, at: { x: number; y: number } | null) => {
      const el = tooltipRef.current;
      if (!el) return;
      if (!model || !at) {
        el.style.opacity = '0';
        return;
      }
      el.textContent = pinLabel(model);
      el.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, calc(-100% - 26px))`;
      el.style.opacity = '1';
    };
    const markers = new MapMarkerLayer(mapInstance, {
      onHover: showTip,
      onSelect: (pin) => {
        showTip(null, null);
        if (pin.kind === 'cluster') {
          const src = mapInstance.getSource(pin.source) as maplibregl.GeoJSONSource | undefined;
          src
            ?.getClusterExpansionZoom(pin.clusterId)
            .then((z) => {
              mapInstance.easeTo({
                center: [pin.lng, pin.lat],
                zoom: z + 0.35,
                duration: 420,
              });
            })
            .catch(() => {});
        } else if (pin.kind === 'person')
          setSelection({
            kind: 'connections',
            ids: pin.connIds,
            lng: pin.lng,
            lat: pin.lat,
          });
        else
          setSelection({
            kind: pin.kind === 'place' ? 'place' : 'beacon',
            id: pin.id,
            lng: pin.lng,
            lat: pin.lat,
          });
      },
    });
    markerLayerRef.current = markers;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        markers.sync(
          collectPins(mapInstance, PIN_SOURCES, {
            connections: connectionsRef.current,
            beacons: beaconsRef.current,
            places: placesRef.current,
            showPeople: layersRef.current.myNetwork,
            nowMs: Date.now(),
          }),
        );
      });
    };
    scheduleSyncRef.current = schedule;
    mapInstance.on('moveend', schedule);
    mapInstance.on('sourcedata', (e) => {
      if (e.isSourceLoaded && e.sourceId && CUSTOM_SOURCE_IDS.includes(e.sourceId)) schedule();
    });
    schedule();
    mapInstance.on('click', () => setSelection(null));
  }, []);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    /** Timer id — typed as number for browser `setTimeout` (avoids NodeJS.Timeout mismatch). */
    let fallbackRevealTimer: number | null = null;

    try {
      const mapInstance = new maplibregl.Map({
        container: mapContainer.current,
        style: mapStyleForTheme(themeRef.current),
        center: mapInitCenterRef.current ?? mapCenter,
        zoom: 12,
        attributionControl: false,
      });

      map.current = mapInstance;

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

        // Click Places: surface plates with a hairline, so they read as places, not people (spec §7.5).
        mapInstance.addSource(SRC_PLACES, { type: 'geojson', data: emptyFc() });
        mapInstance.addLayer({
          id: 'place-unclustered',
          type: 'circle',
          source: SRC_PLACES,
          paint: {
            'circle-color': '#ffffff',
            'circle-radius': 11,
            'circle-stroke-width': ['case', ['==', ['get', 'live'], 1], 3, 1.5],
            'circle-stroke-color': ['case', ['==', ['get', 'live'], 1], FC_PRIMARY, 'rgba(60,60,67,0.45)'],
          },
        });
        mapInstance.addLayer({
          id: 'place-icon',
          type: 'symbol',
          source: SRC_PLACES,
          layout: {
            'text-field': '⌂',
            'text-size': 13,
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: { 'text-color': '#3c3c43' },
        });

        // Selection ring above everything.
        mapInstance.addSource(SRC_SELECTED, {
          type: 'geojson',
          data: emptyFc(),
        });
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
      markerLayerRef.current?.destroy();
      markerLayerRef.current = null;
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      setMapInitialized(false);
      setMapPresentationReady(false);
    };
    // Theme swaps restyle in place (below); the map is never rebuilt for them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachMapInteractions]);

  // Theme changes setStyle in place and carry our sources and layers over, so the camera and
  // pins stay put (AGENTS.md: never remount MapLibre for a theme change).
  useEffect(() => {
    if (themeRef.current === theme) return;
    themeRef.current = theme;
    const m = map.current;
    if (!m) return;
    m.setStyle(mapStyleForTheme(theme), {
      transformStyle: (previous, next) => {
        if (!previous) return next;
        const ours = new Set(CUSTOM_SOURCE_IDS);
        const sources = { ...next.sources };
        for (const id of CUSTOM_SOURCE_IDS) if (previous.sources[id]) sources[id] = previous.sources[id];
        const layers = previous.layers.filter((l) => 'source' in l && typeof l.source === 'string' && ours.has(l.source));
        return { ...next, sources, layers: [...next.layers, ...layers] };
      },
    });
  }, [theme]);

  useEffect(() => {
    const m = map.current;
    if (!m || !mapInitialized) return;
    const src = m.getSource(SRC_CONNECTIONS) as maplibregl.GeoJSONSource | undefined;
    src?.setData({
      type: 'FeatureCollection',
      features: buildConnectionFeatures(positionedConnections),
    });

    const vis = layers.myNetwork ? 'visible' : 'none';
    ['connection-clusters', 'connection-unclustered'].forEach((id) => {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', vis);
    });

    if (!initialFitDoneRef.current && geoConnections.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      geoConnections.forEach((conn) => {
        if (conn.geo_location) bounds.extend([conn.geo_location.longitude, conn.geo_location.latitude]);
      });
      // One spot: center on it at the opening zoom; several: frame them all.
      if (geoConnections.length === 1) m.jumpTo({ center: bounds.getCenter() });
      else m.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
      initialFitDoneRef.current = true;
    }
  }, [mapInitialized, positionedConnections, geoConnections, layers.myNetwork]);

  // Declared after the fit above, so the first viewport read (and the first pin fetch) is of the
  // framed network, not the opening camera.
  useEffect(() => {
    if (!mapInitialized || !map.current) return undefined;
    const m = map.current;
    const syncFromMap = () => {
      const c = m.getCenter();
      setBeaconViewport({
        lng: c.lng,
        lat: c.lat,
        radiusM: radiusMetersFromBounds(m.getBounds()),
      });
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

  useEffect(() => {
    const m = map.current;
    if (!m || !mapInitialized) return;
    const setSrc = (id: string, feats: GeoJSON.Feature[]) => {
      (m.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: feats,
      });
    };
    const visibleBeacons = beacons.filter((beacon) => layers[mapLayerForBeacon(beacon.beacon_type)]);
    setSrc(SRC_OFFICIAL, beaconGeoJsonFeatures(visibleBeacons, 'official'));
    setSrc(SRC_COMMUNITY, beaconGeoJsonFeatures(visibleBeacons, 'community'));
    setSrc(SRC_HAZARDS, beaconGeoJsonFeatures(visibleBeacons, 'hazard'));
  }, [mapInitialized, beacons, layers]);

  useEffect(() => {
    const m = map.current;
    if (!m || !mapInitialized) return;
    (m.getSource(SRC_PLACES) as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: layers.places ? buildPlaceFeatures(places) : [],
    });
  }, [mapInitialized, places, layers.places]);

  // Selection ring follows the selection.
  useEffect(() => {
    const m = map.current;
    if (!m || !mapInitialized) return;
    const src = m.getSource(SRC_SELECTED) as maplibregl.GeoJSONSource | undefined;
    src?.setData(
      selection
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [selection.lng, selection.lat],
                },
                properties: {},
              },
            ],
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
    const resizeObserver = typeof ResizeObserver !== 'undefined' && mapContainer.current ? new ResizeObserver(handleResize) : null;
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
    const within = (lng: number, lat: number) => !viewBounds || viewBounds.contains([lng, lat]);
    const spots = layers.myNetwork ? positionedConnections.filter((p) => within(p.markerLongitude, p.markerLatitude)) : [];
    const pins = beacons.filter((b) => layers[mapLayerForBeacon(b.beacon_type)] && within(b.lng, b.lat));
    return {
      spots: spots.sort((a, b) => b.connection.dateMet.getTime() - a.connection.dateMet.getTime()).slice(0, 60),
      events: pins.filter((b) => b.beacon_type === 'event').slice(0, 60),
      other: pins.filter((b) => b.beacon_type !== 'event').slice(0, 60),
      places: layers.places ? places.filter((p) => within(p.longitude, p.latitude)).slice(0, 60) : [],
    };
  }, [beacons, layers, places, positionedConnections, viewBounds]);

  const focusOn = (sel: MapSelection) => {
    setSelection(sel);
    setListOpenMobile(true);
    map.current?.easeTo({
      center: [sel.lng, sel.lat],
      zoom: Math.max(map.current.getZoom(), 15),
      duration: 480,
    });
  };

  const toggle = (key: keyof MapLayerToggles) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const locate = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        map.current?.easeTo({
          center: [coords.longitude, coords.latitude],
          zoom: 15,
          duration: 600,
        }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  if (mapError) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <EmptyState icon={MapPin} title="The map didn’t load" body="Check your connection and reload the page." />
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
  const selectedBeacon = selection?.kind === 'beacon' ? (beacons.find((b) => b.id === selection.id) ?? null) : null;
  const selectedPlace = selection?.kind === 'place' ? (places.find((p) => p.id === selection.id) ?? null) : null;

  const layerRows: { key: keyof MapLayerToggles; label: string }[] = [
    { key: 'myNetwork', label: 'People I met' },
    { key: 'events', label: 'Events' },
    { key: 'places', label: 'Places' },
    { key: 'socialVibes', label: 'Hangouts' },
    { key: 'soundtracks', label: 'Soundtracks' },
    { key: 'alertsUtilities', label: 'Alerts & utilities' },
    { key: 'other', label: 'Other' },
  ];

  const total = nearbyTotal(inView);
  const nearbyLoading = connectionsLoading || (wantsBeaconFetch && !beaconsSettled) || (layers.places && !placesSettled);

  const panelBody = selection ? (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <MapSelectionPanel
        selection={selection}
        connections={selectedConnections}
        beacon={selectedBeacon}
        place={selectedPlace}
        onClose={() => setSelection(null)}
        onMessage={onConnectionClick}
        onProfile={onOpenProfile ? (c) => c.otherUserId && onOpenProfile(c.otherUserId, c.id) : undefined}
      />
    </div>
  ) : (
    <NearbyList inView={inView} hasGeoConnections={hasGeoConnections} loading={nearbyLoading} onFocus={focusOn} />
  );

  return (
    <div className="relative min-h-[420px] w-full flex-1 overflow-hidden bg-surface-raised" data-testid="connection-map">
      <div
        className={`absolute inset-0 z-10 flex items-center justify-center bg-surface-raised transition-opacity duration-[var(--d-slow)] ${
          mapPresentationReady ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
        aria-hidden={mapPresentationReady}
      >
        <Loader size={44} label="Loading map" />
      </div>

      <div
        ref={mapContainer}
        className={`absolute inset-0 transition-opacity duration-[var(--d-slow)] ${mapPresentationReady ? 'opacity-100' : 'opacity-0'}`}
      />

      <div
        ref={tooltipRef}
        className="type-meta pointer-events-none absolute left-0 top-0 z-[7] whitespace-nowrap rounded-md bg-bg-elevated px-2.5 py-1.5 font-semibold text-fg opacity-0 shadow-overlay transition-opacity duration-100"
        role="tooltip"
        aria-hidden
      />

      {/* Desktop: the Nearby panel floats at the left (spec §7.5). */}
      <aside
        aria-label="Nearby"
        className="absolute bottom-4 left-4 top-4 z-[8] hidden w-[380px] flex-col overflow-hidden rounded-xl bg-bg-elevated shadow-overlay md:flex"
      >
        {panelBody}
      </aside>

      {/* Phones: a bottom panel that peeks at "Nearby · N" and expands. */}
      <div className="absolute inset-x-0 bottom-0 z-[8] flex max-h-[80dvh] flex-col rounded-t-xl bg-bg-elevated shadow-overlay md:hidden">
        <button
          type="button"
          onClick={() => setListOpenMobile((o) => !o)}
          aria-expanded={listOpenMobile || Boolean(selection)}
          className="flex shrink-0 flex-col items-center gap-2 px-4 pb-3 pt-2"
        >
          <span aria-hidden className="h-[5px] w-9 rounded-pill bg-fill-strong" />
          {listOpenMobile || selection ? null : (
            <span className="type-body-strong text-fg">
              Nearby
              {nearbyLoading && total === 0 ? null : (
                <>
                  {' · '}
                  <span className="tabular">{total}</span>
                </>
              )}
            </span>
          )}
        </button>
        {listOpenMobile || selection ? <div className="flex max-h-[60dvh] min-h-0 flex-col">{panelBody}</div> : null}
      </div>

      {mapPresentationReady ? (
        <div className="absolute bottom-[96px] right-4 z-[6] flex flex-col items-end gap-2 md:bottom-4">
          <div className="hidden flex-col gap-2 md:flex">
            <IconButton icon={Plus} variant="glass" aria-label="Zoom in" onClick={() => map.current?.zoomIn()} />
            <IconButton icon={Minus} variant="glass" aria-label="Zoom out" onClick={() => map.current?.zoomOut()} />
          </div>
          <IconButton icon={LocateFixed} variant="glass" aria-label="Show where I am" onClick={locate} />
          <Popover open={layersOpen} onOpenChange={setLayersOpen}>
            <PopoverTrigger asChild>
              <IconButton icon={Layers} variant="glass" aria-label="Map layers" />
            </PopoverTrigger>
            <PopoverContent side="left" align="end" className="w-64 p-1.5">
              <ToggleList>
                {layerRows.map((row) => (
                  <ToggleRow key={row.key} title={row.label} checked={layers[row.key]} onChange={() => toggle(row.key)} />
                ))}
              </ToggleList>
            </PopoverContent>
          </Popover>
          <Link
            href="/events/new"
            aria-label="Create an event"
            className="press flex size-12 items-center justify-center rounded-full bg-action text-on-action shadow-overlay hover:bg-action-hover"
          >
            <Plus size={22} strokeWidth={2.25} aria-hidden />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
