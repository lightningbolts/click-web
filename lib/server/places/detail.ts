import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlacesConfig } from '@/lib/places/config';
import { pulsePattern, pulseQuestionsFor } from '@/lib/places/pulse';
import type { PlaceDetail, PlacePerson, PulseEligibility } from '@/lib/places/types';
import { checkInState } from '@/lib/server/places/checkIns';
import {
  byName,
  enrichPlaces,
  eventRef,
  loadPulseRows,
  personFrom,
  type EnrichContext,
} from '@/lib/server/places/enrich';
import { isPlaceManager, type ConsumerPlaceRow } from '@/lib/server/places/loadPlace';
import { cooldownUntil, editableUntil, loadNewestPulse, loadPresence } from '@/lib/server/places/pulses';
import { placeTimezone, serializePlaceDetail, type PlaceDetailExtras } from '@/lib/server/places/serialize';

/**
 * PlaceDetail (§5.3). Other people appear only in the three allowed places: here-now names
 * (share_with_connections check-ins, connections only), clicks-been-here names (opted-in
 * connections, no dates) and you-met-here (the viewer's own connections).
 */

const MAX_UPCOMING = 10;
const MAX_HERE_NOW_NAMES = 10;
const MAX_BEEN_HERE_NAMES = 3;
const MAX_MET_HERE = 5;

function check(label: string, error: { message: string } | null): void {
  if (error) throw new Error(`place detail ${label}: ${error.message}`);
}

async function loadPattern(admin: SupabaseClient, place: ConsumerPlaceRow, config: PlacesConfig, nowMs: number) {
  const sinceIso = new Date(nowMs - config.patternWeeks * 7 * 86_400_000).toISOString();
  const rows = (await loadPulseRows(admin, [place.id], sinceIso)).get(place.id) ?? [];
  return pulsePattern(rows, placeTimezone(place), nowMs, config.patternWeeks);
}

function upcomingEvents(context: EnrichContext, placeId: string): PlaceDetail['upcoming_events'] {
  return (context.eventsByPlace.get(placeId) ?? [])
    .slice(0, MAX_UPCOMING)
    .map((e) => ({ ...eventRef(e), cover_theme_id: e.cover_theme_id }));
}

/** Anonymous / public detail: aggregate fields only, every viewer field null or []. */
export async function buildPublicDetail(
  admin: SupabaseClient,
  place: ConsumerPlaceRow,
  config: PlacesConfig,
  nowMs: number,
): Promise<PlaceDetail> {
  const [{ enrichments, context }, pattern] = await Promise.all([
    enrichPlaces(admin, [place], { viewerId: null, config, nowMs }),
    loadPattern(admin, place, config, nowMs),
  ]);
  const hub = context.hubs.get(place.id);
  const extras: PlaceDetailExtras = {
    pattern,
    upcoming_events: upcomingEvents(context, place.id),
    here_now_connections: [],
    clicks_been_here: null,
    you_met_here: null,
    own_history: null,
    check_in: null,
    pulse_eligibility: null,
    hub: hub ? { id: hub.id, name: hub.name, joined: false } : null,
    is_manager: false,
  };
  return serializePlaceDetail(place, enrichments.get(place.id)!, extras, { nowMs });
}

export async function buildViewerDetail(
  admin: SupabaseClient,
  place: ConsumerPlaceRow,
  viewerId: string,
  config: PlacesConfig,
  nowMs: number,
): Promise<PlaceDetail> {
  const [{ enrichments, context }, pattern, role, ownCheckIns] = await Promise.all([
    enrichPlaces(admin, [place], { viewerId, config, nowMs }),
    loadPattern(admin, place, config, nowMs),
    isPlaceManager(admin, place.id, viewerId),
    admin
      .from('place_check_ins')
      .select('checked_at')
      .eq('place_id', place.id)
      .eq('user_id', viewerId)
      .order('checked_at', { ascending: false })
      .limit(1000),
  ]);
  check('own check-ins', ownCheckIns.error);
  const viewer = context.viewer!;
  const active = context.activeByPlace.get(place.id) ?? [];
  const isManager = role != null;

  // Here now: connections who shared this check-in, not ghosted (blocked are not peers).
  const hereNow: PlacePerson[] = active
    .filter((r) => r.user_id !== viewerId && r.share_with_connections && viewer.peers.has(r.user_id) && !context.ghosted.has(r.user_id))
    .map((r) => viewer.profiles.get(r.user_id))
    .filter((p): p is NonNullable<typeof p> => p != null && p.ghost_mode !== true)
    .map(personFrom)
    .sort(byName)
    .slice(0, MAX_HERE_NOW_NAMES);

  // Clicks who've been here: names by name, never by recency, no dates.
  const beenHereIds = [...(viewer.beenHere.get(place.id) ?? [])];
  const beenHereNames = beenHereIds
    .map((id) => viewer.profiles.get(id))
    .filter((p): p is NonNullable<typeof p> => p != null)
    .map(personFrom)
    .sort(byName)
    .slice(0, MAX_BEEN_HERE_NAMES)
    .map((p) => p.name);

  // You met here: the viewer's own connections, latest meeting first.
  const placeEncounters = viewer.encounters.filter((e) => e.place_id === place.id);
  const lastMet = new Map<string, string>();
  for (const e of placeEncounters) {
    for (const userId of viewer.connections.get(e.connection_id) ?? []) {
      if (userId === viewerId || !viewer.peers.has(userId)) continue;
      const prev = lastMet.get(userId);
      if (!prev || prev < e.encountered_at) lastMet.set(userId, e.encountered_at);
    }
  }
  const metPeople = [...lastMet.entries()]
    .map(([userId, at]) => {
      const profile = viewer.profiles.get(userId);
      return profile ? { ...personFrom(profile), last_met_at: at } : null;
    })
    .filter((p): p is NonNullable<typeof p> => p != null)
    .sort((a, b) => (a.last_met_at < b.last_met_at ? 1 : -1));

  const ownRows = (ownCheckIns.data ?? []) as Array<{ checked_at: string }>;
  const ownEncounters = placeEncounters.filter((e) => e.reporting_user_id == null || e.reporting_user_id === viewerId);
  const mine = active.find((r) => r.user_id === viewerId);

  const allQuestions = pulseQuestionsFor(place.category);
  const lastPulse = await loadNewestPulse(admin, place.id, viewerId, { energyOnly: false });
  const lastEnergyPulse =
    lastPulse?.energy != null ? lastPulse : await loadNewestPulse(admin, place.id, viewerId, { energyOnly: true });
  let reason: PulseEligibility['reason'] = null;
  let cooldown: string | null = null;
  if (isManager) reason = 'manager';
  else if (!(await loadPresence(admin, place, viewerId, config, nowMs)).present) reason = 'not_present';
  else {
    cooldown = cooldownUntil(lastEnergyPulse, config, nowMs);
    if (cooldown) reason = 'cooldown';
  }

  const hub = context.hubs.get(place.id);
  let joined = false;
  if (hub) {
    const { data, error } = await admin
      .from('hub_participants')
      .select('hub_id')
      .eq('hub_id', hub.id)
      .eq('user_id', viewerId)
      .maybeSingle();
    check('hub participant', error);
    joined = data != null;
  }

  const extras: PlaceDetailExtras = {
    pattern,
    upcoming_events: upcomingEvents(context, place.id),
    here_now_connections: hereNow,
    clicks_been_here: { count: beenHereIds.length, names: beenHereNames },
    you_met_here: { total: metPeople.length, people: metPeople.slice(0, MAX_MET_HERE) },
    own_history: {
      check_in_count: ownRows.length,
      last_check_in_at: ownRows[0]?.checked_at ?? null,
      encounter_count: ownEncounters.length,
    },
    check_in: mine ? checkInState({ ...mine, checked_out_at: null }) : null,
    pulse_eligibility: {
      can_pulse: reason == null,
      reason,
      cooldown_until: cooldown,
      questions: allQuestions.filter((q) => q.phase === 'present'),
      leaving_questions: allQuestions.filter((q) => q.phase === 'leaving'),
      my_last_pulse: lastPulse
        ? {
            id: lastPulse.id,
            energy: lastPulse.energy,
            created_at: lastPulse.created_at,
            editable_until: editableUntil(lastPulse.created_at, config),
          }
        : null,
    },
    hub: hub ? { id: hub.id, name: hub.name, joined } : null,
    is_manager: isManager,
  };
  return serializePlaceDetail(place, enrichments.get(place.id)!, extras, { nowMs });
}
