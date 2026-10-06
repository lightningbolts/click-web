import type * as maplibregl from 'maplibre-gl';
import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import type { PlaceSummary } from '@/lib/places/types';

/** Pure geometry for the /map screen (kept out of the component for size and tests). */

export type PositionedConnection = {
  connection: ConnectionRecord;
  markerLongitude: number;
  markerLatitude: number;
  groupedConnections: ConnectionRecord[];
};

const FEET_TO_METERS = 0.3048;
const GROUPING_DISTANCE_METERS = 10 * FEET_TO_METERS;

export const spreadOverlappingConnections = (input: ConnectionRecord[]): PositionedConnection[] => {
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

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
export function radiusMetersFromBounds(bounds: maplibregl.LngLatBounds): number {
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const diag = haversineMeters(sw.lat, sw.lng, ne.lat, ne.lng);
  return Math.min(50_000, Math.max(400, (diag / 2) * 1.28));
}

export function emptyFc() {
  return { type: 'FeatureCollection' as const, features: [] as GeoJSON.Feature[] };
}

/** Click Places as GeoJSON (listed Places only; the API filters). */
export function buildPlaceFeatures(places: PlaceSummary[]): GeoJSON.Feature[] {
  return places.map((p) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [p.longitude, p.latitude] },
    properties: { id: p.id, title: p.name, live: p.pulse.state === 'live' ? 1 : 0 },
  }));
}

export function buildConnectionFeatures(positioned: PositionedConnection[]): GeoJSON.Feature[] {
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

