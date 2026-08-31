/**
 * Map beacon types and helpers (PostGIS rows exposed as JSON from RPC/API).
 */

export const MAP_BEACON_TYPES = [
  "soundtrack",
  "hazard",
  "utility",
  "hazard_utility",
  "swag",
  "capacity",
  "recreation",
  "transit",
  "sos",
  "study",
  "hobby",
  "scavenger",
  "event",
] as const;

export type MapBeaconType = (typeof MAP_BEACON_TYPES)[number];

export type BeaconVisibilityAudience = "everyone" | "connections" | "core_connections";

export type MapBeaconRecord = {
  id: string;
  creator_id: string;
  venue_id: string | null;
  hub_id?: string | null;
  beacon_type: MapBeaconType;
  show_creator_name: boolean;
  visibility_audience: BeaconVisibilityAudience;
  lat: number;
  lng: number;
  metadata: Record<string, unknown>;
  created_at: string;
  expires_at: string;
  creator_name?: string | null;
};

const BEACON_TYPE_LABELS: Record<MapBeaconType, string> = {
  soundtrack: "Soundtrack",
  hazard: "Hazard",
  utility: "Utility",
  hazard_utility: "Hazard / utility (legacy)",
  swag: "Swag",
  capacity: "Capacity",
  recreation: "Recreation",
  transit: "Transit",
  sos: "SOS",
  study: "Study",
  hobby: "Hobby",
  scavenger: "Scavenger",
  event: "Event",
};

export function humanizeBeaconType(t: MapBeaconType): string {
  return BEACON_TYPE_LABELS[t] ?? t;
}

function metaStr(meta: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string") {
      const s = v.trim();
      if (s.length > 0) return s;
    }
  }
  return null;
}

/** Map heading for pins and popups (uses enriched soundtrack fields when present). */
export function displayTitleForBeacon(b: MapBeaconRecord): string {
  const m = b.metadata;
  if (b.beacon_type === "soundtrack") {
    const track = metaStr(m, "track_name", "title", "track_title", "name", "track", "label");
    const artist = metaStr(m, "artist_name", "artist", "track_artist");
    if (track && artist) return `${track} — ${artist}`;
    if (track) return track;
  }
  const label = metaStr(m, "label", "title", "name");
  if (label) return label;
  const desc = metaStr(m, "description", "text", "message", "body");
  if (desc) return desc.length > 72 ? `${desc.slice(0, 72)}…` : desc;
  return humanizeBeaconType(b.beacon_type);
}

export type MapLayerToggles = {
  myNetwork: boolean;
  officialSoundtracks: boolean;
  communityBeacons: boolean;
  hazards: boolean;
};

export const DEFAULT_MAP_LAYER_TOGGLES: MapLayerToggles = {
  myNetwork: true,
  officialSoundtracks: true,
  communityBeacons: true,
  hazards: true,
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

  const showCreatorRaw = row.show_creator_name;
  const show_creator_name =
    typeof showCreatorRaw === "boolean"
      ? showCreatorRaw
      : showCreatorRaw === "true" || showCreatorRaw === 1
        ? true
        : false;

  const visRaw = row.visibility_audience;
  let visibility_audience: BeaconVisibilityAudience = "everyone";
  if (typeof visRaw === "string") {
    const v = visRaw.trim().toLowerCase();
    if (v === "connections") visibility_audience = "connections";
    else if (v === "core_connections" || v === "core") visibility_audience = "core_connections";
  }

  const hubFromCol = typeof row.hub_id === "string" && row.hub_id.trim() ? row.hub_id.trim() : null;
  const hubFromMeta =
    typeof metadata.hub_id === "string" && metadata.hub_id.trim() ? metadata.hub_id.trim() : null;

  return {
    id,
    creator_id,
    venue_id: typeof row.venue_id === "string" ? row.venue_id : null,
    hub_id: hubFromCol ?? hubFromMeta,
    beacon_type: beacon_type as MapBeaconType,
    show_creator_name,
    visibility_audience,
    lat,
    lng,
    metadata,
    created_at,
    expires_at,
    creator_name: typeof row.creator_name === "string" ? row.creator_name : null,
  };
}

export function beaconLayerGroup(
  b: Pick<MapBeaconRecord, "beacon_type" | "metadata">,
): "official" | "community" | "hazard" {
  if (b.beacon_type === "hazard" || b.beacon_type === "utility" || b.beacon_type === "hazard_utility") return "hazard";
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
  if (beaconType === "utility") return "#3b82f6";
  if (group === "hazard") return "#f97316";
  if (group === "official") return "#22d3ee";
  if (beaconType === "sos") return "#ef4444";
  if (beaconType === "soundtrack") return "#a78bfa";
  return "#34d399";
}

/** Single Unicode glyph for MapLibre symbol layers (unclustered beacon pins). */
export function beaconUnclusteredIconChar(
  beaconType: MapBeaconType,
  group: ReturnType<typeof beaconLayerGroup>,
): string {
  if (group === "hazard" && beaconType === "utility") return "⚙";
  if (group === "hazard" || beaconType === "hazard_utility") return "⚠";
  if (beaconType === "soundtrack") return "♪";
  if (beaconType === "sos") return "☎";
  if (beaconType === "transit") return "⎋";
  if (beaconType === "study") return "✎";
  if (beaconType === "capacity") return "Ⓒ";
  if (beaconType === "swag") return "★";
  if (beaconType === "scavenger") return "◎";
  if (beaconType === "recreation" || beaconType === "hobby") return "◎";
  return "◆";
}

/** Parses JSON from `GET /api/beacons` (and legacy `/api/map/beacons`) into raw beacon rows. */
export function rawBeaconRowsFromApiPayload(payload: unknown): unknown[] {
  if (payload == null) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload === "string") {
    const t = payload.trim();
    if (t.length === 0) return [];
    try {
      return rawBeaconRowsFromApiPayload(JSON.parse(t) as unknown);
    } catch {
      return [];
    }
  }
  if (typeof payload === "object") {
    const rec = payload as Record<string, unknown>;
    if (Array.isArray(rec.beacons)) return rec.beacons;
    if (Array.isArray(rec.data)) return rec.data;
    if (Array.isArray(rec.rows)) return rec.rows;
    if (Array.isArray(rec.items)) return rec.items;
  }
  return [];
}

/** GeoJSON point features for MapLibre (clustering layers read `beacon_type`; pins read `tint`, `icon_char`, `title`, `spotify`). */
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
        icon_char: beaconUnclusteredIconChar(b.beacon_type, group),
        title: displayTitleForBeacon(b),
        spotify:
          typeof (b.metadata as { spotify_playlist_uri?: unknown }).spotify_playlist_uri === "string" &&
          isSafeBeaconUri((b.metadata as { spotify_playlist_uri: string }).spotify_playlist_uri)
            ? (b.metadata as { spotify_playlist_uri: string }).spotify_playlist_uri
            : "",
      },
    }));
}
