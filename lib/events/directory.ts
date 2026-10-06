import { dayKey } from '@/lib/home/selectOpportunity';
import type { PublicEventListItem } from '@/lib/events/publicEvent';

export const DIRECTORY_PAGE_SIZE = 30;
/** `unstable_cache` tag on the public event lists; revalidated when an event changes. */
export const PUBLIC_EVENTS_TAG = 'events:public';
/** Cache tag for a Place's event list on `/p/[slug]` (spec §7.6.3). */
export const placeEventsTag = (placeId: string) => `place:${placeId}:events`;

export type DirectoryTab = 'upcoming' | 'past';
export type DirectorySort = 'date' | 'going' | 'host';

export type DirectoryQuery = {
  tab: DirectoryTab;
  q: string;
  sort: DirectorySort;
  /** 1-based; page N shows the first N × 30 events. */
  page: number;
};

export type DirectoryDay = {
  key: string;
  /** "Today", "Tomorrow", "Yesterday", "Oct 9", "Oct 9, 2025". */
  title: string;
  /** Weekday when the title is a date. */
  subtitle: string | null;
  events: PublicEventListItem[];
};

export type EventDirectory = {
  featured: PublicEventListItem | null;
  /** Date sort: grouped by day. Other sorts: one group with an empty title. */
  days: DirectoryDay[];
  shown: number;
  total: number;
  hasMore: boolean;
};

const DAY_MS = 86_400_000;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
}

/** Parses `/events` search params leniently; anything unknown falls back to the default. */
export function parseDirectoryQuery(params: Record<string, string | string[] | undefined>): DirectoryQuery {
  const tab = one(params.tab) === 'past' ? 'past' : 'upcoming';
  const sortRaw = one(params.sort);
  const sort: DirectorySort = sortRaw === 'going' || sortRaw === 'host' ? sortRaw : 'date';
  const page = Math.min(50, Math.max(1, Number.parseInt(one(params.page), 10) || 1));
  return { tab, q: one(params.q).slice(0, 100), sort, page };
}

/** The URL for a directory state, omitting defaults so the canonical `/events` stays clean. */
export function directoryHref(query: Partial<DirectoryQuery>): string {
  const p = new URLSearchParams();
  if (query.tab === 'past') p.set('tab', 'past');
  if (query.q?.trim()) p.set('q', query.q.trim());
  if (query.sort && query.sort !== 'date') p.set('sort', query.sort);
  if (query.page && query.page > 1) p.set('page', String(query.page));
  const s = p.toString();
  return s ? `/events?${s}` : '/events';
}

function startMs(e: PublicEventListItem): number {
  const t = Date.parse(e.event_start_at ?? '');
  return Number.isFinite(t) ? t : Number.NaN;
}

/** The name shown as host on the row: the place when a place hosts, else the person. */
function hostName(e: PublicEventListItem): string {
  return (e.place?.name ?? e.host_name ?? '').trim();
}

function matches(e: PublicEventListItem, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [e.title, e.description, e.location_name, e.host_name, e.place?.name]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(needle));
}

function dayTitle(ms: number, timeZone: string, nowMs: number): { title: string; subtitle: string | null } {
  const key = dayKey(ms, timeZone);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(ms);
  if (key === dayKey(nowMs, timeZone)) return { title: 'Today', subtitle: weekday };
  if (key === dayKey(nowMs + DAY_MS, timeZone)) return { title: 'Tomorrow', subtitle: weekday };
  if (key === dayKey(nowMs - DAY_MS, timeZone)) return { title: 'Yesterday', subtitle: weekday };
  const sameYear = key.slice(0, 4) === dayKey(nowMs, timeZone).slice(0, 4);
  const title = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(ms);
  return { title, subtitle: weekday };
}

/**
 * The `/events` directory (spec §7.6.1): filter, sort, at most one featured event, then a
 * day-grouped timeline (ascending for Upcoming, descending for Past), paged 30 at a time.
 */
export function buildEventDirectory(
  items: PublicEventListItem[],
  query: DirectoryQuery,
  { timeZone, nowMs }: { timeZone: string; nowMs: number },
): EventDirectory {
  const filtered = items.filter((e) => matches(e, query.q));
  const dir = query.tab === 'past' ? -1 : 1;
  filtered.sort((a, b) => {
    if (query.sort === 'going') return b.rsvp_count - a.rsvp_count || dir * (startMs(a) - startMs(b));
    if (query.sort === 'host') {
      const ah = hostName(a);
      const bh = hostName(b);
      if (!ah || !bh) return ah ? -1 : bh ? 1 : 0;
      return ah.localeCompare(bh, 'en', { sensitivity: 'base' });
    }
    const as = startMs(a);
    const bs = startMs(b);
    if (Number.isNaN(as) || Number.isNaN(bs)) return Number.isNaN(as) ? 1 : -1;
    return dir * (as - bs);
  });

  // One featured event: the most-attended upcoming event in the next two weeks, on the
  // unfiltered first page only, so search results stay a plain list.
  let featured: PublicEventListItem | null = null;
  if (query.tab === 'upcoming' && !query.q && query.sort === 'date' && query.page === 1) {
    const soon = filtered.filter((e) => {
      const s = startMs(e);
      return Number.isFinite(s) && s - nowMs < 14 * DAY_MS && e.rsvp_count > 0;
    });
    featured = soon.reduce<PublicEventListItem | null>((best, e) => (!best || e.rsvp_count > best.rsvp_count ? e : best), null);
  }
  const rest = featured ? filtered.filter((e) => e !== featured) : filtered;
  const limit = query.page * DIRECTORY_PAGE_SIZE;
  const page = rest.slice(0, limit);

  const days: DirectoryDay[] = [];
  if (query.sort !== 'date') {
    if (page.length) days.push({ key: 'all', title: '', subtitle: null, events: page });
  } else {
    for (const e of page) {
      const s = startMs(e);
      const key = Number.isFinite(s) ? dayKey(s, timeZone) : 'tba';
      let day = days.at(-1);
      if (!day || day.key !== key) {
        const label = Number.isFinite(s) ? dayTitle(s, timeZone, nowMs) : { title: 'Date to be announced', subtitle: null };
        day = { key, ...label, events: [] };
        days.push(day);
      }
      day.events.push(e);
    }
  }

  return {
    featured,
    days,
    shown: page.length + (featured ? 1 : 0),
    total: filtered.length,
    hasMore: rest.length > limit,
  };
}
