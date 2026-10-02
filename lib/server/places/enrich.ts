import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { displayNameFromUser, type UserProfileRow } from '@/lib/events/attendeeDirectory';
import { eventEndAtFromMetadata, eventStartAtFromMetadata, eventTitleFromMetadata, parseBeaconMetadata } from '@/lib/events/eventMetadata';
import { filterBeaconsForViewer } from '@/lib/map/beaconVisibility';
import type { MapBeaconRecord } from '@/lib/map/mapBeacons';
import type { PlacesConfig } from '@/lib/places/config';
import { localDayEndMs } from '@/lib/places/hours';
import { summarizePulse } from '@/lib/places/pulse';
import type { PlaceEventRef, PlacePerson, PulseRow } from '@/lib/places/types';
import { loadViewerPeers, type ViewerPeer } from '@/lib/server/connections/viewerPeers';
import { loadManagerIdsByPlace, type ConsumerPlaceRow } from '@/lib/server/places/loadPlace';
import { placeTimezone, type PlaceEnrichment } from '@/lib/server/places/serialize';

/**
 * Batch loaders for N Places (§5.2 step 4). One query per concern for the whole batch, never one
 * per Place. Consumer-facing numbers use every row; counts that name or count people drop
 * ghost-mode users, and names drop blocked users (loadViewerPeers already excludes them).
 */

type Row = Record<string, unknown>;

function fail(label: string, error: { message: string } | null): void {
  if (error) throw new Error(`places enrich ${label}: ${error.message}`);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

export type ProfileRow = UserProfileRow & {
  ghost_mode?: boolean | null;
  place_visits_visible_to_connections?: boolean | null;
};

const PROFILE_COLUMNS = 'id, name, image, first_name, last_name, ghost_mode, place_visits_visible_to_connections';

export async function loadProfiles(admin: SupabaseClient, userIds: string[]): Promise<Map<string, ProfileRow>> {
  const out = new Map<string, ProfileRow>();
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return out;
  const { data, error } = await admin.from('users').select(PROFILE_COLUMNS).in('id', ids);
  fail('users', error);
  for (const row of (data ?? []) as ProfileRow[]) out.set(row.id, row);
  return out;
}

export function personFrom(profile: ProfileRow): PlacePerson {
  return { user_id: profile.id, name: displayNameFromUser(profile, 'Someone'), avatar_url: profile.image ?? null };
}

export function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
}

// ---------------------------------------------------------------------------
// Pulses
// ---------------------------------------------------------------------------

const PULSE_COLUMNS = 'id, place_id, user_id, energy, proof_weight, created_at, talkable, category_question, category_answer, would_return';

/** Energy Pulses since `sinceIso`, per Place, minus each Place's managers (defensive, §4.5). */
export async function loadPulseRows(
  admin: SupabaseClient,
  placeIds: string[],
  sinceIso: string,
): Promise<Map<string, PulseRow[]>> {
  if (placeIds.length === 0) return new Map();
  const [{ data, error }, managers] = await Promise.all([
    admin
      .from('place_pulses')
      .select(PULSE_COLUMNS)
      .in('place_id', placeIds)
      .gte('created_at', sinceIso)
      .not('energy', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5000),
    loadManagerIdsByPlace(admin, placeIds),
  ]);
  fail('place_pulses', error);
  const rows = ((data ?? []) as Array<PulseRow & { place_id: string }>).filter(
    (p) => !(p.user_id && managers.get(p.place_id)?.has(p.user_id)),
  );
  return groupBy(rows, (p) => p.place_id);
}

// ---------------------------------------------------------------------------
// Active check-ins (here now)
// ---------------------------------------------------------------------------

export type ActiveCheckInRow = {
  id: string;
  place_id: string;
  user_id: string;
  checked_at: string;
  expires_at: string;
  proof: 'qr' | 'gps' | null;
  proof_weight: number | null;
  share_with_connections: boolean;
};

export async function loadActiveCheckIns(
  admin: SupabaseClient,
  placeIds: string[],
  nowMs: number,
): Promise<ActiveCheckInRow[]> {
  if (placeIds.length === 0) return [];
  const { data, error } = await admin
    .from('place_check_ins')
    .select('id, place_id, user_id, checked_at, expires_at, proof, proof_weight, share_with_connections')
    .in('place_id', placeIds)
    .is('checked_out_at', null)
    .gt('expires_at', new Date(nowMs).toISOString())
    .limit(5000);
  fail('place_check_ins active', error);
  return (data ?? []) as ActiveCheckInRow[];
}

export async function loadGhostedIds(admin: SupabaseClient, userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Set();
  const { data, error } = await admin.from('users').select('id').in('id', ids).eq('ghost_mode', true);
  fail('users ghost', error);
  return new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
}

/** Distinct non-ghost users checked in; the viewer counts when they are checked in. */
export function hereNowCount(rows: ActiveCheckInRow[], ghosted: Set<string>, viewerId: string | null): number {
  const users = new Set<string>();
  for (const r of rows) {
    if (r.user_id === viewerId || !ghosted.has(r.user_id)) users.add(r.user_id);
  }
  return users.size;
}

// ---------------------------------------------------------------------------
// Official events
// ---------------------------------------------------------------------------

export type OfficialEvent = PlaceEventRef & {
  place_id: string;
  startMs: number | null;
  endMs: number;
  cover_theme_id: string | null;
  metadata: Record<string, unknown>;
};

const EVENT_COLUMNS =
  'id, venue_id, creator_id, beacon_type, metadata, starts_at, ends_at, expires_at, visibility_audience, event_visibility, cover_theme_id, cleared_at';

function msOf(...candidates: unknown[]): number | null {
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const ms = Date.parse(c);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/**
 * Official events (`beacon_type = 'event' AND venue_id = place`) that haven't ended, sorted by
 * start. Signed-in viewers get creator audience rules; anonymous callers see public ones only.
 */
export async function loadOfficialEvents(
  admin: SupabaseClient,
  placeIds: string[],
  viewerId: string | null,
  nowMs: number,
): Promise<Map<string, OfficialEvent[]>> {
  if (placeIds.length === 0) return new Map();
  const { data, error } = await admin
    .from('map_beacons')
    .select(EVENT_COLUMNS)
    .eq('beacon_type', 'event')
    .in('venue_id', placeIds)
    .gt('expires_at', new Date(nowMs - 86_400_000).toISOString())
    .limit(1000);
  fail('map_beacons events', error);

  const candidates: Array<{ row: Row; event: OfficialEvent }> = [];
  for (const row of (data ?? []) as Row[]) {
    if (row.cleared_at != null) continue;
    const visibility = str(row.event_visibility) ?? 'public';
    if (visibility !== 'public') continue;
    const meta = parseBeaconMetadata(row.metadata);
    const startMs = msOf(row.starts_at, eventStartAtFromMetadata(meta));
    const endMs = msOf(row.ends_at, eventEndAtFromMetadata(meta), row.expires_at);
    if (endMs == null || endMs <= nowMs) continue;
    const id = str(row.id);
    const placeId = str(row.venue_id);
    if (!id || !placeId) continue;
    candidates.push({
      row,
      event: {
        beacon_id: id,
        place_id: placeId,
        title: eventTitleFromMetadata(meta) ?? 'Event',
        starts_at: startMs != null ? new Date(startMs).toISOString() : null,
        ends_at: new Date(endMs).toISOString(),
        is_live: (startMs == null || startMs <= nowMs) && nowMs < endMs,
        startMs,
        endMs,
        cover_theme_id: str(row.cover_theme_id),
        metadata: {
          ...meta,
          ...(startMs != null ? { event_start_at: new Date(startMs).toISOString() } : {}),
          event_end_at: new Date(endMs).toISOString(),
        },
      },
    });
  }

  let visibleIds: Set<string>;
  if (viewerId) {
    const records = candidates.map(
      ({ row, event }) =>
        ({
          id: event.beacon_id,
          creator_id: str(row.creator_id) ?? '',
          visibility_audience: row.visibility_audience,
        }) as unknown as MapBeaconRecord,
    );
    visibleIds = new Set((await filterBeaconsForViewer(admin, viewerId, records)).map((b) => b.id));
  } else {
    visibleIds = new Set(
      candidates.filter(({ row }) => (str(row.visibility_audience) ?? 'everyone') === 'everyone').map(({ event }) => event.beacon_id),
    );
  }

  const events = candidates.map((c) => c.event).filter((e) => visibleIds.has(e.beacon_id));
  events.sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
  return groupBy(events, (e) => e.place_id);
}

export function eventRef(e: OfficialEvent): PlaceEventRef {
  return { beacon_id: e.beacon_id, title: e.title, starts_at: e.starts_at, ends_at: e.ends_at, is_live: e.is_live };
}

// ---------------------------------------------------------------------------
// Hubs
// ---------------------------------------------------------------------------

export async function loadPlaceHubs(
  admin: SupabaseClient,
  places: Array<Pick<ConsumerPlaceRow, 'id' | 'hub_enabled'>>,
): Promise<Map<string, { id: string; name: string }>> {
  const enabled = places.filter((p) => p.hub_enabled).map((p) => p.id);
  const out = new Map<string, { id: string; name: string }>();
  if (enabled.length === 0) return out;
  const { data, error } = await admin.from('hub_venues').select('id, name, place_id').in('place_id', enabled);
  fail('hub_venues', error);
  for (const row of (data ?? []) as Array<{ id: string; name: string; place_id: string }>) {
    out.set(row.place_id, { id: row.id, name: row.name });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Viewer history and network
// ---------------------------------------------------------------------------

function memberIds(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((u): u is string => typeof u === 'string') : [];
}

/** Every connection the viewer belongs to (their own history), id → member ids. */
export async function loadViewerConnections(admin: SupabaseClient, viewerId: string): Promise<Map<string, string[]>> {
  const { data, error } = await admin.from('connections').select('id, user_ids').contains('user_ids', [viewerId]);
  fail('connections viewer', error);
  return new Map(((data ?? []) as Array<{ id: string; user_ids: unknown }>).map((r) => [r.id, memberIds(r.user_ids)]));
}

export type EncounterRow = {
  id: string;
  place_id: string;
  connection_id: string;
  encountered_at: string;
  reporting_user_id: string | null;
};

/** Encounters at these Places on the viewer's own connections. */
export async function loadViewerEncounters(
  admin: SupabaseClient,
  placeIds: string[],
  connectionIds: string[],
): Promise<EncounterRow[]> {
  if (placeIds.length === 0 || connectionIds.length === 0) return [];
  const { data, error } = await admin
    .from('connection_encounters')
    .select('id, place_id, connection_id, encountered_at, reporting_user_id')
    .in('place_id', placeIds)
    .in('connection_id', connectionIds)
    .order('encountered_at', { ascending: false })
    .limit(5000);
  fail('connection_encounters viewer', error);
  return (data ?? []) as EncounterRow[];
}

export async function loadViewerCheckInPlaceIds(
  admin: SupabaseClient,
  viewerId: string,
  placeIds: string[],
  sinceIso: string,
): Promise<Set<string>> {
  if (placeIds.length === 0) return new Set();
  const { data, error } = await admin
    .from('place_check_ins')
    .select('place_id')
    .eq('user_id', viewerId)
    .in('place_id', placeIds)
    .gte('checked_at', sinceIso);
  fail('place_check_ins viewer', error);
  return new Set(((data ?? []) as Array<{ place_id: string }>).map((r) => r.place_id));
}

/**
 * "Clicks who've been here" (§4.7): the viewer's connections who turned on
 * place_visits_visible_to_connections, not ghosted, not blocked, with a check-in at the Place
 * in the last `beenHereDays` or an encounter there in that window on a connection they belong to.
 */
export async function loadConnectionsBeenHere(
  admin: SupabaseClient,
  viewerId: string,
  placeIds: string[],
  config: Pick<PlacesConfig, 'beenHereDays'>,
  nowMs: number,
): Promise<{ byPlace: Map<string, Set<string>>; profiles: Map<string, ProfileRow>; peers: Map<string, ViewerPeer> }> {
  const byPlace = new Map<string, Set<string>>();
  const peers = await loadViewerPeers(admin, viewerId);
  if (placeIds.length === 0) return { byPlace, profiles: new Map(), peers };
  const profiles = await loadProfiles(admin, [...peers.keys()]);
  const visible = new Set(
    [...profiles.values()]
      .filter((p) => p.place_visits_visible_to_connections === true && p.ghost_mode !== true)
      .map((p) => p.id),
  );
  if (visible.size === 0) return { byPlace, profiles, peers };

  const sinceIso = new Date(nowMs - config.beenHereDays * 86_400_000).toISOString();
  const add = (placeId: string, userId: string) => {
    const set = byPlace.get(placeId) ?? new Set<string>();
    set.add(userId);
    byPlace.set(placeId, set);
  };

  const [checkIns, encounters] = await Promise.all([
    admin
      .from('place_check_ins')
      .select('place_id, user_id')
      .in('place_id', placeIds)
      .in('user_id', [...visible])
      .gte('checked_at', sinceIso),
    admin
      .from('connection_encounters')
      .select('place_id, connection_id')
      .in('place_id', placeIds)
      .gte('encountered_at', sinceIso)
      .limit(5000),
  ]);
  fail('been-here check-ins', checkIns.error);
  fail('been-here encounters', encounters.error);
  for (const r of (checkIns.data ?? []) as Array<{ place_id: string; user_id: string }>) add(r.place_id, r.user_id);

  const encounterRows = (encounters.data ?? []) as Array<{ place_id: string; connection_id: string }>;
  const connectionIds = [...new Set(encounterRows.map((r) => r.connection_id))];
  if (connectionIds.length > 0) {
    const { data, error } = await admin.from('connections').select('id, user_ids').in('id', connectionIds);
    fail('been-here connections', error);
    const members = new Map<string, string[]>();
    for (const c of (data ?? []) as Array<{ id: string; user_ids: unknown }>) members.set(c.id, memberIds(c.user_ids));
    for (const r of encounterRows) {
      for (const userId of members.get(r.connection_id) ?? []) {
        if (visible.has(userId)) add(r.place_id, userId);
      }
    }
  }
  return { byPlace, profiles, peers };
}

// ---------------------------------------------------------------------------
// The batch
// ---------------------------------------------------------------------------

export type ViewerContext = {
  historyPlaceIds: Set<string>;
  beenHere: Map<string, Set<string>>;
  peers: Map<string, ViewerPeer>;
  /** Profiles of the viewer's peers. */
  profiles: Map<string, ProfileRow>;
  connections: Map<string, string[]>;
  encounters: EncounterRow[];
};

export type EnrichContext = {
  pulsesByPlace: Map<string, PulseRow[]>;
  activeByPlace: Map<string, ActiveCheckInRow[]>;
  ghosted: Set<string>;
  eventsByPlace: Map<string, OfficialEvent[]>;
  hubs: Map<string, { id: string; name: string }>;
  viewer: ViewerContext | null;
};

export async function enrichPlaces(
  admin: SupabaseClient,
  places: ConsumerPlaceRow[],
  options: { viewerId: string | null; config: PlacesConfig; nowMs: number },
): Promise<{ enrichments: Map<string, PlaceEnrichment>; context: EnrichContext }> {
  const { viewerId, config, nowMs } = options;
  const ids = places.map((p) => p.id);
  const lookbackIso = new Date(nowMs - config.lastPulseLookbackHours * 3_600_000).toISOString();

  const [pulsesByPlace, active, eventsByPlace, hubs, viewerData] = await Promise.all([
    loadPulseRows(admin, ids, lookbackIso),
    loadActiveCheckIns(admin, ids, nowMs),
    loadOfficialEvents(admin, ids, viewerId, nowMs),
    loadPlaceHubs(admin, places),
    viewerId ? loadViewerContext(admin, viewerId, ids, config, nowMs) : Promise.resolve(null),
  ]);
  const ghosted = await loadGhostedIds(admin, active.map((r) => r.user_id));
  const activeByPlace = groupBy(active, (r) => r.place_id);

  const enrichments = new Map<string, PlaceEnrichment>();
  for (const place of places) {
    const placeActive = activeByPlace.get(place.id) ?? [];
    const events = eventsByPlace.get(place.id) ?? [];
    const dayEnd = localDayEndMs(placeTimezone(place), nowMs);
    const today = events.filter((e) => (e.startMs ?? nowMs) < dayEnd);
    enrichments.set(place.id, {
      pulse: summarizePulse(pulsesByPlace.get(place.id) ?? [], nowMs, config),
      here_now_count: hereNowCount(placeActive, ghosted, viewerId),
      events_today_count: today.length,
      next_event: events[0] ? eventRef(events[0]) : null,
      hub_id: hubs.get(place.id)?.id ?? null,
      viewer:
        viewerId && viewerData
          ? {
              checked_in: placeActive.some((r) => r.user_id === viewerId),
              has_history: viewerData.historyPlaceIds.has(place.id),
              connections_been_here_count: viewerData.beenHere.get(place.id)?.size ?? 0,
            }
          : null,
    });
  }
  return { enrichments, context: { pulsesByPlace, activeByPlace, ghosted, eventsByPlace, hubs, viewer: viewerData } };
}

async function loadViewerContext(
  admin: SupabaseClient,
  viewerId: string,
  placeIds: string[],
  config: PlacesConfig,
  nowMs: number,
): Promise<ViewerContext> {
  const retentionIso = new Date(nowMs - 90 * 86_400_000).toISOString();
  const [checkInPlaces, connections, beenHere] = await Promise.all([
    loadViewerCheckInPlaceIds(admin, viewerId, placeIds, retentionIso),
    loadViewerConnections(admin, viewerId),
    loadConnectionsBeenHere(admin, viewerId, placeIds, config, nowMs),
  ]);
  const encounters = await loadViewerEncounters(admin, placeIds, [...connections.keys()]);
  return {
    historyPlaceIds: new Set([...checkInPlaces, ...encounters.map((e) => e.place_id)]),
    beenHere: beenHere.byPlace,
    peers: beenHere.peers,
    profiles: beenHere.profiles,
    connections,
    encounters,
  };
}
