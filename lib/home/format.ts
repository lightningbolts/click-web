import { dayKey } from './selectOpportunity';

const DAY_MS = 86_400_000;

/** "Today 7:00 PM", "Tomorrow 9:30 AM", "Fri 7:00 PM" (this week), else "Oct 12, 7:00 PM". */
export function formatEventWhen(startAt: string | null, timeZone: string, nowMs: number): string {
  const start = Date.parse(startAt ?? '');
  if (!Number.isFinite(start)) return 'Date to be announced';
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(start);
  const key = dayKey(start, timeZone);
  if (key === dayKey(nowMs, timeZone)) return `Today ${time}`;
  if (key === dayKey(nowMs + DAY_MS, timeZone)) return `Tomorrow ${time}`;
  if (start > nowMs && start - nowMs < 6 * DAY_MS) {
    return `${new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(start)} ${time}`;
  }
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(start);
}

/** Whole hours left, "45m" under an hour. */
export function formatTimeLeft(deadlineMs: number, nowMs: number): string {
  const minutes = Math.max(0, Math.ceil((deadlineMs - nowMs) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

export function formatMonth(monthStart: string): string {
  const [y, m] = monthStart.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, 1));
}

/** "5m", "3h", "2d", else "Oct 3". */
export function formatRelativeShort(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const minutes = Math.max(0, Math.round((nowMs - t) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 7 * 1440) return `${Math.floor(minutes / 1440)}d`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(t);
}
