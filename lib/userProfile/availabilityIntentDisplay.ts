/** Shared formatting for availability intent UI (profile, chat, dashboard). */

const MS_24H = 24 * 60 * 60 * 1000;
const MS_24H_TOLERANCE = 2 * 60 * 60 * 1000;

function humanizeIsoInterval(startMs: number, endMs: number): string {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return '';
  }
  const duration = endMs - startMs;
  if (Math.abs(duration - MS_24H) <= MS_24H_TOLERANCE) {
    return 'Next 24h';
  }
  const endDate = new Date(endMs);
  const nowY = new Date().getFullYear();
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(endDate.getFullYear() !== nowY ? { year: 'numeric' as const } : {}),
  }).format(endDate);
}

/**
 * `timeframe` is either an ISO 8601 interval (`start/end`, UTC) or a legacy token
 * such as `this_week`.
 */
export function humanizeAvailabilityTimeframe(value: string): string {
  const s = value.trim();
  if (!s) return '';

  const slash = s.indexOf('/');
  if (slash > 0 && slash < s.length - 1) {
    const startRaw = s.slice(0, slash).trim();
    const endRaw = s.slice(slash + 1).trim();
    const startMs = Date.parse(startRaw);
    const endMs = Date.parse(endRaw);
    if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
      const label = humanizeIsoInterval(startMs, endMs);
      if (label) {
        return label === 'Next 24h' ? label : `Until ${label}`;
      }
    }
  }

  return s
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Matches primary interest tag pills (UserProfileModal). */
export const AVAILABILITY_INTENT_BUBBLE_CLASS =
  'rounded-full border border-[#3A86FF]/35 bg-[#3A86FF]/10 px-3 py-1 text-xs text-sky-200';

export const SHARED_INTEREST_BUBBLE_CLASS =
  'rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200';

export const INTEREST_TAG_BUBBLE_CLASS =
  'rounded-full border border-[#8338EC]/35 bg-[#8338EC]/10 px-3 py-1 text-xs text-[#c4b5fd]';

export function isIntentSweepExpired(lastIntentUpdateAtIso: string | null | undefined): boolean {
  if (!lastIntentUpdateAtIso?.trim()) return false;
  const t = Date.parse(lastIntentUpdateAtIso);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t >= MS_24H;
}
