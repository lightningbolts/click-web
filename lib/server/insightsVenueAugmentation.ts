import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConnectionDensity,
  HeatmapZone,
  LiveCount,
  StickyScore,
} from "@/lib/insights/mockData";
import {
  clusterConnectionEncountersForMap,
  type ConnectionEncounterCoordinate,
  type VerifiedConnectionMapNode,
} from "@/lib/insights/connectionEncounterClustering";

type ConnRow = {
  id?: string;
  created?: number | null;
  expiry_state?: string | null;
  last_message_at?: string | null;
  vibe_rating?: number | null;
};

type EncounterRow = {
  connection_id: string;
  location_name: string | null;
  encountered_at: string | null;
  context_tags: string[] | null;
  gps_lat?: number | null;
  gps_lon?: number | null;
};

type NfcAnchor = {
  name: string;
  map_x: number;
  map_y: number;
};

const ZONE_TYPES: HeatmapZone["type"][] = [
  "bar",
  "lounge",
  "dance",
  "stage",
  "entrance",
  "vip",
];

function hashPick<T>(s: string, arr: readonly T[]): T {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

function normalizeZoneLabel(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  return t.length > 0 ? t : "Main floor";
}

function inferCategory(tag: string): "music" | "atmosphere" | "crowd" | "service" | "general" {
  const s = tag.toLowerCase();
  if (/music|dj|band|sound|setlist|karaoke/.test(s)) return "music";
  if (/crowd|busy|queue|line|packed|dance/.test(s)) return "crowd";
  if (/coffee|bar|wait|staff|service|host/.test(s)) return "service";
  if (/vibe|light|temp|air|atmosphere|mood|cozy|chill/.test(s)) return "atmosphere";
  return "general";
}

function inferSentimentFromVibe(rating: number): "positive" | "negative" | "neutral" {
  if (rating >= 4) return "positive";
  if (rating <= 2) return "negative";
  return "neutral";
}

function layoutHeatmapZones(
  counts: Map<string, number>,
  anchors: NfcAnchor[],
): HeatmapZone[] {
  const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, c]) => c), 1);
  const cols = 3;

  return entries.map(([label, count], i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const anchor = anchors.find(
      (a) => a.name.trim().toLowerCase() === label.trim().toLowerCase(),
    );
    let x = col * 32 + 6;
    let y = row * 28 + 8;
    const width = 28;
    const height = 22;

    if (anchor) {
      const ax = anchor.map_x;
      const ay = anchor.map_y;
      const nx = ax <= 1 ? ax * 100 : ax;
      const ny = ay <= 1 ? ay * 100 : ay;
      x = Math.min(85, Math.max(5, nx - 12));
      y = Math.min(80, Math.max(5, ny - 10));
    }

    const intensity = Math.min(1, count / max);
    return {
      id: `zone-${label}-${i}`,
      name: label,
      x,
      y,
      width,
      height,
      connections: count,
      intensity,
      type: hashPick(label, ZONE_TYPES),
    };
  });
}

function fiveMinuteTrend(rows: ConnRow[], windowMs: number): number[] {
  const now = Date.now();
  const start = now - windowMs;
  const bucketMs = Math.max(1, Math.floor(windowMs / 12));
  const trend = new Array(12).fill(0);
  for (const row of rows) {
    const ts =
      typeof row.created === "number"
        ? row.created
        : row.last_message_at
          ? new Date(row.last_message_at).getTime()
          : 0;
    if (!Number.isFinite(ts) || ts < start || ts > now) continue;
    const idx = Math.min(11, Math.floor((ts - start) / bucketMs));
    trend[idx] += 1;
  }
  return trend;
}

export type InsightsVenueAugmentation = {
  heatmapZones: HeatmapZone[];
  vibeMessages: Array<{
    id: string;
    timestamp: string;
    message: string;
    sentiment: "positive" | "negative" | "neutral";
    category: "music" | "atmosphere" | "crowd" | "service" | "general";
    icon?: string;
  }>;
  liveCount: LiveCount;
  connectionDensity: ConnectionDensity;
  stickyScore: StickyScore;
  /** Raw lossless encounter coordinates (never averaged server-side). */
  connectionEncounterCoordinates: ConnectionEncounterCoordinate[];
  /** Client-side centroid nodes grouped by connection_id for map display. */
  verifiedConnectionNodes: VerifiedConnectionMapNode[];
};

/**
 * Aggregated heatmap, vibe stream, and live metrics for a venue manager insights payload.
 */
export async function buildInsightsVenueAugmentation(
  supabase: SupabaseClient,
  venueId: string,
  venueName: string,
  connections: ConnRow[],
): Promise<InsightsVenueAugmentation> {
  const ids = connections
    .map((c) => (typeof c.id === "string" ? c.id : null))
    .filter((id): id is string => Boolean(id));

  const sevenDaysAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();
  const hourMs = 3600000;

  let encounters: EncounterRow[] = [];
  if (ids.length > 0) {
    const { data: encData, error: encErr } = await supabase
      .from("connection_encounters")
      .select("connection_id, location_name, encountered_at, context_tags, gps_lat, gps_lon")
      .in("connection_id", ids)
      .gte("encountered_at", sevenDaysAgoIso)
      .order("encountered_at", { ascending: false })
      .limit(500);

    if (encErr) {
      console.warn("insights augmentation encounters:", encErr.message);
    } else {
      encounters = (encData ?? []) as EncounterRow[];
    }
  }

  const { data: anchorRows } = await supabase
    .from("nfc_anchors")
    .select("name, map_x, map_y")
    .eq("venue_id", venueId);

  const anchors = (anchorRows ?? []) as NfcAnchor[];

  const zoneCounts = new Map<string, number>();
  for (const e of encounters) {
    const label = normalizeZoneLabel(e.location_name);
    zoneCounts.set(label, (zoneCounts.get(label) ?? 0) + 1);
  }
  if (zoneCounts.size === 0) {
    zoneCounts.set(venueName.trim() || "Venue floor", Math.max(1, ids.length));
  }

  const heatmapZones = layoutHeatmapZones(zoneCounts, anchors);

  const vibeMessages: InsightsVenueAugmentation["vibeMessages"] = [];
  const seenKeys = new Set<string>();

  for (const e of encounters) {
    const tags = Array.isArray(e.context_tags) ? e.context_tags : [];
    for (const raw of tags) {
      const tag = String(raw ?? "").trim();
      if (!tag) continue;
      const key = `tag:${tag.toLowerCase()}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const category = inferCategory(tag);
      vibeMessages.push({
        id: `theme-${tag}-${seenKeys.size}`,
        timestamp: e.encountered_at ?? new Date().toISOString(),
        message: `Emerging theme: “${tag.replace(/_/g, " ")}”`,
        sentiment: "neutral",
        category,
      });
      if (vibeMessages.length >= 18) break;
    }
    if (vibeMessages.length >= 18) break;
  }

  const vibeRatings: number[] = [];
  for (const c of connections) {
    const r = c.vibe_rating;
    if (typeof r === "number" && Number.isFinite(r)) vibeRatings.push(r);
  }
  if (vibeRatings.length > 0) {
    const avg =
      vibeRatings.reduce((a, b) => a + b, 0) / vibeRatings.length;
    vibeMessages.unshift({
      id: `vibe-avg-${venueId}`,
      timestamp: new Date().toISOString(),
      message: `Average anonymous vibe check-ins are trending around ${avg.toFixed(1)} / 5.`,
      sentiment: inferSentimentFromVibe(avg),
      category: "atmosphere",
    });
  }

  const now = Date.now();
  const hourAgo = now - hourMs;
  let liveWindow = 0;
  for (const c of connections) {
    const ts =
      typeof c.created === "number"
        ? c.created
        : c.last_message_at
          ? new Date(c.last_message_at).getTime()
          : 0;
    if (ts >= hourAgo && ts <= now) liveWindow += 1;
  }

  const trend = fiveMinuteTrend(connections, hourMs);
  const peak = Math.max(...trend, liveWindow, 1);
  const peakIdx = trend.indexOf(Math.max(...trend));
  const peakMinute = peakIdx * 5;
  const peakTime = `${String(Math.floor(peakMinute / 60)).padStart(2, "0")}:${String(peakMinute % 60).padStart(2, "0")}`;

  const capacity = Math.max(peak * 2, liveWindow + 50, 1);

  const liveCount: LiveCount = {
    current: liveWindow,
    peak,
    peakTime,
    capacity,
    trend,
  };

  const total = connections.length;
  let kept = 0;
  for (const c of connections) {
    if (c.expiry_state === "kept") kept += 1;
  }
  const keptRatio = total > 0 ? kept / total : 0;
  const vibeAvg =
    vibeRatings.length > 0
      ? vibeRatings.reduce((a, b) => a + b, 0) / vibeRatings.length
      : 2.5;

  const score = Math.round(
    Math.min(100, keptRatio * 55 + (vibeAvg / 5) * 45),
  );

  const stickyScore: StickyScore = {
    score,
    trend: "stable",
    change: 0,
    breakdown: {
      repeatVisitors: Math.round(Math.min(100, keptRatio * 100)),
      avgConnectionsPerVisit: Number(
        (total / Math.max(heatmapZones.length, 1)).toFixed(1),
      ),
      communityEngagement: Math.round(
        Math.min(100, keptRatio * 70 + (vibeAvg / 5) * 30),
      ),
    },
  };

  const activeZones = Math.max(heatmapZones.length, 1);
  const totalArea = 2500;
  const densityValue = Number(
    (total / activeZones / (totalArea / 100)).toFixed(2),
  );

  const connectionDensity: ConnectionDensity = {
    value: densityValue,
    totalArea,
    activeZones,
    trend: "stable",
  };

  const connectionEncounterCoordinates: ConnectionEncounterCoordinate[] = [];
  for (const e of encounters) {
    const lat = typeof e.gps_lat === "number" ? e.gps_lat : Number(e.gps_lat);
    const lon = typeof e.gps_lon === "number" ? e.gps_lon : Number(e.gps_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const row: ConnectionEncounterCoordinate = {
      connectionId: String(e.connection_id),
      gpsLat: lat,
      gpsLon: lon,
    };
    if (typeof e.encountered_at === "string" && e.encountered_at.length > 0) {
      row.encounteredAt = e.encountered_at;
    }
    connectionEncounterCoordinates.push(row);
  }

  const verifiedConnectionNodes = clusterConnectionEncountersForMap(connectionEncounterCoordinates);

  return {
    heatmapZones,
    vibeMessages,
    liveCount,
    connectionDensity,
    stickyScore,
    connectionEncounterCoordinates,
    verifiedConnectionNodes,
  };
}
