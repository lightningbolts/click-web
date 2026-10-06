import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { getServerUser } from '@/lib/server/getServerUser';
import { loadSessionBootstrap } from '@/lib/server/session';
import { loadActivity } from '@/lib/server/activity';
import { loadNudges } from '@/lib/server/nudges';
import { loadMineEvents } from '@/lib/server/events/mineEvents';
import { loadEventBookmarks } from '@/lib/server/events/eventBookmarks';
import { resolveFeature } from '@/lib/server/featureFlags';
import { listSharedDropStrip, serializeSharedDrops, sharedDropsConfigFrom } from '@/lib/server/sharedDrops';
import { loadBlockedUserIds } from '@/lib/server/connections/viewerPeers';
import { displayNameFromUser, type UserProfileRow } from '@/lib/events/attendeeDirectory';
import { loadActivityRecap } from '@/lib/me/activityRecap';
import { getArchiveCountdown, isActiveChatListStatus, normalizeConnectionStatus, connectionRowTimestampMs } from '@/lib/dashboard/connectionStatus';
import { computeIntentOverlapLabel } from '@/lib/dashboard/intentOverlap';
import type { AvailabilityIntentRow } from '@/lib/userProfile/availability';
import { TIME_ZONE_COOKIE, validTimeZone } from '@/lib/time/viewerTimeZone';
import { eventIsUpcomingOrLive, selectHomeOpportunity } from '@/lib/home/selectOpportunity';
import type { HomeChapter, HomeData, HomeEvent, HomePerson, HomeSayHi } from '@/lib/home/types';

const MAX_CORE = 12;
const MAX_CHAPTERS = 8;
const PEOPLE_PER_CHAPTER = 4;

/** Every load is best-effort: a slow or failing module renders empty, never fails Home. */
async function soft<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    console.error(`[home] ${label}:`, e instanceof Error ? e.message : e);
    return fallback;
  }
}

export type ConnectionRow = Record<string, unknown> & { id: string; user_ids: unknown };

export function peerOf(row: ConnectionRow, viewerId: string): string | null {
  const ids = Array.isArray(row.user_ids) ? (row.user_ids as unknown[]) : [];
  for (const raw of ids) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (id && id !== viewerId) return id;
  }
  return null;
}

async function idSet(query: PromiseLike<{ data: unknown }>, column: string): Promise<Set<string>> {
  const { data } = await query;
  return new Set(
    ((data ?? []) as Record<string, unknown>[]).map((r) => r[column]).filter((v): v is string => typeof v === 'string'),
  );
}

/** The viewer's connections: every visible row (archived kept), the active list and Core ids. */
export async function loadConnections(admin: SupabaseClient, viewerId: string) {
  const [rows, archived, hidden, core, blocked] = await Promise.all([
    admin
      .from('connections')
      .select('id, user_ids, status, expiry_state, has_begun, created, created_utc, last_message_at, source')
      .contains('user_ids', [viewerId])
      .order('created', { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (error) throw new Error(`connections: ${error.message}`);
        return (data ?? []) as ConnectionRow[];
      }),
    idSet(admin.from('connection_archives').select('connection_id').eq('user_id', viewerId), 'connection_id'),
    idSet(admin.from('connection_hidden').select('connection_id').eq('user_id', viewerId), 'connection_id'),
    idSet(admin.from('connection_core').select('connection_id').eq('user_id', viewerId), 'connection_id'),
    loadBlockedUserIds(admin, viewerId),
  ]);
  // Memories keep archived connections; everything else is the active list.
  const visible = rows.filter((r) => !hidden.has(r.id) && !blocked.has(peerOf(r, viewerId) ?? ''));
  const active = visible.filter(
    (r) => !archived.has(r.id) && isActiveChatListStatus(normalizeConnectionStatus(r)) && peerOf(r, viewerId),
  );
  return { visible, active, core };
}

function toHomeEvents(
  mine: Awaited<ReturnType<typeof loadMineEvents>>,
  saved: Awaited<ReturnType<typeof loadEventBookmarks>>['bookmarks'],
): HomeEvent[] {
  const byId = new Map<string, HomeEvent>();
  for (const e of mine) {
    byId.set(e.beacon_id, {
      id: e.beacon_id,
      title: e.title || 'Event',
      startAt: e.event_start_at,
      endAt: e.event_end_at,
      locationName: e.location_name,
      imageUrl: e.image_url,
      relation: e.role === 'creator' ? 'hosting' : 'going',
    });
  }
  for (const b of saved) {
    if (byId.has(b.beacon_id) || !b.created_at) continue;
    byId.set(b.beacon_id, {
      id: b.beacon_id,
      title: b.title || 'Event',
      startAt: b.event_start_at,
      endAt: b.event_end_at,
      locationName: b.location_name ?? b.formatted_address,
      imageUrl: null,
      relation: 'saved',
    });
  }
  return [...byId.values()];
}

/**
 * Signed-in Home (spec §7.1): one parallel round for everything keyed by the viewer, then one
 * for the people those rows point at (names, avatars, current intents).
 */
export const loadHome = cache(async (): Promise<HomeData | null> => {
  const [user, bootstrap, jar] = await Promise.all([getServerUser(), loadSessionBootstrap(), cookies()]);
  if (!user || !bootstrap) return null;
  const viewerId = user.id;
  const timeZone = validTimeZone(jar.get(TIME_ZONE_COOKIE)?.value) ?? 'UTC';
  const nowMs = Date.now();
  const admin = createAdminSupabaseClient();

  const [connections, nudges, mine, saved, dayRecap, weekRecap, activity, intents, drops] = await Promise.all([
    soft('connections', null, () => loadConnections(admin, viewerId)),
    soft('nudges', [], () => loadNudges(admin, viewerId)),
    soft('mine events', [], () => loadMineEvents(admin, viewerId)),
    soft('bookmarks', { bookmarks: [], next_cursor: null }, () => loadEventBookmarks(admin, viewerId, { limit: 50 })),
    soft('recap day', null, () => loadActivityRecap(admin, viewerId, 'day', nowMs)),
    soft('recap week', null, () => loadActivityRecap(admin, viewerId, 'week', nowMs)),
    soft('activity', [], async () => (await loadActivity(admin, viewerId, { limit: 5 })).items),
    soft('intents', [] as AvailabilityIntentRow[], async () => {
      const { data, error } = await admin
        .from('availability_intents')
        .select('id, timeframe, intent_tag, expires_at')
        .eq('user_id', viewerId)
        .gt('expires_at', new Date(nowMs).toISOString())
        .order('expires_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as AvailabilityIntentRow[];
    }),
    soft('drops', { enabled: false, items: [] as HomeData['drops']['items'] }, async () => {
      const feature = await resolveFeature(admin, 'shared_drops', viewerId);
      if (!feature.enabled) return { enabled: false, items: [] };
      const config = sharedDropsConfigFrom(feature.config);
      const { rows, views } = await listSharedDropStrip(admin, viewerId, config);
      return { enabled: true, items: await serializeSharedDrops(admin, rows, viewerId, views) };
    }),
  ]);

  const active = connections?.active ?? [];
  const peerByConnection = new Map<string, string>();
  for (const r of connections?.visible ?? []) {
    const peer = peerOf(r, viewerId);
    if (peer) peerByConnection.set(r.id, peer);
  }

  // New Clicks: never messaged, still inside the 48 h window.
  const sayHiRows = active
    .map((r) => ({ row: r, countdown: getArchiveCountdown(r, nowMs) }))
    .filter((x) => x.countdown?.kind === 'initial_message' && x.countdown.remainingMs > 0)
    .sort((a, b) => a.countdown!.deadlineMs - b.countdown!.deadlineMs);
  const coreRows = active.filter((r) => connections?.core.has(r.id)).slice(0, MAX_CORE);

  // Memories: month chapters over every visible connection (archived included).
  const months = new Map<string, ConnectionRow[]>();
  for (const r of connections?.visible ?? []) {
    const d = new Date(connectionRowTimestampMs(r));
    const key = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).format(d);
    months.set(key, [...(months.get(key) ?? []), r]);
  }
  const chapterKeys = [...months.keys()].sort().reverse().slice(0, MAX_CHAPTERS);

  const activePeers = [...new Set(active.map((r) => peerOf(r, viewerId)!))];
  const wanted = new Set<string>([
    ...sayHiRows.map((x) => peerOf(x.row, viewerId)!),
    ...coreRows.map((r) => peerOf(r, viewerId)!),
    ...chapterKeys.flatMap((k) => months.get(k)!.slice(0, PEOPLE_PER_CHAPTER).map((r) => peerByConnection.get(r.id) ?? '')),
    ...nudges.flatMap((n) => (n.connection_id && peerByConnection.get(n.connection_id) ? [peerByConnection.get(n.connection_id)!] : [])),
  ]);
  wanted.delete('');

  const [profiles, peerIntents] = await Promise.all([
    soft('profiles', new Map<string, HomePerson>(), async () => {
      const ids = [...new Set([...wanted, ...(intents.length ? activePeers : [])])];
      if (ids.length === 0) return new Map();
      const { data } = await admin.from('users').select('id, name, image, first_name, last_name').in('id', ids);
      return new Map(
        ((data ?? []) as UserProfileRow[]).map((u) => [u.id, { id: u.id, name: displayNameFromUser(u, 'Someone'), avatarUrl: u.image }]),
      );
    }),
    soft('peer intents', [] as (AvailabilityIntentRow & { user_id: string })[], async () => {
      if (intents.length === 0 || activePeers.length === 0) return [];
      const { data } = await admin
        .from('availability_intents')
        .select('id, user_id, timeframe, intent_tag, expires_at')
        .in('user_id', activePeers)
        .gt('expires_at', new Date(nowMs).toISOString());
      return (data ?? []) as (AvailabilityIntentRow & { user_id: string })[];
    }),
  ]);

  const person = (userId: string | null | undefined): HomePerson | null =>
    userId ? profiles.get(userId) ?? { id: userId, name: 'Someone', avatarUrl: null } : null;

  const newClicks: HomeSayHi[] = sayHiRows.map((x) => ({
    connectionId: x.row.id,
    person: person(peerOf(x.row, viewerId))!,
    deadlineMs: x.countdown!.deadlineMs,
  }));

  const nudgePeople = new Map<string, HomePerson>();
  for (const n of nudges) {
    const p = n.connection_id ? person(peerByConnection.get(n.connection_id)) : null;
    if (p && n.connection_id) nudgePeople.set(n.connection_id, p);
  }

  const events = toHomeEvents(mine, saved.bookmarks);
  const opportunity = selectHomeOpportunity({ events, newClicks, nudges, people: nudgePeople, nowMs, timeZone });
  const promotedEventId = opportunity?.kind === 'event' ? opportunity.event.id : null;
  const upcoming = events
    .filter((e) => e.id !== promotedEventId && eventIsUpcomingOrLive(e, nowMs))
    .sort((a, b) => Date.parse(a.startAt!) - Date.parse(b.startAt!))
    .slice(0, 3);

  const intentsByPeer = new Map<string, AvailabilityIntentRow[]>();
  for (const row of peerIntents) intentsByPeer.set(row.user_id, [...(intentsByPeer.get(row.user_id) ?? []), row]);
  const matches: HomeData['availability']['matches'] = [];
  const seenPeers = new Set<string>();
  for (const r of active) {
    const peer = peerOf(r, viewerId)!;
    if (seenPeers.has(peer)) continue;
    const label = computeIntentOverlapLabel(intents, intentsByPeer.get(peer) ?? [], nowMs);
    if (!label) continue;
    seenPeers.add(peer);
    matches.push({ connectionId: r.id, person: person(peer)!, label });
  }

  const memories: HomeChapter[] = chapterKeys.map((key) => {
    const rows = months.get(key)!;
    const people = [...new Set(rows.map((r) => peerByConnection.get(r.id)).filter((p): p is string => !!p))]
      .slice(0, PEOPLE_PER_CHAPTER)
      .map((id) => person(id)!);
    return { id: key, monthStart: `${key}-01`, count: rows.length, people };
  });

  const firstName = bootstrap.viewer.name.trim().split(/\s+/)[0] ?? '';
  return {
    viewer: { id: viewerId, firstName },
    timeZone,
    nowMs,
    opportunity,
    newClicks,
    drops,
    upcoming,
    recap: dayRecap && weekRecap ? { day: dayRecap, week: weekRecap } : null,
    memories,
    availability: { intents, matches: matches.slice(0, 3) },
    core: coreRows.map((r) => person(peerOf(r, viewerId))!),
    activityPreview: activity,
  };
});
