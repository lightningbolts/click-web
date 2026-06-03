import type { TemporalBlock } from '@/lib/enrichment/vibeCaptureSchema';

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Approximate timezone offset (hours east of UTC) from longitude.
 * 15° longitude ≈ 1 hour; rounded to nearest half-hour for stability.
 */
export function longitudeToUtcOffsetHours(lon: number): number {
  const raw = lon / 15;
  return Math.round(raw * 2) / 2;
}

export type LocalEncounterTime = {
  /** UTC instant */
  utc: Date;
  /** Offset hours applied (east-positive) */
  offsetHours: number;
  /** Local calendar parts after offset */
  localHour: number;
  localMinute: number;
  dayOfWeek: number; // 0 = Sunday
  dayName: string;
};

export function toLocalEncounterTime(utcIso: string, lon: number): LocalEncounterTime | null {
  const utc = new Date(utcIso);
  if (Number.isNaN(utc.getTime())) return null;

  const offsetHours = longitudeToUtcOffsetHours(lon);
  const localMs = utc.getTime() + offsetHours * MS_PER_HOUR;
  const local = new Date(localMs);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = local.getUTCDay();

  return {
    utc,
    offsetHours,
    localHour: local.getUTCHours(),
    localMinute: local.getUTCMinutes(),
    dayOfWeek,
    dayName: dayNames[dayOfWeek] ?? 'Unknown',
  };
}

/**
 * Maps local clock time to temporal cadence blocks (inclusive start, exclusive end except 23:59).
 */
export function classifyTemporalBlock(localHour: number, localMinute: number): TemporalBlock {
  const minutes = localHour * 60 + localMinute;

  if (minutes >= 6 * 60 && minutes < 9 * 60) return 'Morning Routine';
  if (minutes >= 9 * 60 && minutes < 12 * 60) return 'Mid-Morning Hub';
  if (minutes >= 12 * 60 && minutes < 14 * 60) return 'Lunch Hour';
  if (minutes >= 14 * 60 && minutes < 17 * 60) return 'Afternoon Grind';
  if (minutes >= 17 * 60 && minutes < 20 * 60) return 'Post-Work / Dinner Vibe';
  if (minutes >= 20 * 60) return 'Late Night Wind Down';
  if (minutes < 4 * 60) return 'After Hours';
  return 'Dawn Patrol';
}
