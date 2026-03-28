/**
 * Formats `public.connections` rows for the profile “how we met” section.
 * Aligns with `lib/dashboard/connectionExtras.ts` (memory_capsule + columns).
 */

import {
  extractEventContext,
  extractNoiseSummary,
  extractWeatherSummary,
} from '@/lib/dashboard/connectionExtras';

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
};

export type ProfileConnectionLines = {
  /** Event / tag (e.g. emoji + label from memory_capsule). */
  context?: string;
  /** Human place name. */
  place?: string;
  /** Structured address when distinct from [place]. */
  addressDetail?: string;
  /** Lat/lon fallback. */
  geoHint?: string;
  when?: string;
  weather?: string;
  noise?: string;
};

function asRecord(c: SharedConnectionPayload): Record<string, unknown> {
  return { ...c, memory_capsule: c.memory_capsule ?? undefined };
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

export function formatProfileGeoHint(c: SharedConnectionPayload): string | undefined {
  const g = c.geo_location;
  if (!g || typeof g !== 'object') return undefined;
  const lat = (g as { lat?: unknown; latitude?: unknown }).lat ?? (g as { latitude?: unknown }).latitude;
  const lon =
    (g as { lon?: unknown; lng?: unknown; longitude?: unknown }).lon ??
    (g as { longitude?: unknown }).longitude ??
    (g as { lng?: unknown }).lng;
  const la = typeof lat === 'number' ? lat : Number(lat);
  const lo = typeof lon === 'number' ? lon : Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || (la === 0 && lo === 0)) return undefined;
  return `${la.toFixed(4)}°, ${lo.toFixed(4)}°`;
}

export function formatProfileWhenLine(c: SharedConnectionPayload): string | undefined {
  const iso = typeof c.created_utc === 'string' && c.created_utc.trim() ? c.created_utc.trim() : null;
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
  const tod = typeof c.time_of_day_utc === 'string' ? c.time_of_day_utc.trim() : '';
  const bits = [datePart, timePart];
  if (tod) bits.push(tod.replace(/_/g, ' '));
  return bits.join(' · ');
}

export function buildProfileConnectionLines(c: SharedConnectionPayload): ProfileConnectionLines {
  const raw = asRecord(c);
  const context = extractEventContext(raw);
  const semantic = typeof c.semantic_location === 'string' ? c.semantic_location.trim() : '';
  const addressDetail = formatFullLocation(c.full_location ?? undefined);
  const geoHint = formatProfileGeoHint(c);

  let place = semantic || addressDetail;
  let detail = '';
  if (semantic && addressDetail && semantic !== addressDetail) {
    place = semantic;
    detail = addressDetail;
  } else if (!place && geoHint) {
    place = 'Coordinates';
  }

  const when = formatProfileWhenLine(c);
  const weather = extractWeatherSummary(raw);
  const noise = extractNoiseSummary(raw);

  const lines: ProfileConnectionLines = {};
  if (context) lines.context = context;
  if (place) lines.place = place;
  if (detail) lines.addressDetail = detail;
  if (geoHint && (semantic || addressDetail || context)) lines.geoHint = geoHint;
  else if (geoHint && !place) {
    lines.place = 'Meeting point';
    lines.geoHint = geoHint;
  }
  if (when) lines.when = when;
  if (weather) lines.weather = weather;
  if (noise) lines.noise = noise;
  return lines;
}
