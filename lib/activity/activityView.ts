export type ActivityKind = 'reaction' | 'connection' | 'event' | 'wave' | 'streak' | 'other';

/** The 20 px badge on a row's avatar (spec §7.9), from the item type. */
export function activityKind(type: string): ActivityKind {
  if (type === 'reaction') return 'reaction';
  if (type === 'wave') return 'wave';
  if (type === 'new_connection' || type.startsWith('prior_connection') || type === 'availability_match') return 'connection';
  if (type.startsWith('event') || type === 'friends_going' || type === 'shared_upcoming_event') return 'event';
  if (type.includes('streak') || type.includes('moment') || type === 'reconnect_nudge') return 'streak';
  return 'other';
}

export type ActivityGroupKey = 'new' | 'today' | 'yesterday' | 'week' | 'earlier';

const TITLES: Record<ActivityGroupKey, string> = {
  new: 'New',
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'This week',
  earlier: 'Earlier',
};

function dayKey(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}

/**
 * New (after the seen mark) / Today / Yesterday / This week / Earlier (spec §7.9), newest first,
 * days in the viewer's zone. Empty groups are left out.
 */
export function groupActivity<T extends { created_at: string }>(
  items: readonly T[],
  { seenAt, nowMs, timeZone }: { seenAt: string | null; nowMs: number; timeZone: string },
): { key: ActivityGroupKey; title: string; items: T[] }[] {
  const seenMs = seenAt ? Date.parse(seenAt) : Number.NEGATIVE_INFINITY;
  const today = dayKey(nowMs, timeZone);
  const yesterday = dayKey(nowMs - 86_400_000, timeZone);
  const groups = new Map<ActivityGroupKey, T[]>();
  for (const item of items) {
    const ms = Date.parse(item.created_at);
    const key: ActivityGroupKey =
      ms > seenMs
        ? 'new'
        : dayKey(ms, timeZone) === today
          ? 'today'
          : dayKey(ms, timeZone) === yesterday
            ? 'yesterday'
            : nowMs - ms < 7 * 86_400_000
              ? 'week'
              : 'earlier';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return (Object.keys(TITLES) as ActivityGroupKey[])
    .filter((k) => groups.has(k))
    .map((k) => ({ key: k, title: TITLES[k], items: groups.get(k)! }));
}

/** Pending prior-connection requests the viewer can still answer inline. */
export function requestConnectionId(item: { type: string; data: Record<string, string> }): string | null {
  return item.type === 'prior_connection_request' && item.data.connection_id ? item.data.connection_id : null;
}

/**
 * One newest-first list from pages read at different times (the live first page, the page the
 * server rendered, older pages): one row per item, the most recently recorded copy (a grouped
 * item re-recorded moves to the top with new copy).
 */
export function mergeActivity<T extends { id: string; created_at: string }>(...pages: readonly (readonly T[])[]): T[] {
  const byId = new Map<string, T>();
  for (const item of pages.flat()) {
    const known = byId.get(item.id);
    if (!known || Date.parse(item.created_at) > Date.parse(known.created_at)) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
