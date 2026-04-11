/**
 * Formats `public.connections` rows for the profile “how we met” section.
 * When encounter rows exist, the profile moment is sourced strictly from the origin encounter only.
 */

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
};

export type ProfileOriginEncounter = {
  id: string;
  encounteredAt: string;
  locationName?: string | null;
  displayLocation?: string | null;
  weatherSnapshot?: unknown;
  noiseLevel?: string | null;
  exactNoiseLevelDb?: number | null;
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

export function originEncounter(c: SharedConnectionPayload): ProfileOriginEncounter | undefined {
  const raw = c.connection_encounters;
  if (!Array.isArray(raw)) return undefined;

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
      weatherSnapshot: encounter.weather_snapshot,
      noiseLevel: stringOrNull(encounter.noise_level),
      exactNoiseLevelDb: numberOrNull(encounter.exact_noise_level_db),
      contextTags: Array.isArray(tagsRaw)
        ? tagsRaw
            .filter((tag): tag is string => typeof tag === 'string')
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [],
    });
  }

  return parsed.sort((a, b) => new Date(a.encounteredAt).getTime() - new Date(b.encounteredAt).getTime())[0];
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
  const source = snapshot && typeof snapshot === 'object' ? snapshot : null;
  if (source) {
    const condition = stringOrNull((source as { condition?: unknown }).condition);
    const temp = numberOrNull((source as { temperatureCelsius?: unknown }).temperatureCelsius);
    const parts = [condition ?? undefined, typeof temp === 'number' ? `${Math.round(celsiusToFahrenheit(temp))}°F` : undefined]
      .filter((part): part is string => typeof part === 'string' && part.length > 0);
    if (parts.length > 0) return parts.join(' · ');
  }
  return typeof c.weather_condition === 'string' && c.weather_condition.trim() ? c.weather_condition.trim() : undefined;
}

function extractLegacyNoise(c: SharedConnectionPayload): string | undefined {
  const parts: string[] = [];
  if (typeof c.noise_level === 'string' && c.noise_level.trim()) parts.push(c.noise_level.trim());
  if (typeof c.exact_noise_level_db === 'number' && Number.isFinite(c.exact_noise_level_db)) {
    parts.push(`${Math.round(c.exact_noise_level_db)} dB`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function extractStrictOriginWeather(origin: ProfileOriginEncounter): string | undefined {
  const snapshot = origin.weatherSnapshot;
  if (!snapshot || typeof snapshot !== 'object') return undefined;
  const condition = stringOrNull((snapshot as { condition?: unknown }).condition);
  const temp = numberOrNull((snapshot as { temperatureCelsius?: unknown }).temperatureCelsius);
  const parts = [condition ?? undefined, typeof temp === 'number' ? `${Math.round(celsiusToFahrenheit(temp))}°F` : undefined]
    .filter((part): part is string => typeof part === 'string' && part.length > 0);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function extractStrictOriginNoise(origin: ProfileOriginEncounter): string | undefined {
  const parts: string[] = [];
  if (typeof origin.noiseLevel === 'string' && origin.noiseLevel.trim()) parts.push(origin.noiseLevel.trim());
  if (typeof origin.exactNoiseLevelDb === 'number' && Number.isFinite(origin.exactNoiseLevelDb)) {
    parts.push(`${Math.round(origin.exactNoiseLevelDb)} dB`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function buildProfileConnectionLines(
  c: SharedConnectionPayload,
  strictOriginEncounter: ProfileOriginEncounter | undefined = originEncounter(c),
): ProfileConnectionLines {
  const context =
    strictOriginEncounter != null
      ? strictOriginEncounter.contextTags.find((tag) => tag.trim().length > 0)?.trim()
      : extractLegacyContext(c);
  const place =
    strictOriginEncounter != null
      ? strictOriginEncounter.locationName?.trim() || strictOriginEncounter.displayLocation?.trim() || undefined
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

  const lines: ProfileConnectionLines = {};
  if (context) lines.context = context;
  if (place) lines.place = place;
  if (detail) lines.addressDetail = detail;
  if (when) lines.when = when;
  if (weather) lines.weather = weather;
  if (noise) lines.noise = noise;
  return lines;
}
