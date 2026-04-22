/**
 * Map beacon types and helpers (PostGIS rows exposed as JSON from RPC/API).
 */

export const MAP_BEACON_TYPES = [
  "soundtrack",
  "hazard_utility",
  "swag",
  "capacity",
  "recreation",
  "transit",
  "sos",
  "study",
  "hobby",
  "scavenger",
] as const;

export type MapBeaconType = (typeof MAP_BEACON_TYPES)[number];

export type MapBeaconRecord = {
  id: string;
  creator_id: string;
  venue_id: string | null;
  beacon_type: MapBeaconType;
  lat: number;
  lng: number;
  metadata: Record<string, unknown>;
  created_at: string;
  expires_at: string;
};

export type MapLayerToggles = {
  myNetwork: boolean;
  officialSoundtracks: boolean;
  communityBeacons: boolean;
  hazards: boolean;
};

export const DEFAULT_MAP_LAYER_TOGGLES: MapLayerToggles = {
  myNetwork: true,
  officialSoundtracks: true,
  communityBeacons: false,
  hazards: false,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function parseMapBeacon(row: unknown): MapBeaconRecord | null {
  if (!isRecord(row)) return null;
  const id = typeof row.id === "string" ? row.id : null;
  const creator_id = typeof row.creator_id === "string" ? row.creator_id : null;
  const beacon_type = typeof row.beacon_type === "string" ? row.beacon_type : null;
  const lat = typeof row.lat === "number" && Number.isFinite(row.lat) ? row.lat : null;
  const lng = typeof row.lng === "number" && Number.isFinite(row.lng) ? row.lng : null;
  const created_at = typeof row.created_at === "string" ? row.created_at : null;
  const expires_at = typeof row.expires_at === "string" ? row.expires_at : null;
  const metaRaw = row.metadata;
  const metadata = isRecord(metaRaw) ? metaRaw : {};

  if (
    id == null ||
    creator_id == null ||
    beacon_type == null ||
    lat == null ||
    lng == null ||
    created_at == null ||
    expires_at == null
  ) {
    return null;
  }

  if (!MAP_BEACON_TYPES.includes(beacon_type as MapBeaconType)) return null;

  return {
    id,
    creator_id,
    venue_id: typeof row.venue_id === "string" ? row.venue_id : null,
    beacon_type: beacon_type as MapBeaconType,
    lat,
    lng,
    metadata,
    created_at,
    expires_at,
  };
}

export function beaconLayerGroup(
  b: Pick<MapBeaconRecord, "beacon_type" | "metadata">,
): "official" | "community" | "hazard" {
  if (b.beacon_type === "hazard_utility") return "hazard";
  const official =
    b.beacon_type === "soundtrack" && Boolean((b.metadata as { is_official?: unknown }).is_official);
  if (official) return "official";
  return "community";
}

/** Only allow known-safe URI schemes in beacon popup links. */
export function isSafeBeaconUri(uri: string): boolean {
  return /^(spotify:|https?:\/\/)/i.test(uri);
}

export function beaconTint(beaconType: MapBeaconType, group: ReturnType<typeof beaconLayerGroup>): string {
  if (group === "hazard") return "#f97316";
  if (group === "official") return "#22d3ee";
  if (beaconType === "sos") return "#ef4444";
  if (beaconType === "soundtrack") return "#a78bfa";
  return "#34d399";
}

/** GeoJSON point features for MapLibre (clustering layers read `tint`, `title`, `spotify`). */
export function beaconGeoJsonFeatures(
  beacons: MapBeaconRecord[],
  group: "official" | "community" | "hazard",
): GeoJSON.Feature[] {
  return beacons
    .filter((b) => beaconLayerGroup(b) === group)
    .map((b) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [b.lng, b.lat],
      },
      properties: {
        id: b.id,
        beacon_type: b.beacon_type,
        tint: beaconTint(b.beacon_type, group),
        title: String((b.metadata as { label?: unknown }).label ?? b.beacon_type),
        spotify:
          typeof (b.metadata as { spotify_playlist_uri?: unknown }).spotify_playlist_uri === "string" &&
          isSafeBeaconUri((b.metadata as { spotify_playlist_uri: string }).spotify_playlist_uri)
            ? (b.metadata as { spotify_playlist_uri: string }).spotify_playlist_uri
            : "",
      },
    }));
}
