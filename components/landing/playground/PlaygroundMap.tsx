'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Layers, Loader2, MapPin } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeProvider';
import { mapStyleForTheme } from '@/lib/theme/mapStyles';
import PinStack, { type OverlayPin } from './PinStack';
import { PLAYGROUND_EVENTS, PLAYGROUND_PEOPLE } from './mockData';
import type { PlaygroundActions, PlaygroundEvent, PlaygroundPerson, PlaygroundState } from './types';

const CLUSTER_METERS = 90;

type Cluster = {
  id: string;
  lng: number;
  lat: number;
  people: PlaygroundPerson[];
  events: PlaygroundEvent[];
};

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function clusterItems(
  people: PlaygroundPerson[],
  events: PlaygroundEvent[],
): Cluster[] {
  type Node =
    | { kind: 'person'; item: PlaygroundPerson; geo: { lat: number; lng: number } }
    | { kind: 'event'; item: PlaygroundEvent; geo: { lat: number; lng: number } };
  const nodes: Node[] = [
    ...people.map((item) => ({ kind: 'person' as const, item, geo: item.geo })),
    ...events.map((item) => ({ kind: 'event' as const, item, geo: item.geo })),
  ];
  const used = new Set<number>();
  const clusters: Cluster[] = [];
  nodes.forEach((node, index) => {
    if (used.has(index)) return;
    const group = [index];
    used.add(index);
    nodes.forEach((other, j) => {
      if (used.has(j)) return;
      if (haversineMeters(node.geo, other.geo) <= CLUSTER_METERS) {
        used.add(j);
        group.push(j);
      }
    });
    const peopleIn: PlaygroundPerson[] = [];
    const eventsIn: PlaygroundEvent[] = [];
    let lat = 0;
    let lng = 0;
    group.forEach((gi) => {
      const n = nodes[gi];
      lat += n.geo.lat;
      lng += n.geo.lng;
      if (n.kind === 'person') peopleIn.push(n.item);
      else eventsIn.push(n.item);
    });
    clusters.push({
      id: group.map((gi) => `${nodes[gi].kind}-${nodes[gi].item.id}`).join('|'),
      lat: lat / group.length,
      lng: lng / group.length,
      people: peopleIn,
      events: eventsIn,
    });
  });
  return clusters;
}

function overlayPinsFor(cluster: Cluster, connectedIds: ReadonlySet<string>): OverlayPin[] {
  const peoplePins: OverlayPin[] = cluster.people.map((p) => ({
    id: p.id,
    kind: 'person',
    initials: p.initials,
  }));
  const attendeePins: OverlayPin[] = [];
  cluster.events.forEach((event) => {
    event.attendeeIds.forEach((id) => {
      if (!connectedIds.has(id)) return;
      if (peoplePins.some((p) => p.id === id) || attendeePins.some((p) => p.id === id)) return;
      const person = PLAYGROUND_PEOPLE.find((p) => p.id === id);
      if (person) {
        attendeePins.push({ id: person.id, kind: 'person', initials: person.initials });
      }
    });
  });
  const eventPins: OverlayPin[] = cluster.events.map((e) => ({
    id: e.id,
    kind: 'event',
    initials: 'E',
  }));
  return [...peoplePins, ...attendeePins, ...eventPins];
}

export default function PlaygroundMap({
  state,
  actions,
  fill = false,
}: {
  state: PlaygroundState;
  actions?: PlaygroundActions;
  fill?: boolean;
}) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const actionsRef = useRef(actions);
  const reprojectRef = useRef<() => void>(() => {});
  const initialFitDoneRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNetwork, setShowNetwork] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [points, setPoints] = useState<Record<string, { x: number; y: number }>>({});

  actionsRef.current = actions;

  const people = useMemo(
    () => (showNetwork ? PLAYGROUND_PEOPLE.filter((p) => state.connectedIds.has(p.id)) : []),
    [state.connectedIds, showNetwork],
  );
  const events = useMemo(
    () => (showEvents ? PLAYGROUND_EVENTS : []),
    [showEvents],
  );
  const clusters = useMemo(() => clusterItems(people, events), [people, events]);

  const selected = clusters.find((c) => c.id === selectedId) ?? null;

  const reproject = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const next: Record<string, { x: number; y: number }> = {};
    clusters.forEach((cluster) => {
      const pt = map.project([cluster.lng, cluster.lat]);
      next[cluster.id] = { x: pt.x, y: pt.y };
    });
    setPoints(next);
  }, [clusters]);
  reprojectRef.current = reproject;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    let fallback: number | null = null;
    const onMove = () => reprojectRef.current();
    try {
      const map = new maplibregl.Map({
        container,
        style: mapStyleForTheme(theme),
        center: [-122.3085, 47.6554],
        zoom: 14.2,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
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
      map.on('error', () => setError('Failed to load map tiles'));
      map.on('move', onMove);
      map.on('zoom', onMove);
    } catch {
      setError('Failed to initialize map');
    }

    return () => {
      if (fallback != null) window.clearTimeout(fallback);
      mapRef.current?.remove();
      mapRef.current = null;
      initialFitDoneRef.current = false;
      setReady(false);
    };
  }, [theme]);

  useEffect(() => {
    if (!ready) return;
    reproject();
  }, [ready, reproject]);

  useEffect(() => {
    if (!ready || selectedId) return;
    const going = clusters.find((c) => c.events.some((e) => state.rsvpIds.has(e.id)));
    if (going) setSelectedId(going.id);
  }, [ready, clusters, selectedId, state.rsvpIds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const bounds = new maplibregl.LngLatBounds();
    let count = 0;
    clusters.forEach((cluster) => {
      bounds.extend([cluster.lng, cluster.lat]);
      count += 1;
    });
    if (count === 0) return;
    map.fitBounds(bounds, {
      padding: 80,
      maxZoom: 14,
      duration: initialFitDoneRef.current ? 400 : 0,
    });
    initialFitDoneRef.current = true;
  }, [ready, clusters]);

  useEffect(() => {
    const onResize = () => {
      mapRef.current?.resize();
      reproject();
    };
    window.addEventListener('resize', onResize);
    const t = window.setTimeout(onResize, 100);
    return () => {
      window.removeEventListener('resize', onResize);
      window.clearTimeout(t);
    };
  }, [ready, reproject]);

  const openCluster = (cluster: Cluster) => {
    setSelectedId(cluster.id);
    const person = cluster.people[0];
    if (person && actionsRef.current && cluster.events.length === 0) {
      /* keep selection; chat is available from overlay */
    }
  };

  if (error) {
    return (
      <div className="rounded-[16px] border border-border-hard bg-surface p-12 text-center">
        <MapPin className="mx-auto mb-3 h-10 w-10 text-error" />
        <p className="font-semibold">Map Error</p>
        <p className="text-sm text-on-surface-variant">{error}</p>
      </div>
    );
  }

  const selectedPoint = selected ? points[selected.id] : null;
  const headline = selected
    ? (selected.events[0]?.title ?? selected.people[0]?.name ?? '')
    : '';
  const subline = selected
    ? selected.events[0]
      ? `${selected.events[0].when} · ${selected.events[0].venue}`
      : (() => {
          const memory = selected.people[0]
            ? (state.memories[selected.people[0].id] ?? selected.people[0].memory)
            : undefined;
          return memory ? `${memory.label} · ${memory.place}` : '';
        })()
    : '';
  const going = selected?.events.some((e) => state.rsvpIds.has(e.id)) ?? false;

  return (
    <div className={`relative overflow-hidden rounded-[16px] border border-border-hard bg-surface-container ${fill ? 'h-full' : 'h-[420px] md:h-[560px]'}`}>
      <div
        className={`absolute inset-0 z-10 flex items-center justify-center bg-surface-container transition-opacity duration-500 ease-out ${
          ready ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
        aria-hidden={ready}
      >
        <div className="text-center">
          <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-on-surface-variant">Loading map...</p>
        </div>
      </div>
      <div
        ref={containerRef}
        className={`absolute inset-0 transition-opacity duration-500 ease-out ${ready ? 'opacity-100' : 'opacity-0'}`}
      />
      {ready
        ? clusters.map((cluster) => {
            const pt = points[cluster.id];
            if (!pt) return null;
            return (
              <button
                key={cluster.id}
                type="button"
                aria-label={
                  cluster.events[0]?.title ?? cluster.people[0]?.name ?? 'Map pin'
                }
                onClick={() => openCluster(cluster)}
                className="absolute z-[5] -translate-x-1/2 -translate-y-1/2"
                style={{ left: pt.x, top: pt.y }}
              >
                <PinStack pins={overlayPinsFor(cluster, state.connectedIds)} />
              </button>
            );
          })
        : null}
      {ready && selected && selectedPoint ? (
        <div
          className="absolute z-[7] flex -translate-x-1/2 -translate-y-full flex-col items-center pb-3"
          style={{ left: selectedPoint.x, top: selectedPoint.y }}
          data-testid="playground-pin-overlay"
        >
          <div
            data-testid="playground-pin-popup-card"
            className="pointer-events-auto min-w-[200px] max-w-[260px] px-3.5 py-3.5 text-left"
            style={{
              color: '#fff',
              background: '#18181b',
              borderRadius: 14,
              border: '1px solid #27272a',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            <p className="text-sm font-bold leading-tight" style={{ color: '#630ed4' }}>
              {headline}
            </p>
            {subline ? (
              <p className="mt-1 text-xs leading-snug" style={{ color: '#a1a1aa' }}>
                {subline}
              </p>
            ) : null}
            {going ? (
              <p className="mt-2 text-xs font-semibold" style={{ color: '#224CFF' }}>
                You&apos;re going
              </p>
            ) : null}
            {selected.people[0] && actions ? (
              <button
                type="button"
                className="mt-2.5 w-full rounded-lg py-1.5 text-center text-xs font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #630ed4, #6520c0)' }}
                onClick={() => {
                  actions.setOpenChatId(selected.people[0].id);
                  actions.setDashboardTab('chat');
                }}
              >
                Chat →
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {ready ? (
        <>
          <div className="absolute left-4 top-4 z-[8] max-w-[220px] rounded-[16px] border border-border-hard bg-surface p-3 text-xs shadow-lg">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <Layers className="h-3.5 w-3.5 text-primary" />
              Map layers
            </div>
            <label className="flex cursor-pointer items-center gap-2 py-1">
              <input
                type="checkbox"
                className="accent-primary"
                checked={showNetwork}
                onChange={() => setShowNetwork((v) => !v)}
                aria-label="My Network"
              />
              My Network
            </label>
            <label className="flex cursor-pointer items-center gap-2 py-1">
              <input
                type="checkbox"
                className="accent-secondary"
                checked={showEvents}
                onChange={() => setShowEvents((v) => !v)}
                aria-label="Events"
              />
              <span className="text-secondary">Events</span>
            </label>
          </div>
          <div className="absolute bottom-4 left-4 z-[8] rounded-xl border border-border-hard bg-surface-container/90 px-4 py-2">
            <span className="text-sm text-on-surface-variant">
              <span className="font-bold text-primary">{people.length}</span> connections
              <span className="mx-1.5">·</span>
              <span className="font-bold text-secondary">{events.length}</span> events
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}
