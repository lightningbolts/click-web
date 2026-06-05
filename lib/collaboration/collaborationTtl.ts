/**
 * Collaboration TTL: 10:00 AM local time on the day after the bump.
 * [offsetMinutes] is the device timezone offset from UTC (east-positive), e.g. -480 for US Pacific.
 */
export function computeCollaborationTtl(offsetMinutes: number, nowUtcMs: number = Date.now()): string {
  const safeOffset = Number.isFinite(offsetMinutes) ? Math.trunc(offsetMinutes) : 0;
  const localNowMs = nowUtcMs + safeOffset * 60_000;
  const localNow = new Date(localNowMs);
  const y = localNow.getUTCFullYear();
  const mo = localNow.getUTCMonth();
  const day = localNow.getUTCDate();
  const targetLocalAsUtc = Date.UTC(y, mo, day + 1, 10, 0, 0, 0);
  const targetUtcMs = targetLocalAsUtc - safeOffset * 60_000;
  return new Date(targetUtcMs).toISOString();
}

/** Squad map drop multiplier window: encounter must be younger than 15 minutes. */
export const COLLABORATION_MAP_DROP_WINDOW_MS = 15 * 60 * 1000;

export const SQUAD_PIN_MULTIPLIER = 2.0;
