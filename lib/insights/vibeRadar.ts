/**
 * Vibe Radar — aggregated availability intents near a venue (no user PII).
 */

export type VibeRadarCluster = {
  hex_id: string;
  category: string;
  count: number;
  approx_lng: number;
  approx_lat: number;
};

export type VibeRadarCategoryTotal = {
  category: string;
  count: number;
};

export type VibeRadarApiResponse = {
  clusters: VibeRadarCluster[];
  categoryTotals: VibeRadarCategoryTotal[];
  venueCenter: { lat: number | null; lng: number | null };
  radiusMeters: number;
  status: string;
  venueId?: string;
  message?: string;
};

export type VenuePopUpHubBeacon = {
  id: string;
  venue_id: string;
  perk_description: string;
  category_target: string;
  duration_minutes: number;
  starts_at: string;
  ends_at: string;
  created_at: string;
};

function parseCluster(row: unknown): VibeRadarCluster | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const hex_id = typeof o.hex_id === "string" ? o.hex_id : null;
  const category = typeof o.category === "string" ? o.category : null;
  const count = typeof o.count === "number" && Number.isFinite(o.count) ? o.count : null;
  const approx_lng = typeof o.approx_lng === "number" && Number.isFinite(o.approx_lng) ? o.approx_lng : null;
  const approx_lat = typeof o.approx_lat === "number" && Number.isFinite(o.approx_lat) ? o.approx_lat : null;
  if (hex_id == null || category == null || count == null || approx_lng == null || approx_lat == null) {
    return null;
  }
  return { hex_id, category, count, approx_lng, approx_lat };
}

function parseCategoryTotal(row: unknown): VibeRadarCategoryTotal | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const category = typeof o.category === "string" ? o.category : null;
  const count = typeof o.count === "number" && Number.isFinite(o.count) ? o.count : null;
  if (category == null || count == null) return null;
  return { category, count };
}

/** Normalize JSON from `insights_vibe_radar_data` RPC. */
export function parseVibeRadarRpcPayload(
  raw: unknown,
): Omit<VibeRadarApiResponse, "venueId" | "message"> {
  const empty = {
    clusters: [] as VibeRadarCluster[],
    categoryTotals: [] as VibeRadarCategoryTotal[],
    venueCenter: { lat: null as number | null, lng: null as number | null },
    radiusMeters: 804.67,
    status: "parse_error",
  };

  if (!raw || typeof raw !== "object") {
    return empty;
  }

  const o = raw as Record<string, unknown>;
  const status = typeof o.status === "string" ? o.status : "unknown";
  const radiusMeters =
    typeof o.radiusMeters === "number" && Number.isFinite(o.radiusMeters) ? o.radiusMeters : 804.67;

  let lat: number | null = null;
  let lng: number | null = null;
  const vc = o.venueCenter;
  if (vc && typeof vc === "object") {
    const c = vc as Record<string, unknown>;
    if (typeof c.lat === "number" && Number.isFinite(c.lat)) lat = c.lat;
    if (typeof c.lng === "number" && Number.isFinite(c.lng)) lng = c.lng;
  }

  const clustersRaw = Array.isArray(o.clusters) ? o.clusters : [];
  const totalsRaw = Array.isArray(o.categoryTotals) ? o.categoryTotals : [];

  return {
    clusters: clustersRaw.map(parseCluster).filter((x): x is VibeRadarCluster => x != null),
    categoryTotals: totalsRaw.map(parseCategoryTotal).filter((x): x is VibeRadarCategoryTotal => x != null),
    venueCenter: { lat, lng },
    radiusMeters,
    status,
  };
}

const DEMO_CENTER = { lat: 47.6062, lng: -122.3321 };

/** Deterministic accent for intent category labels (heatmap / circles). */
export function vibeCategoryColor(category: string): string {
  const palette = [
    "#8338EC",
    "#3A86FF",
    "#FF3864",
    "#FFD93D",
    "#06D6A0",
    "#FF6B6B",
  ];
  let h = 0;
  for (let i = 0; i < category.length; i++) {
    h = category.charCodeAt(i) + ((h << 5) - h);
  }
  return palette[Math.abs(h) % palette.length];
}

/** Sample payload for demo mode — synthetic cells around Seattle center. */
export function demoVibeRadarResponse(): Omit<VibeRadarApiResponse, "venueId"> {
  const { lat, lng } = DEMO_CENTER;
  const clusters: VibeRadarCluster[] = [
    {
      hex_id: "8a2a1072b59ffff",
      category: "Coffee",
      count: 42,
      approx_lng: lng + 0.008,
      approx_lat: lat + 0.004,
    },
    {
      hex_id: "8a2a1072b597fff",
      category: "Live Music",
      count: 78,
      approx_lng: lng - 0.006,
      approx_lat: lat + 0.007,
    },
    {
      hex_id: "8a2a1072b5a7fff",
      category: "Drinks",
      count: 150,
      approx_lng: lng + 0.003,
      approx_lat: lat - 0.005,
    },
    {
      hex_id: "8a2a1072b593fff",
      category: "Quiet work",
      count: 28,
      approx_lng: lng - 0.01,
      approx_lat: lat - 0.003,
    },
  ];
  const categoryTotals: VibeRadarCategoryTotal[] = [
    { category: "Drinks", count: 150 },
    { category: "Live Music", count: 78 },
    { category: "Coffee", count: 42 },
    { category: "Quiet work", count: 28 },
  ];
  return {
    clusters,
    categoryTotals,
    venueCenter: DEMO_CENTER,
    radiusMeters: 804.67,
    status: "ok",
  };
}
