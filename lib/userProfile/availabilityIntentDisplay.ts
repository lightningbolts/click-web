/** Shared formatting for availability intent UI (profile, chat, dashboard). */

export function humanizeAvailabilityTimeframe(value: string): string {
  const s = value.trim();
  if (!s) return '';
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

const MS_24H = 24 * 60 * 60 * 1000;

export function isIntentSweepExpired(lastIntentUpdateAtIso: string | null | undefined): boolean {
  if (!lastIntentUpdateAtIso?.trim()) return false;
  const t = Date.parse(lastIntentUpdateAtIso);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t >= MS_24H;
}
