import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { categoryQuestionKey } from '@/lib/places/categories';
import type { PlacesConfig } from '@/lib/places/config';
import { resolvePresence, type Presence } from '@/lib/places/presence';
import { PULSE_QUESTIONS_VERSION, summarizePulse } from '@/lib/places/pulse';
import type { PulseSummary } from '@/lib/places/types';
import { isEventLiveForCheckIn } from '@/lib/server/eventEngagement';
import { loadActiveCheckIn, userCountsForInsights } from '@/lib/server/places/checkIns';
import { loadOfficialEvents, loadPulseRows } from '@/lib/server/places/enrich';
import { isPlaceManager, type ConsumerPlaceRow } from '@/lib/server/places/loadPlace';

/** Pulse create / patch (§5.5). Every rule returns a typed error the route maps to apiError. */

export type PulseFailure = { ok: false; status: number; code: string; message: string; extra?: Record<string, unknown> };

function failure(status: number, code: string, message: string, extra?: Record<string, unknown>): PulseFailure {
  return { ok: false, status, code, message, ...(extra ? { extra } : {}) };
}

function check(label: string, error: { message: string } | null): void {
  if (error) throw new Error(`place pulse ${label}: ${error.message}`);
}

export async function loadPulseSummaryForPlace(
  admin: SupabaseClient,
  placeId: string,
  config: PlacesConfig,
  nowMs: number,
): Promise<PulseSummary> {
  const sinceIso = new Date(nowMs - config.lastPulseLookbackHours * 3_600_000).toISOString();
  const rows = (await loadPulseRows(admin, [placeId], sinceIso)).get(placeId) ?? [];
  return summarizePulse(rows, nowMs, config);
}

/** Presence for Pulse (§4.4): active check-in, open check-in at a live official event, recent handshake. */
export async function loadPresence(
  admin: SupabaseClient,
  place: ConsumerPlaceRow,
  userId: string,
  config: PlacesConfig,
  nowMs: number,
): Promise<Presence> {
  const encounterSinceIso = new Date(nowMs - config.presenceEncounterWindowMinutes * 60_000).toISOString();
  const [openCheckIn, events, encounter] = await Promise.all([
    loadActiveCheckIn(admin, place.id, userId, nowMs),
    loadOfficialEvents(admin, [place.id], userId, nowMs),
    admin
      .from('connection_encounters')
      .select('encountered_at')
      .eq('place_id', place.id)
      .eq('reporting_user_id', userId)
      .gt('encountered_at', encounterSinceIso)
      .order('encountered_at', { ascending: false })
      .limit(1),
  ]);
  check('encounter', encounter.error);

  let eventCheckIn: { beacon_id: string; is_live: boolean } | null = null;
  const liveEvents = (events.get(place.id) ?? []).filter((e) => isEventLiveForCheckIn(e.metadata, nowMs));
  if (liveEvents.length > 0) {
    const { data, error } = await admin
      .from('event_check_ins')
      .select('beacon_id')
      .eq('user_id', userId)
      .is('checked_out_at', null)
      .in('beacon_id', liveEvents.map((e) => e.beacon_id))
      .limit(1);
    check('event check-in', error);
    const beaconId = ((data ?? []) as Array<{ beacon_id: string }>)[0]?.beacon_id;
    if (beaconId) eventCheckIn = { beacon_id: beaconId, is_live: true };
  }

  return resolvePresence({
    openCheckIn,
    eventCheckIn,
    recentEncounter: ((encounter.data ?? []) as Array<{ encountered_at: string }>)[0] ?? null,
    nowMs,
    config,
  });
}

export type LastPulse = { id: string; energy: number | null; created_at: string };

export async function loadNewestPulse(
  admin: SupabaseClient,
  placeId: string,
  userId: string,
  options: { energyOnly: boolean },
): Promise<LastPulse | null> {
  let query = admin
    .from('place_pulses')
    .select('id, energy, created_at')
    .eq('place_id', placeId)
    .eq('user_id', userId);
  if (options.energyOnly) query = query.not('energy', 'is', null);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(1);
  check('newest', error);
  return ((data ?? []) as LastPulse[])[0] ?? null;
}

export function cooldownUntil(last: LastPulse | null, config: PlacesConfig, nowMs: number): string | null {
  if (!last) return null;
  const until = Date.parse(last.created_at) + config.pulseCooldownMinutes * 60_000;
  return until > nowMs ? new Date(until).toISOString() : null;
}

export function editableUntil(createdAtIso: string, config: PlacesConfig): string {
  return new Date(Date.parse(createdAtIso) + config.pulseEditWindowMinutes * 60_000).toISOString();
}

type Answers = {
  energy?: number | null;
  talkable?: number | null;
  category_answer?: number | null;
  would_return?: number | null;
  question_version?: number;
};

const isIn = (v: unknown, allowed: number[]) => typeof v === 'number' && allowed.includes(v);

function validateAnswers(place: ConsumerPlaceRow, body: Answers): PulseFailure | null {
  if (body.energy != null && !isIn(body.energy, [1, 2, 3, 4])) return failure(400, 'invalid_answer', 'energy must be 1–4');
  if (body.talkable != null && !isIn(body.talkable, [0, 1])) return failure(400, 'invalid_answer', 'talkable must be 0 or 1');
  if (body.would_return != null && !isIn(body.would_return, [0, 1])) {
    return failure(400, 'invalid_answer', 'would_return must be 0 or 1');
  }
  if (body.category_answer != null) {
    if (!categoryQuestionKey(place.category)) return failure(400, 'invalid_answer', 'This Place has no category question');
    if (!isIn(body.category_answer, [1, 2, 3])) return failure(400, 'invalid_answer', 'category_answer must be 1–3');
  }
  return null;
}

export async function createPulse(
  admin: SupabaseClient,
  input: { place: ConsumerPlaceRow; userId: string; body: Answers; config: PlacesConfig; nowMs: number },
): Promise<{ ok: true; pulse: { id: string; editable_until: string }; summary: PulseSummary; hasFollowup: boolean } | PulseFailure> {
  const { place, userId, body, config, nowMs } = input;

  // 2. Managers can't Pulse their own Place (D6).
  if (await isPlaceManager(admin, place.id, userId)) {
    return failure(403, 'manager_pulse_not_allowed', "Managers can't Pulse their own Place");
  }

  // 3. Something to record, in range.
  const hasEnergy = body.energy != null;
  if (!hasEnergy && body.would_return == null) return failure(400, 'empty_pulse', 'Send energy or would_return');
  const invalid = validateAnswers(place, body);
  if (invalid) return invalid;

  // 4. Presence.
  const presence = await loadPresence(admin, place, userId, config, nowMs);
  let proof: { proof: string; weight: number; checkInId: string | null; beaconId: string | null } | null = presence.present
    ? { proof: presence.proof, weight: presence.weight, checkInId: presence.checkInId ?? null, beaconId: presence.beaconId ?? null }
    : null;
  if (!proof && !hasEnergy) {
    // A would-return answer right after leaving.
    const sinceIso = new Date(nowMs - config.wouldReturnWindowMinutes * 60_000).toISOString();
    const { data, error } = await admin
      .from('place_check_ins')
      .select('id, proof, proof_weight')
      .eq('place_id', place.id)
      .eq('user_id', userId)
      .gte('checked_out_at', sinceIso)
      .order('checked_out_at', { ascending: false })
      .limit(1);
    check('recent check-out', error);
    const last = ((data ?? []) as Array<{ id: string; proof: string | null; proof_weight: number | null }>)[0];
    if (last) proof = { proof: last.proof ?? 'gps', weight: last.proof_weight ?? 0.6, checkInId: last.id, beaconId: null };
  }
  if (!proof) return failure(403, 'not_present', 'Check in at this Place first');

  // 5. Cooldown (energy only).
  if (hasEnergy) {
    const until = cooldownUntil(await loadNewestPulse(admin, place.id, userId, { energyOnly: true }), config, nowMs);
    if (until) return failure(429, 'pulse_cooldown', 'You can update your Pulse later', { cooldown_until: until });
  }

  // 6. Insert.
  const categoryQuestion = body.category_answer != null ? categoryQuestionKey(place.category) : null;
  const createdAt = new Date(nowMs).toISOString();
  const { data, error } = await admin
    .from('place_pulses')
    .insert({
      place_id: place.id,
      user_id: userId,
      check_in_id: proof.checkInId,
      beacon_id: proof.beaconId,
      proof: proof.proof,
      proof_weight: Math.min(1, Math.max(0.01, proof.weight)),
      energy: body.energy ?? null,
      talkable: body.talkable ?? null,
      category_question: categoryQuestion,
      category_answer: categoryQuestion ? body.category_answer : null,
      would_return: body.would_return ?? null,
      question_version: body.question_version ?? PULSE_QUESTIONS_VERSION,
      count_for_insights: await userCountsForInsights(admin, userId),
      created_at: createdAt,
      updated_at: createdAt,
    })
    .select('id, created_at')
    .single();
  check('insert', error);
  const row = data as { id: string; created_at: string };

  return {
    ok: true,
    pulse: { id: row.id, editable_until: editableUntil(row.created_at ?? createdAt, config) },
    summary: await loadPulseSummaryForPlace(admin, place.id, config, nowMs),
    hasFollowup: body.talkable != null || body.category_answer != null,
  };
}

export async function patchPulse(
  admin: SupabaseClient,
  input: {
    place: ConsumerPlaceRow;
    userId: string;
    pulseId: string;
    body: { talkable?: number | null; category_answer?: number | null };
    config: PlacesConfig;
    nowMs: number;
  },
): Promise<{ ok: true; summary: PulseSummary } | PulseFailure> {
  const { place, userId, pulseId, body, config, nowMs } = input;
  const { data, error } = await admin
    .from('place_pulses')
    .select('id, user_id, created_at, talkable, category_answer')
    .eq('id', pulseId)
    .eq('place_id', place.id)
    .maybeSingle();
  check('patch read', error);
  const pulse = data as { id: string; user_id: string | null; created_at: string; talkable: number | null; category_answer: number | null } | null;
  if (!pulse || pulse.user_id !== userId) return failure(404, 'pulse_not_found', 'Pulse not found');

  if (body.talkable == null && body.category_answer == null) return failure(400, 'empty_pulse', 'Send talkable or category_answer');
  const invalid = validateAnswers(place, body);
  if (invalid) return invalid;

  const editable = Date.parse(editableUntil(pulse.created_at, config)) > nowMs;
  const overwrites =
    (body.talkable != null && pulse.talkable != null) || (body.category_answer != null && pulse.category_answer != null);
  if (!editable || overwrites) return failure(409, 'pulse_not_editable', 'This Pulse can no longer be changed');

  const patch: Record<string, unknown> = { updated_at: new Date(nowMs).toISOString() };
  if (body.talkable != null) patch.talkable = body.talkable;
  if (body.category_answer != null) {
    patch.category_answer = body.category_answer;
    patch.category_question = categoryQuestionKey(place.category);
  }
  const { error: updateErr } = await admin.from('place_pulses').update(patch).eq('id', pulse.id);
  check('patch', updateErr);
  return { ok: true, summary: await loadPulseSummaryForPlace(admin, place.id, config, nowMs) };
}
