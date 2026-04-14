/**
 * Formats `public.connections` rows for the profile “when you connected” section.
 * When encounter rows exist, the profile moment aligns with the **most recent** crossing
 * (same ordering as the first entry in “Our timeline”).
 */

import { formatDetailedEncounterLocation } from '@/lib/location/detailedEncounterLocation';

export type SharedConnectionPayload = {
  id: string;
  created: number;
  created_utc?: string | null;
  time_of_day_utc?: string | null;
  semantic_location?: string | null;
  full_location?: Record<string, unknown> | null;
  geo_location?: Record<string, unknown> | null;
  weather_condition?: string | null;
  noise_level?: string | null;
  exact_noise_level_db?: number | null;
  memory_capsule?: unknown;
  context_tag_id?: string | null;
  last_message_at?: number | null;
  connection_encounters?: unknown;
};

export type ProfileConnectionLines = {
  /** Event / tag (e.g. emoji + label from memory_capsule). */
  context?: string;
  /** Human place name. */
  place?: string;
  /** Structured address when distinct from [place]. */
  addressDetail?: string;
  when?: string;
  weather?: string;
  noise?: string;
  /** Barometric floor / height context from the origin encounter. */
  elevation?: string;
};

export type ProfileOriginEncounter = {
  id: string;
  encounteredAt: string;
  locationName?: string | null;
  displayLocation?: string | null;
  /** Raw `semantic_location` from `connection_encounters` (jsonb or string). */
  semanticLocation?: unknown;
  weatherSnapshot?: unknown;
  noiseLevel?: string | null;
  exactNoiseLevelDb?: number | null;
  elevationCategory?: string | null;
  exactBarometricElevationM?: number | null;
  contextTags: string[];
};

function asRecord(c: SharedConnectionPayload): Record<string, unknown> {
  return { ...c, memory_capsule: c.memory_capsule ?? undefined };
}

function stringOrNull(v: unknown): string | null | undefined {
  if (v == null) return v as null | undefined;
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}

function numberOrNull(v: unknown): number | null | undefined {
  if (v == null) return v as null | undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

const WEATHER_STRINGIFY_MAX_DEPTH = 8;

/**
 * Unwraps `weather_snapshot` values that may be jsonb objects, stringified JSON,
 * or legacy double-encoded JSON strings (matches mobile WeatherSnapshot parsing).
 */
export function normalizeWeatherSnapshot(raw: unknown): Record<string, unknown> | null {
  let cur: unknown = raw;
  for (let d = 0; d < WEATHER_STRINGIFY_MAX_DEPTH; d++) {
    if (cur == null) return null;
    if (typeof cur === 'string') {
      const t = cur.trim();
      if (!t) return null;
      try {
        cur = JSON.parse(t) as unknown;
      } catch {
        return null;
      }
      continue;
    }
    if (typeof cur === 'object' && cur !== null && !Array.isArray(cur)) {
      return cur as Record<string, unknown>;
    }
    return null;
  }
  return null;
}

function windCompassAbbrev(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const x = ((deg % 360) + 360) % 360;
  const idx = (Math.floor((x + 22.5) / 45) % 8 + 8) % 8;
  return dirs[idx];
}

function titleCaseWords(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function prettyNoiseCategoryKey(raw: string): string {
  const k = raw.trim().toUpperCase().replace(/\s+/g, '_');
  const map: Record<string, string> = {
    VERY_QUIET: 'Very quiet',
    QUIET: 'Quiet',
    MODERATE: 'Moderate',
    LOUD: 'Loud',
    VERY_LOUD: 'Very loud',
  };
  return map[k] ?? titleCaseWords(raw.replace(/_/g, ' '));
}

export function prettyElevationCategoryKey(raw: string): string {
  const k = raw.trim().toUpperCase().replace(/\s+/g, '_');
  const map: Record<string, string> = {
    BELOW_GROUND: 'Below ground',
    GROUND_LEVEL: 'Ground level',
    ELEVATED: 'Elevated',
    HIGH_RISE: 'High rise',
  };
  return map[k] ?? titleCaseWords(raw.replace(/_/g, ' '));
}

function formatWeatherRecord(ws: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  const condition =
    typeof ws.condition === 'string' && ws.condition.trim() ? ws.condition.trim() : undefined;
  const iconCode =
    typeof ws.iconCode === 'string' && ws.iconCode.trim() ? ws.iconCode.trim() : undefined;
  if (condition) parts.push(condition);
  else if (iconCode) parts.push(iconCode.charAt(0).toUpperCase() + iconCode.slice(1));

  const temp = numberOrNull(ws.temperatureCelsius);
  if (typeof temp === 'number') {
    const f = Math.round(celsiusToFahrenheit(temp));
    parts.push(`${f}°F (${Math.round(temp)}°C)`);
  }
  const windKph = numberOrNull(ws.windSpeedKph);
  if (typeof windKph === 'number') {
    const deg = numberOrNull(ws.windDirectionDegrees);
    let suffix = '';
    if (typeof deg === 'number' && Number.isFinite(deg) && deg >= 0 && deg <= 359) {
      suffix = ` ${windCompassAbbrev(deg)}`;
    }
    parts.push(`${Math.round(windKph)} km/h${suffix}`);
  }
  const p = numberOrNull(ws.pressureMslHpa);
  if (typeof p === 'number') parts.push(`${Math.round(p)} hPa`);

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function formatFullLocation(full: Record<string, unknown> | null | undefined): string {
  if (!full || typeof full !== 'object') return '';
  const o = full as Record<string, unknown>;
  const dn = o.display_name ?? o.displayName;
  const formatted = o.formatted;
  if (typeof dn === 'string' && dn.trim()) return dn.trim();
  if (typeof formatted === 'string' && formatted.trim()) return formatted.trim();
  const parts = [o.road, o.neighbourhood, o.city, o.town, o.state, o.country]
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean);
  return parts.length ? parts.join(', ') : '';
}

function parseEncounterPayloads(raw: unknown): ProfileOriginEncounter[] {
  if (!Array.isArray(raw)) return [];

  const parsed: ProfileOriginEncounter[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const encounter = item as Record<string, unknown>;
    const id = typeof encounter.id === 'string' ? encounter.id.trim() : '';
    const encounteredAt =
      typeof encounter.encountered_at === 'string' ? encounter.encountered_at.trim() : '';
    if (!id || !encounteredAt) continue;
    const tagsRaw = encounter.context_tags;
    parsed.push({
      id,
      encounteredAt,
      locationName: stringOrNull(encounter.location_name),
      displayLocation: stringOrNull(encounter.display_location),
      semanticLocation: encounter.semantic_location,
      weatherSnapshot: encounter.weather_snapshot,
      noiseLevel: stringOrNull(encounter.noise_level),
      exactNoiseLevelDb: numberOrNull(encounter.exact_noise_level_db),
      elevationCategory: stringOrNull(encounter.elevation_category),
      exactBarometricElevationM: numberOrNull(encounter.exact_barometric_elevation_m),
      contextTags: Array.isArray(tagsRaw)
        ? tagsRaw
            .filter((tag): tag is string => typeof tag === 'string')
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [],
    });
  }

  return parsed.sort((a, b) => new Date(a.encounteredAt).getTime() - new Date(b.encounteredAt).getTime());
}

/** Chronologically first crossing (for “where it started” badges). */
export function originEncounter(c: SharedConnectionPayload): ProfileOriginEncounter | undefined {
  const asc = parseEncounterPayloads(c.connection_encounters);
  return asc.length > 0 ? asc[0] : undefined;
}

/** Most recent crossing — matches the first row in newest-first encounter timelines. */
export function latestEncounterFromPayload(c: SharedConnectionPayload): ProfileOriginEncounter | undefined {
  const asc = parseEncounterPayloads(c.connection_encounters);
  return asc.length > 0 ? asc[asc.length - 1] : undefined;
}

/** Local calendar date + clock time only (no raw UTC bucket / GPS). */
export function formatProfileWhenLine(
  c: SharedConnectionPayload,
  strictOriginEncounter?: ProfileOriginEncounter,
): string | undefined {
  const iso =
    typeof strictOriginEncounter?.encounteredAt === 'string' && strictOriginEncounter.encounteredAt.trim()
      ? strictOriginEncounter.encounteredAt.trim()
      : typeof c.created_utc === 'string' && c.created_utc.trim()
        ? c.created_utc.trim()
        : null;
  const ms = typeof c.created === 'number' && Number.isFinite(c.created) ? c.created : null;
  let d: Date | null = null;
  if (iso) {
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  }
  if (!d && ms != null) {
    d = new Date(ms);
    if (Number.isNaN(d.getTime())) d = null;
  }
  if (!d) return undefined;
  const datePart = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
  const timePart = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
  return `${datePart} · ${timePart}`;
}

function extractLegacyContext(c: SharedConnectionPayload): string | undefined {
  const raw = asRecord(c);
  const capsule = raw.memory_capsule;
  if (capsule && typeof capsule === 'object' && capsule !== null && 'contextTag' in capsule) {
    const tag = (capsule as { contextTag?: unknown }).contextTag;
    if (tag && typeof tag === 'object' && tag !== null && 'label' in tag) {
      const label = String((tag as { label?: unknown }).label ?? '').trim();
      if (!label) return undefined;
      const emojiRaw = (tag as { emoji?: unknown }).emoji;
      const emoji = typeof emojiRaw === 'string' && emojiRaw.trim() ? `${emojiRaw.trim()} ` : '';
      return `${emoji}${label}`.trim();
    }
  }
  return typeof c.context_tag_id === 'string' && c.context_tag_id.trim() ? c.context_tag_id.trim() : undefined;
}

function extractLegacyWeather(c: SharedConnectionPayload): string | undefined {
  const capsule = c.memory_capsule;
  const snapshot =
    capsule && typeof capsule === 'object' && capsule !== null && 'weatherSnapshot' in capsule
      ? (capsule as { weatherSnapshot?: unknown }).weatherSnapshot
      : null;
  const normalized = normalizeWeatherSnapshot(snapshot);
  if (normalized) {
    const line = formatWeatherRecord(normalized);
    if (line) return line;
  }
  return typeof c.weather_condition === 'string' && c.weather_condition.trim() ? c.weather_condition.trim() : undefined;
}

function extractLegacyNoise(c: SharedConnectionPayload): string | undefined {
  const parts: string[] = [];
  if (typeof c.noise_level === 'string' && c.noise_level.trim()) {
    parts.push(prettyNoiseCategoryKey(c.noise_level.trim()));
  }
  if (typeof c.exact_noise_level_db === 'number' && Number.isFinite(c.exact_noise_level_db)) {
    parts.push(`${Math.round(c.exact_noise_level_db)} dB`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function extractStrictOriginWeather(origin: ProfileOriginEncounter): string | undefined {
  const ws = normalizeWeatherSnapshot(origin.weatherSnapshot);
  if (!ws) return undefined;
  return formatWeatherRecord(ws);
}

function extractStrictOriginNoise(origin: ProfileOriginEncounter): string | undefined {
  const parts: string[] = [];
  if (typeof origin.noiseLevel === 'string' && origin.noiseLevel.trim()) {
    parts.push(prettyNoiseCategoryKey(origin.noiseLevel.trim()));
  }
  if (typeof origin.exactNoiseLevelDb === 'number' && Number.isFinite(origin.exactNoiseLevelDb)) {
    parts.push(`${Math.round(origin.exactNoiseLevelDb)} dB`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function extractStrictOriginElevation(origin: ProfileOriginEncounter): string | undefined {
  const parts: string[] = [];
  if (typeof origin.elevationCategory === 'string' && origin.elevationCategory.trim()) {
    parts.push(prettyElevationCategoryKey(origin.elevationCategory.trim()));
  }
  const m = origin.exactBarometricElevationM;
  if (typeof m === 'number' && Number.isFinite(m)) parts.push(`${Math.round(m)} m`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function buildProfileConnectionLines(
  c: SharedConnectionPayload,
  /** Defaults to the latest encounter so the summary matches the top of the encounter timeline. */
  strictOriginEncounter: ProfileOriginEncounter | undefined = latestEncounterFromPayload(c),
): ProfileConnectionLines {
  const context =
    strictOriginEncounter != null
      ? strictOriginEncounter.contextTags.find((tag) => tag.trim().length > 0)?.trim()
      : extractLegacyContext(c);
  const place =
    strictOriginEncounter != null
      ? formatDetailedEncounterLocation({
          locationName: strictOriginEncounter.locationName,
          displayLocation: strictOriginEncounter.displayLocation,
          semanticLocation: strictOriginEncounter.semanticLocation,
        })
      : (typeof c.semantic_location === 'string' && c.semantic_location.trim()) || formatFullLocation(c.full_location ?? undefined) || undefined;
  const detail =
    strictOriginEncounter != null
      ? undefined
      : (() => {
          const semantic = typeof c.semantic_location === 'string' ? c.semantic_location.trim() : '';
          const addressDetail = formatFullLocation(c.full_location ?? undefined);
          return semantic && addressDetail && semantic !== addressDetail ? addressDetail : undefined;
        })();
  const when = formatProfileWhenLine(c, strictOriginEncounter);
  const weather =
    strictOriginEncounter != null ? extractStrictOriginWeather(strictOriginEncounter) : extractLegacyWeather(c);
  const noise =
    strictOriginEncounter != null ? extractStrictOriginNoise(strictOriginEncounter) : extractLegacyNoise(c);
  const elevation =
    strictOriginEncounter != null ? extractStrictOriginElevation(strictOriginEncounter) : undefined;

  const lines: ProfileConnectionLines = {};
  if (context) lines.context = context;
  if (place) lines.place = place;
  if (detail) lines.addressDetail = detail;
  if (when) lines.when = when;
  if (weather) lines.weather = weather;
  if (noise) lines.noise = noise;
  if (elevation) lines.elevation = elevation;
  return lines;
}
