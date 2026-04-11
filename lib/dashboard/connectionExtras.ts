/**
 * Derives human-readable “moment” metadata from Supabase connection rows
 * (`connection_encounters` embed + legacy memory_capsule / top-level columns). Used by the web dashboard.
 */

import { latestEncounter } from '@/lib/dashboard/connectionEncounters';

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
  const enc = latestEncounter(conn);
  const fromEncounter = enc?.noiseLevel && typeof enc.noiseLevel === 'string' ? enc.noiseLevel : null;

  const capsule = conn.memory_capsule;
  const fromCapsule =
    capsule && typeof capsule === 'object' && capsule !== null && 'noiseLevelCategory' in capsule
      ? (capsule as { noiseLevelCategory?: unknown }).noiseLevelCategory
      : null;

  const raw =
    (typeof fromEncounter === 'string' ? fromEncounter : null) ??
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
  const enc = latestEncounter(conn);
  if (enc?.contextTags?.length) {
    const t = enc.contextTags.find((x) => x.trim().length > 0);
    if (t) return t.trim();
  }

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
  const enc = latestEncounter(conn);
  const wsEnc = enc?.weatherSnapshot;
  if (wsEnc && typeof wsEnc === 'object' && wsEnc !== null) {
    const condition = (wsEnc as { condition?: unknown }).condition;
    const temp = (wsEnc as { temperatureCelsius?: unknown }).temperatureCelsius;
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
  const enc = latestEncounter(conn);
  const fromEncounterNoise = enc?.noiseLevel;

  const capsule = conn.memory_capsule;
  const fromCapsule =
    capsule && typeof capsule === 'object' && capsule !== null && 'noiseLevelCategory' in capsule
      ? (capsule as { noiseLevelCategory?: unknown }).noiseLevelCategory
      : null;

  const rawCategory =
    (typeof fromEncounterNoise === 'string' ? fromEncounterNoise : null) ??
    (typeof fromCapsule === 'string' ? fromCapsule : null) ??
    (typeof conn.noise_level === 'string' ? conn.noise_level : null);

  const encDbRaw = enc?.exactNoiseLevelDb;
  const encDb = typeof encDbRaw === 'number' && Number.isFinite(encDbRaw) ? encDbRaw : null;
  const dbRaw = conn.exact_noise_level_db;
  const dbLegacyNum =
    typeof dbRaw === 'number' && Number.isFinite(dbRaw)
      ? dbRaw
      : typeof dbRaw === 'string' && dbRaw.trim()
        ? Number(dbRaw.trim())
        : NaN;
  const dbLegacy = Number.isFinite(dbLegacyNum) ? dbLegacyNum : null;
  const db = encDb ?? dbLegacy;

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
