import type { HomeNudge } from '@/lib/dashboard/homeFeed';
import type { HomeEvent, HomeOpportunity, HomePerson, HomeSayHi } from './types';

/** Nudge kinds, most important first (mirrors iOS `HomeFeedModel`). */
export const NUDGE_PRIORITY = [
  'hangout_confirm',
  'shared_upcoming_event',
  'wave',
  'anniversary',
  'reconnect_lull',
  'memory_prompt',
  'group_revival',
] as const;

export function eventIsLive(event: Pick<HomeEvent, 'startAt' | 'endAt'>, nowMs: number): boolean {
  const start = Date.parse(event.startAt ?? '');
  const end = Date.parse(event.endAt ?? '');
  return Number.isFinite(start) && Number.isFinite(end) && start <= nowMs && nowMs < end;
}

/** Not over yet: live, or starting later. Events without an end count until 3 h after start. */
export function eventIsUpcomingOrLive(event: Pick<HomeEvent, 'startAt' | 'endAt'>, nowMs: number): boolean {
  const start = Date.parse(event.startAt ?? '');
  if (!Number.isFinite(start)) return false;
  const end = Date.parse(event.endAt ?? '');
  return (Number.isFinite(end) && end > start ? end : start + 3 * 3_600_000) > nowMs;
}

export function dayKey(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}

/**
 * Exactly one promoted item (spec §7.1 ②): a live event you're going to, the new Click with the
 * least time left, today's event, then the highest-priority nudge.
 */
export function selectHomeOpportunity({
  events,
  newClicks,
  nudges,
  people,
  nowMs,
  timeZone,
}: {
  events: HomeEvent[];
  newClicks: HomeSayHi[];
  nudges: HomeNudge[];
  /** Connection id → the other person (for nudge avatars). */
  people: Map<string, HomePerson>;
  nowMs: number;
  timeZone: string;
}): HomeOpportunity | null {
  const committed = events.filter((e) => e.relation !== 'saved');
  const live = committed.find((e) => eventIsLive(e, nowMs));
  if (live) return { kind: 'event', event: live, live: true };

  const urgent = [...newClicks].filter((c) => c.deadlineMs > nowMs).sort((a, b) => a.deadlineMs - b.deadlineMs)[0];
  if (urgent) return { kind: 'sayHi', ...urgent };

  const today = dayKey(nowMs, timeZone);
  const todays = events
    .filter((e) => eventIsUpcomingOrLive(e, nowMs) && dayKey(Date.parse(e.startAt!), timeZone) === today)
    .sort((a, b) => Date.parse(a.startAt!) - Date.parse(b.startAt!))[0];
  if (todays) return { kind: 'event', event: todays, live: eventIsLive(todays, nowMs) };

  for (const kind of NUDGE_PRIORITY) {
    const nudge = nudges.find((n) => n.nudge_type === kind);
    if (nudge) {
      return { kind: 'nudge', nudge, person: nudge.connection_id ? people.get(nudge.connection_id) ?? null : null };
    }
  }
  return null;
}

export function homeGreetingFor(firstName: string, hour: number): string {
  const greeting = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 18 ? 'Good afternoon' : 'Good evening';
  return firstName ? `${greeting}, ${firstName}` : greeting;
}

export function hourIn(ms: number, timeZone: string): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(ms);
  return Number(h) % 24;
}
