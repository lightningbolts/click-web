/**
 * Inbox row formatting, ported from iOS `Features/Clicks/InboxFormatting.swift` (spec §7.2).
 * Pure functions: every clock read is a parameter so rows render the same on server and client.
 */

const DAY_MS = 86_400_000;

/** Calendar day index of `ms` in `timeZone` (days since epoch, local midnight boundaries). */
function dayIndex(ms: number, timeZone?: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Math.floor(Date.UTC(get('year'), get('month') - 1, get('day')) / DAY_MS);
}

/**
 * WhatsApp-style row timestamp: the time today, "Yesterday", the weekday for 2–6 days ago,
 * otherwise M/D. Future timestamps (clock skew) read as today.
 */
export function inboxTimestamp(
  ms: number,
  nowMs: number,
  options: { timeZone?: string; locale?: string } = {},
): string {
  const { timeZone, locale } = options;
  const days = dayIndex(nowMs, timeZone) - dayIndex(ms, timeZone);
  if (days <= 0) {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(ms);
  }
  if (days === 1) return 'Yesterday';
  if (days <= 6) return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone }).format(ms);
  return new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric', timeZone }).format(ms);
}

/** Remaining time in the 48-hour "say hi" window, e.g. "36h left"; null once it has closed. */
export function sayHiRemaining(deadlineMs: number, nowMs: number): string | null {
  const seconds = (deadlineMs - nowMs) / 1000;
  if (seconds <= 0) return null;
  const hours = Math.ceil(seconds / 3600);
  return hours <= 1 ? '<1h left' : `${hours}h left`;
}

/**
 * Preview line for a row. `latest` is the decrypted one-line label from `inboxPreviewText`
 * (already "Photo", "Voice message", "GIF", "Event: …"); with no messages yet the row says
 * how the Click started, matching iOS.
 */
export function inboxPreview(input: {
  latest: string | null | undefined;
  sayHiOpen: boolean;
  location?: string | null;
  isGroup?: boolean;
}): string {
  const latest = input.latest?.trim();
  if (latest) return latest;
  if (input.isGroup) return 'Verified group · say hi';
  if (input.sayHiOpen) return 'New Click · say hi';
  const place = input.location?.trim();
  if (place) return `Met at ${place}`;
  return 'New Click';
}
