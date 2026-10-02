import type { ConnectionRecord } from '@/components/dashboard/ConnectionTable';
import { connectionRecordToArchiveRow, getArchiveCountdown, isActiveChatListStatus } from './connectionStatus';

export type SavedHomeEvent = {
  beacon_id: string;
  title: string | null;
  event_start_at: string | null;
  event_end_at?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
  location_name: string | null;
  formatted_address?: string | null;
};

export type HomeNudge = {
  id: string;
  nudge_type: string;
  connection_id: string | null;
  beacon_id: string | null;
  headline: string;
  body: string;
  payload: Record<string, unknown>;
};

export function savedEventState(event: SavedHomeEvent, now: number): 'unavailable' | 'past' | 'upcoming' | 'live' {
  if (!Number.isFinite(Date.parse(event.created_at ?? ''))) return 'unavailable';
  const start = Date.parse(event.event_start_at ?? '');
  const end = Date.parse(event.event_end_at ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    const expiry = Date.parse(event.expires_at ?? '');
    return Number.isFinite(expiry) && expiry <= now ? 'past' : 'upcoming';
  }
  if (end <= now) return 'past';
  return start <= now ? 'live' : 'upcoming';
}

export type HomeOpportunity = { kind: 'event'; event: SavedHomeEvent; nearby?: boolean } | { kind: 'nudge'; nudge: HomeNudge } | { kind: 'sayHi'; connection: ConnectionRecord };

export function nudgeConnection(nudge: HomeNudge, connections: ConnectionRecord[]): ConnectionRecord | undefined {
  if (nudge.nudge_type === 'group_revival') {
    return connections.find((c) => c.chatKind === 'group_clique' &&
      ((typeof nudge.payload.group_id === 'string' && c.id === nudge.payload.group_id) ||
       (typeof nudge.payload.chat_id === 'string' && c.groupChatId === nudge.payload.chat_id)));
  }
  return connections.find((c) => c.chatKind !== 'group_clique' && c.id === nudge.connection_id);
}

/** Native HomeFeedModel priority, for sources available without requesting location. */
export function selectHomeOpportunity(events: SavedHomeEvent[], nudges: HomeNudge[], connections: ConnectionRecord[], now: number, nearbyEvents: SavedHomeEvent[] = []): HomeOpportunity | null {
  const saved = events.filter((e) => ['live', 'upcoming'].includes(savedEventState(e, now)) && Date.parse(e.event_end_at ?? '') > Date.parse(e.event_start_at ?? ''))
    .sort((a, b) => Date.parse(a.event_start_at!) - Date.parse(b.event_start_at!));
  const event = saved.find((e) => savedEventState(e, now) === 'live')
    ?? saved.find((e) => new Date(e.event_start_at!).toDateString() === new Date(now).toDateString());
  if (event) return { kind: 'event', event };
  const nearby = nearbyEvents.filter((e) => !events.some((saved) => saved.beacon_id === e.beacon_id) && ['live', 'upcoming'].includes(savedEventState(e, now)) && Date.parse(e.event_end_at ?? '') > Date.parse(e.event_start_at ?? ''))
    .sort((a, b) => Date.parse(a.event_start_at!) - Date.parse(b.event_start_at!));
  const liveNearby = nearby.find((e) => savedEventState(e, now) === 'live');
  if (liveNearby) return { kind: 'event', event: liveNearby, nearby: true };
  for (const kind of ['hangout_confirm', 'shared_upcoming_event', 'wave']) {
    const nudge = nudges.find((n) => n.nudge_type === kind);
    if (nudge) return { kind: 'nudge', nudge };
  }
  const urgent = connections.filter((c) => c.chatKind !== 'group_clique' && isActiveChatListStatus(c.status))
    .map((connection) => ({ connection, countdown: getArchiveCountdown(connectionRecordToArchiveRow(connection), now) }))
    .filter((c) => c.countdown?.kind === 'initial_message' && c.countdown.remainingMs > 0 && c.countdown.remainingMs <= 12 * 3_600_000)
    .sort((a, b) => a.countdown!.deadlineMs - b.countdown!.deadlineMs)[0];
  if (urgent) return { kind: 'sayHi', connection: urgent.connection };
  for (const kind of ['anniversary', 'reconnect_lull', 'memory_prompt', 'group_revival']) {
    const nudge = nudges.find((n) => n.nudge_type === kind);
    if (nudge) return { kind: 'nudge', nudge };
  }
  const todayNearby = nearby.find((e) => new Date(e.event_start_at!).toDateString() === new Date(now).toDateString());
  return todayNearby ? { kind: 'event', event: todayNearby, nearby: true } : null;
}

export function homeGreeting(name: string, now: number): string {
  const hour = new Date(now).getHours();
  const greeting = hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : hour >= 17 && hour < 22 ? 'Good evening' : 'Hello';
  const first = name.trim().split(/\s+/)[0];
  return first ? `${greeting}, ${first}` : greeting;
}
