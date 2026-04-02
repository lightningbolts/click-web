/**
 * Types for Advanced Social ROI RPCs (`calculate_vlc`, `calculate_ams`, `calculate_acr`, `calculate_cpr`).
 * Keep in sync with `supabase/migrations/*_advanced_metrics_rpc.sql`.
 */

export type AnchorMagnetismRow = {
  nfc_anchor_id: string;
  name: string;
  connection_count: number;
  total_count: number;
  anchor_retention: number;
  ams_score: number;
};

/** Retention % per noise bucket (0–100), keys may be absent when no data. */
export type AcousticConversionBuckets = {
  quiet?: number;
  moderate?: number;
  loud?: number;
};

/** Weather Resilience Index payload from `calculate_wri`. */
export type WeatherResilienceData = {
  /** Ratio of avg daily connections on adverse-majority days vs fair-majority days. */
  index: number | null;
  avgDailyAdverse: number;
  avgDailyFair: number;
  adverseDays: number;
  fairDays: number;
};

/** Peak Social Velocity from `calculate_psv`. */
export type PeakSocialVelocityData = {
  peakHour: number;
  velocity: number;
  hourlyAverages: number[];
  numDistinctDays: number;
  totalConnections: number;
};

/** Percentile rank (0–100) vs venues with enough volume; from `insights_peer_percentiles` RPC. */
export type PeerPercentiles = {
  cohortSize: number;
  vlc: number | null;
  gcr: number | null;
  psv_velocity: number | null;
  wri: number | null;
};

export type AdvancedMetricsApiResponse = {
  venueId: string;
  venueLoyaltyCoefficient: number;
  anchorMagnetism: AnchorMagnetismRow[];
  acousticConversion: AcousticConversionBuckets;
  crossPollinationRate: number;
  weatherResilience: WeatherResilienceData;
  peakSocialVelocity: PeakSocialVelocityData;
  groupClusteringRate: number;
  /** Present when `insights_peer_percentiles` RPC is available; older deploys may omit. */
  peerPercentiles?: PeerPercentiles | null;
};

export function parseAmsJson(data: unknown): AnchorMagnetismRow[] {
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      nfc_anchor_id: String(r.nfc_anchor_id ?? ""),
      name: String(r.name ?? ""),
      connection_count: Number(r.connection_count ?? 0),
      total_count: Number(r.total_count ?? 0),
      anchor_retention: Number(r.anchor_retention ?? 0),
      ams_score: Number(r.ams_score ?? 0),
    };
  });
}

export function parseAcrJson(data: unknown): AcousticConversionBuckets {
  if (data === null || typeof data !== "object") return {};
  const o = data as Record<string, unknown>;
  const num = (k: string) =>
    o[k] !== undefined && o[k] !== null ? Number(o[k]) : undefined;
  return {
    quiet: num("quiet"),
    moderate: num("moderate"),
    loud: num("loud"),
  };
}

export function parseWriJson(data: unknown): WeatherResilienceData {
  if (data === null || typeof data !== "object") {
    return {
      index: null,
      avgDailyAdverse: 0,
      avgDailyFair: 0,
      adverseDays: 0,
      fairDays: 0,
    };
  }
  const o = data as Record<string, unknown>;
  const idx = o.index;
  return {
    index:
      idx === null || idx === undefined || Number.isNaN(Number(idx))
        ? null
        : Number(idx),
    avgDailyAdverse: Number(o.avg_daily_adverse ?? 0),
    avgDailyFair: Number(o.avg_daily_fair ?? 0),
    adverseDays: Number(o.adverse_days ?? 0),
    fairDays: Number(o.fair_days ?? 0),
  };
}

export function parsePsvJson(data: unknown): PeakSocialVelocityData {
  const empty: PeakSocialVelocityData = {
    peakHour: 0,
    velocity: 0,
    hourlyAverages: Array.from({ length: 24 }, () => 0),
    numDistinctDays: 0,
    totalConnections: 0,
  };
  if (data === null || typeof data !== "object") return empty;
  const o = data as Record<string, unknown>;
  const ha = o.hourly_averages;
  let hourlyAverages: number[] = empty.hourlyAverages;
  if (Array.isArray(ha)) {
    hourlyAverages = ha.map((x) => Number(x));
    while (hourlyAverages.length < 24) hourlyAverages.push(0);
    hourlyAverages = hourlyAverages.slice(0, 24);
  }
  return {
    peakHour: Number(o.peak_hour ?? 0),
    velocity: Number(o.velocity ?? 0),
    hourlyAverages,
    numDistinctDays: Number(o.num_distinct_days ?? 0),
    totalConnections: Number(o.total_connections ?? 0),
  };
}

export function parsePeerPercentiles(data: unknown): PeerPercentiles | null {
  if (data === null || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const optInt = (k: string): number | null => {
    const v = o[k];
    if (v === null || v === undefined) return null;
    const x = Number(v);
    return Number.isFinite(x) ? Math.round(x) : null;
  };
  const cohort = Number(o.cohortSize ?? 0);
  return {
    cohortSize: Number.isFinite(cohort) ? cohort : 0,
    vlc: optInt("vlc"),
    gcr: optInt("gcr"),
    psv_velocity: optInt("psv_velocity"),
    wri: optInt("wri"),
  };
}
