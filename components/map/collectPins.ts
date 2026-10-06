import type * as maplibregl from 'maplibre-gl';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { parseEventScheduleFromMetadata } from '@/lib/map/eventSchedule';
import type { MapBeaconRecord } from '@/lib/map/mapBeacons';
import type { PlaceSummary } from '@/lib/places/types';
import { beaconHeroImageUrl } from '@/lib/ui/beaconHeroImageUrl';
import type { PinModel } from './mapMarkers';

export type PinSources = {
  connections: string;
  beacons: readonly string[];
  places: string;
};

export type PinContext = {
  connections: ConnectionRecord[];
  beacons: MapBeaconRecord[];
  places: PlaceSummary[];
  showPeople: boolean;
  nowMs: number;
};

/** Event "live" from its schedule (start ≤ now < end). */
export function beaconIsLive(beacon: MapBeaconRecord, nowMs: number): boolean {
  const s = parseEventScheduleFromMetadata(beacon.metadata);
  return s != null && s.startEpochMs <= nowMs && nowMs < s.endEpochMs;
}

type Feature = { geometry: GeoJSON.Geometry; properties: Record<string, unknown> | null };

function point(f: Feature): [number, number] | null {
  return f.geometry.type === 'Point' ? (f.geometry.coordinates as [number, number]) : null;
}

/**
 * The pins to draw right now: every cluster and point in the sources' loaded tiles, deduped
 * (a point can sit in several tiles) and mapped to marker models with avatars and thumbnails.
 */
export function collectPins(map: Pick<maplibregl.Map, 'querySourceFeatures' | 'getSource'>, sources: PinSources, ctx: PinContext): PinModel[] {
  const out = new Map<string, PinModel>();
  const read = (id: string): Feature[] => (map.getSource(id) ? (map.querySourceFeatures(id) as unknown as Feature[]) : []);
  const connById = new Map(ctx.connections.map((c) => [c.id, c]));
  const beaconById = new Map(ctx.beacons.map((b) => [b.id, b]));
  const placeById = new Map(ctx.places.map((p) => [p.id, p]));

  const cluster = (source: string, f: Feature, count: number, label: string) => {
    const at = point(f);
    const id = Number(f.properties?.cluster_id);
    if (!at || !Number.isFinite(id)) return;
    const key = `${source}:c${id}`;
    out.set(key, { kind: 'cluster', key, lng: at[0], lat: at[1], count, source, clusterId: id, label });
  };

  if (ctx.showPeople) {
    for (const f of read(sources.connections)) {
      const at = point(f);
      if (!at) continue;
      if (f.properties?.cluster_id != null) {
        const people = Number(f.properties.people ?? f.properties.point_count ?? 0);
        cluster(sources.connections, f, people, `${people} people you met here, zoom in`);
        continue;
      }
      const ids = String(f.properties?.connIds ?? '').split(',').filter(Boolean);
      const first = connById.get(ids[0] ?? '');
      if (!first) continue;
      const key = `conn:${ids.join(',')}`;
      out.set(key, {
        kind: 'person',
        key,
        lng: at[0],
        lat: at[1],
        seed: first.otherUserId ?? first.id,
        name: first.name,
        avatarUrl: first.avatarUrl ?? null,
        count: ids.length,
        connIds: ids,
      });
    }
  }

  for (const source of sources.beacons) {
    for (const f of read(source)) {
      const at = point(f);
      if (!at) continue;
      if (f.properties?.cluster_id != null) {
        const n = Number(f.properties.point_count ?? 0);
        cluster(source, f, n, `${n} pins here, zoom in`);
        continue;
      }
      const beacon = beaconById.get(String(f.properties?.id ?? ''));
      if (!beacon) continue;
      const key = `b:${beacon.id}`;
      out.set(
        key,
        beacon.beacon_type === 'event'
          ? {
              kind: 'event',
              key,
              lng: at[0],
              lat: at[1],
              id: beacon.id,
              title: String(f.properties?.title ?? 'Event'),
              imageUrl: beaconHeroImageUrl(beacon.metadata),
              live: beaconIsLive(beacon, ctx.nowMs),
            }
          : {
              kind: 'beacon',
              key,
              lng: at[0],
              lat: at[1],
              id: beacon.id,
              title: String(f.properties?.title ?? ''),
              tint: String(f.properties?.tint ?? 'var(--action)'),
              icon: String(f.properties?.icon_char ?? '•'),
            },
      );
    }
  }

  for (const f of read(sources.places)) {
    const at = point(f);
    const place = placeById.get(String(f.properties?.id ?? ''));
    if (!at || !place) continue;
    const key = `p:${place.id}`;
    out.set(key, {
      kind: 'place',
      key,
      lng: at[0],
      lat: at[1],
      id: place.id,
      title: place.name,
      imageUrl: place.photo_url,
      live: place.pulse.state === 'live',
    });
  }

  // Clusters first (they're the overview), then the rest; the layer caps the total.
  return [...out.values()].sort((a, b) => Number(b.kind === 'cluster') - Number(a.kind === 'cluster'));
}

/** The marker key a map selection corresponds to (to ring the selected pin). */
export function selectionKey(
  selection: { kind: 'connections'; ids: string[] } | { kind: 'beacon' | 'place'; id: string } | null,
): string | null {
  if (!selection) return null;
  if (selection.kind === 'connections') return `conn:${selection.ids.join(',')}`;
  return selection.kind === 'beacon' ? `b:${selection.id}` : `p:${selection.id}`;
}

/**
 * The GL layers keep clustering and tile loading going but draw nothing: circles go transparent
 * and zero-sized, labels hide. Only `keep` (the selection halo) stays visible.
 */
export function hideGlPins(map: maplibregl.Map, sourceIds: readonly string[], keep: readonly string[]): void {
  const ours = new Set(sourceIds);
  for (const layer of map.getStyle().layers ?? []) {
    if (keep.includes(layer.id) || !('source' in layer) || typeof layer.source !== 'string' || !ours.has(layer.source)) continue;
    if (layer.type === 'circle') {
      map.setPaintProperty(layer.id, 'circle-opacity', 0);
      map.setPaintProperty(layer.id, 'circle-stroke-opacity', 0);
      map.setPaintProperty(layer.id, 'circle-radius', 0);
      map.setPaintProperty(layer.id, 'circle-stroke-width', 0);
    } else if (layer.type === 'symbol') {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  }
}
