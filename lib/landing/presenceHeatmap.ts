/**
 * Public landing heatmap: real handshake GPS, offset by about a block
 * so the browser never receives an address.
 */

export const PRESENCE_HEATMAP_MAX_ZOOM = 18;
export const PRESENCE_JITTER_MIN_M = 90;
export const PRESENCE_JITTER_MAX_M = 140;

export type PresenceHeatmapCell = {
  lng: number;
  lat: number;
  weight: number;
};

export type PresenceHeatmapPayload = {
  cells: PresenceHeatmapCell[];
  generatedAt: string;
};

export const EMPTY_PRESENCE_HEATMAP: PresenceHeatmapPayload = {
  cells: [],
  generatedAt: '',
};

export function parseConnectionLatLng(geo: unknown): { lat: number; lng: number } | null {
  if (!geo || typeof geo !== 'object') return null;
  const record = geo as Record<string, unknown>;
  const rawLat = record.lat ?? record.latitude;
  const rawLng = record.lon ?? record.longitude ?? record.lng ?? record.long;
  const lat = typeof rawLat === 'number' ? rawLat : Number(rawLat);
  const lng = typeof rawLng === 'number' ? rawLng : Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function mix(n: number): number {
  let x = Math.imul(n ^ (n >>> 16), 2246822507);
  x = Math.imul(x ^ (x >>> 13), 3266489909);
  return (x ^ (x >>> 16)) >>> 0;
}

/** Stable ~block offset. Same input always lands in the same place. */
export function privacyJitterPoint(lat: number, lng: number): { lat: number; lng: number } {
  const latKey = Math.round(lat * 1e6);
  const lngKey = Math.round(lng * 1e6);
  const h1 = mix(latKey ^ mix(lngKey));
  const h2 = mix(lngKey ^ mix(latKey + 1));
  const span = PRESENCE_JITTER_MAX_M - PRESENCE_JITTER_MIN_M;
  const meters = PRESENCE_JITTER_MIN_M + (h1 % (span + 1));
  const angle = ((h2 % 3600) / 3600) * Math.PI * 2;
  const dLat = (meters * Math.cos(angle)) / 111_320;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const dLng = (meters * Math.sin(angle)) / (111_320 * Math.max(0.2, cosLat));
  return {
    lat: Number((lat + dLat).toFixed(5)),
    lng: Number((lng + dLng).toFixed(5)),
  };
}

export function toPresenceCells(points: readonly { lat: number; lng: number }[]): PresenceHeatmapCell[] {
  return points.map((point) => {
    const jittered = privacyJitterPoint(point.lat, point.lng);
    return { lat: jittered.lat, lng: jittered.lng, weight: 1 };
  });
}
