/**
 * Derives human-readable “moment” metadata from Supabase connection rows
 * (memory_capsule JSON + top-level columns). Used by the web dashboard.
 */

/** Escape text embedded in map popup HTML */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const NOISE_LABELS: Record<string, string> = {
  QUIET: 'Quiet',
  MODERATE: 'Moderate',
  LOUD: 'Loud',
  VERY_LOUD: 'Very loud',
};

/** Stored capsule / DB values for noise tier */
export type NoiseLevelKey = 'QUIET' | 'MODERATE' | 'LOUD' | 'VERY_LOUD';

export function formatNoiseCategory(raw: string): string {
  const key = raw.trim().toUpperCase().replace(/\s+/g, '_');
  return NOISE_LABELS[key] ?? raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

/**
 * Map DB / memory_capsule noise tier to signal-bar count (1 = quiet … 3 = loud / very loud).
 */
export function noiseLevelToBarCount(level: NoiseLevelKey): 1 | 2 | 3 {
  switch (level) {
    case 'QUIET':
      return 1;
    case 'MODERATE':
      return 2;
    case 'LOUD':
    case 'VERY_LOUD':
      return 3;
  }
}

export function normalizeNoiseCategory(conn: Record<string, unknown>): NoiseLevelKey | undefined {
  const capsule = conn.memory_capsule;
  const fromCapsule =
    capsule && typeof capsule === 'object' && capsule !== null && 'noiseLevelCategory' in capsule
      ? (capsule as { noiseLevelCategory?: unknown }).noiseLevelCategory
      : null;

  const raw =
    (typeof fromCapsule === 'string' ? fromCapsule : null) ??
    (typeof conn.noise_level === 'string' ? conn.noise_level : null);

  if (typeof raw !== 'string' || !raw.trim()) {
    return undefined;
  }

  const key = raw.trim().toUpperCase().replace(/\s+/g, '_');
  if (key === 'QUIET' || key === 'MODERATE' || key === 'LOUD' || key === 'VERY_LOUD') {
    return key;
  }
  return undefined;
}

export function extractEventContext(conn: Record<string, unknown>): string | undefined {
  const capsule = conn.memory_capsule;
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

  const id = conn.context_tag_id;
  if (typeof id === 'string' && id.trim()) {
    return id.trim();
  }

  const legacy = conn.context;
  if (typeof legacy === 'string' && legacy.trim()) {
    return legacy.trim();
  }

  return undefined;
}

export function extractWeatherSummary(conn: Record<string, unknown>): string | undefined {
  const capsule = conn.memory_capsule;
  const ws =
    capsule && typeof capsule === 'object' && capsule !== null && 'weatherSnapshot' in capsule
      ? (capsule as { weatherSnapshot?: unknown }).weatherSnapshot
      : null;

  if (ws && typeof ws === 'object' && ws !== null) {
    const condition = (ws as { condition?: unknown }).condition;
    const temp = (ws as { temperatureCelsius?: unknown }).temperatureCelsius;
    const parts: string[] = [];
    if (typeof condition === 'string' && condition.trim()) {
      parts.push(condition.trim());
    }
    if (typeof temp === 'number' && Number.isFinite(temp)) {
      const f = celsiusToFahrenheit(temp);
      parts.push(`${Math.round(f)}°F`);
    }
    if (parts.length > 0) {
      return parts.join(' · ');
    }
  }

  const col = conn.weather_condition;
  if (typeof col === 'string' && col.trim()) {
    return col.trim();
  }

  return undefined;
}

export function extractNoiseSummary(conn: Record<string, unknown>): string | undefined {
  const capsule = conn.memory_capsule;
  const fromCapsule =
    capsule && typeof capsule === 'object' && capsule !== null && 'noiseLevelCategory' in capsule
      ? (capsule as { noiseLevelCategory?: unknown }).noiseLevelCategory
      : null;

  const rawCategory =
    (typeof fromCapsule === 'string' ? fromCapsule : null) ??
    (typeof conn.noise_level === 'string' ? conn.noise_level : null);

  const dbRaw = conn.exact_noise_level_db;
  const db = typeof dbRaw === 'number' && Number.isFinite(dbRaw) ? dbRaw : null;

  const parts: string[] = [];
  if (rawCategory && rawCategory.trim()) {
    parts.push(formatNoiseCategory(rawCategory.trim()));
  }
  if (db !== null) {
    parts.push(`${Math.round(db)} dB`);
  }

  if (parts.length === 0) {
    return undefined;
  }
  return parts.join(' · ');
}
