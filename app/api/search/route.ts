/**
 * GET /api/search?q=<query>
 *
 * Unified server-side search used as the fallback behind the mobile clients' on-device index
 * (connections, groups, stored messages and cached events are matched locally first).
 * One request returns everything the device may not have stored:
 *
 * - `people`: users the caller shares a group or a hub with (never a global user directory;
 *   Click is in-person first), excluding blocks in either direction and existing connections.
 * - `events`: public upcoming events plus the caller's own events, by title or place.
 * - `hubs`: hubs the caller has joined, by name or category.
 * - `hits`: plaintext message hits (same contract as GET /api/chat/search; encrypted bodies
 *   can only be searched on-device).
 *
 * With `mine=1` (the web command palette, which has no on-device index) it also returns
 * `clicks` (your connections by name), `groups` (groups you're in) and `places` (listed Places).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/server/supabaseAuth';
import { createChatGatekeeperAdmin } from '@/lib/server/chatGatekeeper';
import { filterReadableHubIds } from '@/lib/server/hubGatekeeper';
import { selectInChunks } from '@/lib/chat/postgrestInChunks';
import { loadPublicUpcomingEvents } from '@/lib/events/publicEvent';
import { GET as searchMessages } from '../chat/search/route';

const MIN_QUERY = 2;
const MAX_PEOPLE = 20;
const MAX_EVENTS = 20;
const MAX_HUBS = 15;

type PersonHit = { userId: string; name: string; avatarUrl: string | null; context: string | null };
type EventHit = {
  beaconId: string;
  title: string;
  locationName: string | null;
  startAt: string | null;
  imageUrl: string | null;
};
type HubHit = { hubId: string; name: string; category: string | null };
type ClickHit = { connectionId: string; userId: string; name: string; avatarUrl: string | null };
type GroupHit = { groupId: string; name: string };
type PlaceHit = { placeId: string; slug: string; name: string; category: string | null; city: string | null };

const MAX_MINE = 10;

/** `%` and `_` are wildcards in ILIKE; match them literally. */
function likeLiteral(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function displayName(row: Record<string, unknown>): string | null {
  const pick = (key: string) => (typeof row[key] === 'string' && (row[key] as string).trim()) || null;
  const first = pick('first_name');
  const last = pick('last_name');
  return pick('name') ?? pick('full_name') ?? ([first, last].filter(Boolean).join(' ') || null);
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const mine = req.nextUrl.searchParams.get('mine') === '1';
  if (q.length < MIN_QUERY) {
    return NextResponse.json({ people: [], events: [], hubs: [], hits: [], ...(mine ? { clicks: [], groups: [], places: [] } : {}) });
  }

  const { user, supabase } = await getAuthenticatedSupabase(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createChatGatekeeperAdmin();
  const needle = q.toLowerCase();

  const people = async (): Promise<PersonHit[]> => {
    // Shared context: fellow group members and co-participants of readable hubs.
    const { data: myGroups } = await supabase.from('group_members').select('group_id').eq('user_id', user.id);
    const groupIds = (myGroups ?? []).map((r) => r.group_id).filter((id): id is string => typeof id === 'string');
    const { data: myHubs } = await admin.from('hub_participants').select('hub_id').eq('user_id', user.id);
    const hubIds = await filterReadableHubIds(
      admin,
      (myHubs ?? []).map((r) => r.hub_id).filter((id): id is string => typeof id === 'string'),
      user.id,
    );

    const context = new Map<string, string>();
    if (groupIds.length > 0) {
      const rows = await selectInChunks(groupIds, async (chunk) => {
        const { data } = await supabase.from('group_members').select('user_id, group_id').in('group_id', chunk);
        return data ?? [];
      });
      for (const row of rows) {
        if (typeof row.user_id === 'string' && !context.has(row.user_id)) context.set(row.user_id, 'In a group with you');
      }
    }
    if (hubIds.length > 0) {
      const rows = await selectInChunks(hubIds, async (chunk) => {
        const { data } = await admin.from('hub_participants').select('user_id, hub_id').in('hub_id', chunk);
        return data ?? [];
      });
      for (const row of rows) {
        if (typeof row.user_id === 'string' && !context.has(row.user_id)) context.set(row.user_id, 'In a hub with you');
      }
    }
    context.delete(user.id);
    if (context.size === 0) return [];

    const [{ data: blockedByMe }, { data: blockedMe }] = await Promise.all([
      admin.from('user_blocks').select('blocked_id').eq('blocker_id', user.id),
      admin.from('user_blocks').select('blocker_id').eq('blocked_id', user.id),
    ]);
    for (const row of blockedByMe ?? []) context.delete(row.blocked_id);
    for (const row of blockedMe ?? []) context.delete(row.blocker_id);
    // Existing connections are matched on-device (with their chat); leave them out here.
    const { data: connections } = await supabase.from('connections').select('user_ids').contains('user_ids', [user.id]);
    for (const row of connections ?? []) {
      for (const id of (row.user_ids as string[] | null) ?? []) context.delete(id);
    }
    if (context.size === 0) return [];

    const candidates = await selectInChunks([...context.keys()], async (chunk) => {
      const { data } = await admin
        .from('users')
        .select('id, name, full_name, first_name, last_name, image')
        .in('id', chunk);
      return data ?? [];
    });
    const hits: PersonHit[] = [];
    for (const row of candidates as Record<string, unknown>[]) {
      const name = displayName(row);
      if (!name || !name.toLowerCase().includes(needle) || typeof row.id !== 'string') continue;
      hits.push({
        userId: row.id,
        name,
        avatarUrl: typeof row.image === 'string' ? row.image : null,
        context: context.get(row.id) ?? null,
      });
      if (hits.length >= MAX_PEOPLE) break;
    }
    return hits;
  };

  const events = async (): Promise<EventHit[]> => {
    const publicEvents = await loadPublicUpcomingEvents(admin, 200);
    const matches: EventHit[] = publicEvents
      .filter((e) => [e.title, e.location_name, e.description].some((v) => v?.toLowerCase().includes(needle)))
      .map((e) => ({
        beaconId: e.beacon_id,
        title: e.title ?? 'Event',
        locationName: e.location_name,
        startAt: e.event_start_at,
        imageUrl: e.image_url,
      }));
    // The caller's own events (any visibility), by title in metadata.
    const { data: own } = await admin
      .from('map_beacons')
      .select('id, metadata, starts_at')
      .eq('creator_id', user.id)
      .eq('beacon_type', 'event')
      .order('created_at', { ascending: false })
      .limit(100);
    const seen = new Set(matches.map((m) => m.beaconId));
    for (const row of own ?? []) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const title = typeof meta.title === 'string' ? meta.title : null;
      const place = typeof meta.location_name === 'string' ? meta.location_name : null;
      if (seen.has(row.id) || ![title, place].some((v) => v?.toLowerCase().includes(needle))) continue;
      matches.push({
        beaconId: row.id,
        title: title ?? 'Event',
        locationName: place,
        startAt: typeof row.starts_at === 'string' ? row.starts_at : null,
        imageUrl: typeof meta.image_url === 'string' ? meta.image_url : null,
      });
    }
    return matches.slice(0, MAX_EVENTS);
  };

  const hubs = async (): Promise<HubHit[]> => {
    const { data: parts } = await admin.from('hub_participants').select('hub_id').eq('user_id', user.id);
    const hubIds = await filterReadableHubIds(
      admin,
      (parts ?? []).map((r) => r.hub_id).filter((id): id is string => typeof id === 'string'),
      user.id,
    );
    if (hubIds.length === 0) return [];
    const rows = await selectInChunks(hubIds, async (chunk) => {
      const { data } = await admin.from('hub_venues').select('id, name, category').in('id', chunk);
      return data ?? [];
    });
    // Joined hubs are few; match in code (no user text inside a PostgREST filter string).
    return rows
      .filter((r) => typeof r.id === 'string' && typeof r.name === 'string')
      .filter((r) => [r.name, r.category].some((v) => typeof v === 'string' && v.toLowerCase().includes(needle)))
      .slice(0, MAX_HUBS)
      .map((r) => ({ hubId: r.id as string, name: r.name as string, category: (r.category as string | null) ?? null }));
  };

  const clicks = async (): Promise<ClickHit[]> => {
    const [{ data: rows }, { data: hidden }, { data: blocks }] = await Promise.all([
      admin.from('connections').select('id, user_ids, status').contains('user_ids', [user.id]).limit(1000),
      admin.from('connection_hidden').select('connection_id').eq('user_id', user.id),
      admin.from('user_blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
    ]);
    const hiddenIds = new Set((hidden ?? []).map((r) => r.connection_id as string));
    const blocked = new Set((blocks ?? []).map((b) => (b.blocker_id === user.id ? b.blocked_id : b.blocker_id) as string));
    const peerByConnection = new Map<string, string>();
    for (const row of rows ?? []) {
      if (hiddenIds.has(row.id) || row.status === 'removed') continue;
      const peer = ((row.user_ids as string[] | null) ?? []).find((id) => id && id !== user.id);
      if (peer && !blocked.has(peer)) peerByConnection.set(row.id, peer);
    }
    if (peerByConnection.size === 0) return [];
    const users = await selectInChunks([...new Set(peerByConnection.values())], async (chunk) => {
      const { data } = await admin.from('users').select('id, name, full_name, first_name, last_name, image').in('id', chunk);
      return data ?? [];
    });
    const byId = new Map((users as Record<string, unknown>[]).map((u) => [u.id as string, u]));
    const hits: ClickHit[] = [];
    for (const [connectionId, userId] of peerByConnection) {
      const u = byId.get(userId);
      const name = u ? displayName(u) : null;
      if (!name || !name.toLowerCase().includes(needle)) continue;
      hits.push({ connectionId, userId, name, avatarUrl: typeof u?.image === 'string' ? u.image : null });
      if (hits.length >= MAX_MINE) break;
    }
    return hits;
  };

  const groups = async (): Promise<GroupHit[]> => {
    const { data: memberships } = await supabase.from('group_members').select('group_id').eq('user_id', user.id);
    const ids = (memberships ?? []).map((r) => r.group_id).filter((id): id is string => typeof id === 'string');
    if (ids.length === 0) return [];
    const rows = await selectInChunks(ids, async (chunk) => {
      const { data } = await supabase.from('groups').select('id, name').in('id', chunk);
      return data ?? [];
    });
    return rows
      .filter((r) => typeof r.name === 'string' && (r.name as string).toLowerCase().includes(needle))
      .slice(0, MAX_MINE)
      .map((r) => ({ groupId: r.id as string, name: r.name as string }));
  };

  const places = async (): Promise<PlaceHit[]> => {
    const { data } = await admin
      .from('places')
      .select('id, slug, name, category, city')
      .eq('listed', true)
      .eq('verification_status', 'verified')
      .not('slug', 'is', null)
      .ilike('name', `%${likeLiteral(q)}%`)
      .limit(MAX_MINE);
    return (data ?? []).map((p) => ({
      placeId: p.id as string,
      slug: p.slug as string,
      name: p.name as string,
      category: (p.category as string | null) ?? null,
      city: (p.city as string | null) ?? null,
    }));
  };

  const messages = async (): Promise<unknown[]> => {
    const response = await searchMessages(req);
    if (!response.ok) return [];
    const body = (await response.json()) as { hits?: unknown[] };
    return body.hits ?? [];
  };

  const settle = async <T,>(label: string, run: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await run();
    } catch (err) {
      console.error(`[search] ${label} failed:`, err);
      return [];
    }
  };

  const [peopleHits, eventHits, hubHits, messageHits, clickHits, groupHits, placeHits] = await Promise.all([
    settle('people', people),
    settle('events', events),
    settle('hubs', hubs),
    settle('messages', messages),
    mine ? settle('clicks', clicks) : Promise.resolve([]),
    mine ? settle('groups', groups) : Promise.resolve([]),
    mine ? settle('places', places) : Promise.resolve([]),
  ]);

  return NextResponse.json({
    people: peopleHits,
    events: eventHits,
    hubs: hubHits,
    hits: messageHits,
    ...(mine ? { clicks: clickHits, groups: groupHits, places: placeHits } : {}),
  });
}
