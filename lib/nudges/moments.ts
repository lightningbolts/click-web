import type { SupabaseClient } from '@supabase/supabase-js';
import { reconnectNudgeCopy, sharedEventNudgeCopy } from '@/lib/cron/nudgesReconnect';
import { cronPushBearer, pushFunctionUrl } from '@/lib/server/cronAuth';

/**
 * Relationship moments: every server nudge kind, its copy, when it's due, and one delivery
 * path (in-app row + optional push) shared by the cron and the API routes.
 */
export type NudgeType =
  | 'reconnect_lull'
  | 'shared_upcoming_event'
  | 'anniversary'
  | 'memory_prompt'
  | 'group_revival'
  | 'wave'
  | 'hangout_confirm';

export const NUDGE_TYPES: readonly NudgeType[] = [
  'reconnect_lull',
  'shared_upcoming_event',
  'anniversary',
  'memory_prompt',
  'group_revival',
  'wave',
  'hangout_confirm',
];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function str(payload: Record<string, unknown>, key: string, fallback: string): string {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

/** Headline and body for any nudge, from its stored payload (never from the client). */
export function nudgeCopy(type: NudgeType, payload: Record<string, unknown>): { title: string; body: string } {
  const peer = str(payload, 'peer_first_name', 'a connection');
  const place = typeof payload.place_name === 'string' && payload.place_name.trim() ? payload.place_name.trim() : null;
  switch (type) {
    case 'shared_upcoming_event':
      return sharedEventNudgeCopy({ peerFirstName: peer, eventTitle: str(payload, 'event_title', 'an upcoming event') });
    case 'reconnect_lull':
      return reconnectNudgeCopy({
        peerFirstName: peer,
        daysSinceEncounter: typeof payload.days_since_encounter === 'number' ? payload.days_since_encounter : 21,
      });
    case 'anniversary': {
      const milestone = str(payload, 'milestone_label', 'a while');
      return {
        title: `${milestone} since you met ${peer}`,
        body: place ? `You first Clicked at ${place}. Say hi, or make a new memory.` : 'Say hi, or make a new memory.',
      };
    }
    case 'memory_prompt':
      return {
        title: `How was it with ${peer}?`,
        body: place ? `Add a photo or note from ${place} to your shared timeline.` : 'Add a photo or note to your shared timeline.',
      };
    case 'group_revival': {
      const group = str(payload, 'group_name', 'your group');
      const days = typeof payload.quiet_days === 'number' ? payload.quiet_days : 21;
      const weeks = Math.max(3, Math.round(days / 7));
      return { title: `It's been quiet in ${group}`, body: `${weeks} weeks without a message. Plan something?` };
    }
    case 'wave':
      return { title: `${peer} waved at you 👋`, body: 'Wave back or say hi.' };
    case 'hangout_confirm':
      return payload.source === 'nearby'
        ? { title: `Hanging out with ${peer}?`, body: place ? `Log it on your timeline, ${place}.` : 'Log it on your shared timeline.' }
        : { title: `${peer} logged your hangout`, body: place ? `Confirm you were together at ${place}.` : 'Confirm you were together.' };
  }
}

// MARK: - When moments are due (pure; hourly sweep)

export type AnniversaryMilestone = { key: string; label: string; atMs: number };

export function addUtcMonths(ms: number, months: number): number {
  const date = new Date(ms);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime();
}

/**
 * The milestone (1 month, 6 months, then every year) whose instant fell in the last
 * `windowMs`. Firing at the same time of day as the first meeting keeps pushes at a hour
 * people were already out together, without knowing their time zone.
 */
export function dueAnniversary(firstMetMs: number, nowMs: number, windowMs = 2 * HOUR_MS): AnniversaryMilestone | null {
  const candidates: AnniversaryMilestone[] = [
    { key: 'm1', label: '1 month', atMs: addUtcMonths(firstMetMs, 1) },
    { key: 'm6', label: '6 months', atMs: addUtcMonths(firstMetMs, 6) },
  ];
  const years = Math.floor((nowMs - firstMetMs) / (365 * DAY_MS)) + 1;
  for (let y = Math.max(1, years - 1); y <= years; y += 1) {
    candidates.push({ key: `y${y}`, label: y === 1 ? '1 year' : `${y} years`, atMs: addUtcMonths(firstMetMs, 12 * y) });
  }
  return candidates.find((m) => m.atMs <= nowMs && nowMs - m.atMs < windowMs) ?? null;
}

/** The day after an encounter, around the same time of day (20–28 hours later). */
export function isMemoryPromptDue(encounterMs: number, nowMs: number): boolean {
  const age = nowMs - encounterMs;
  return age >= 20 * HOUR_MS && age < 28 * HOUR_MS;
}

export const GROUP_QUIET_MS = 21 * DAY_MS;
/** Groups quiet for longer than this aren't revived (they've moved on). */
export const GROUP_REVIVAL_MAX_MS = 120 * DAY_MS;

export function isGroupRevivalDue(lastMessageMs: number, nowMs: number): boolean {
  const quiet = nowMs - lastMessageMs;
  return quiet >= GROUP_QUIET_MS && quiet < GROUP_REVIVAL_MAX_MS;
}

// MARK: - Delivery

type PushPreference = 'reconnect_nudge_push_enabled' | 'message_push_enabled';

async function userAllowsPush(admin: SupabaseClient, userId: string, preference: PushPreference): Promise<boolean> {
  const { data } = await admin.from('notification_preferences').select(preference).eq('user_id', userId).maybeSingle();
  const row = data as Record<string, unknown> | null;
  return !row || row[preference] !== false;
}

export async function sendPush(
  pushUrl: string,
  bearer: string,
  recipientUserId: string,
  copy: { title: string; body: string },
  data: Record<string, unknown>,
): Promise<boolean> {
  try {
    const response = await fetch(pushUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_user_id: recipientUserId, title: copy.title, body: copy.body, data }),
    });
    return response.ok;
  } catch (e) {
    console.warn('[nudges] push error:', recipientUserId, e);
    return false;
  }
}

export type NudgeDelivery = {
  userId: string;
  type: NudgeType;
  dedupeKey: string;
  payload: Record<string, unknown>;
  connectionId?: string | null;
  beaconId?: string | null;
};

export type PushContext = {
  pushUrl: string | null;
  bearer: string | null;
  preference: PushPreference;
  /** Users already pushed in this run: at most one moment push per person per sweep. */
  pushedThisRun?: Set<string>;
};

/**
 * Inserts the in-app nudge (a duplicate dedupe key is a no-op) and pushes it when the user
 * allows it. Returns 'duplicate' when this moment was already delivered.
 */
export async function deliverNudge(
  admin: SupabaseClient,
  nudge: NudgeDelivery,
  push: PushContext | null,
  nowIso: string = new Date().toISOString(),
): Promise<'created' | 'duplicate' | 'error'> {
  const { data, error } = await admin
    .from('nudges')
    .insert({
      user_id: nudge.userId,
      nudge_type: nudge.type,
      dedupe_key: nudge.dedupeKey,
      payload: nudge.payload,
      connection_id: nudge.connectionId ?? null,
      beacon_id: nudge.beaconId ?? null,
      sent_at: nowIso,
    })
    .select('id')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') return 'duplicate';
    console.warn('[nudges] insert:', nudge.type, error.message);
    return 'error';
  }
  if (!push?.pushUrl || !push.bearer) return 'created';
  if (push.pushedThisRun?.has(nudge.userId)) return 'created';
  if (!(await userAllowsPush(admin, nudge.userId, push.preference))) return 'created';
  push.pushedThisRun?.add(nudge.userId);
  const id = (data as { id?: string } | null)?.id;
  await sendPush(push.pushUrl, push.bearer, nudge.userId, nudgeCopy(nudge.type, nudge.payload), {
    type: nudge.type,
    nudge_id: id,
    ...(nudge.connectionId ? { connection_id: nudge.connectionId } : {}),
    ...Object.fromEntries(
      ['chat_id', 'group_id', 'peer_user_id', 'confirmation_id'].flatMap((key) =>
        typeof nudge.payload[key] === 'string' ? [[key, nudge.payload[key]]] : [],
      ),
    ),
  });
  return 'created';
}

/** Marks a user's open nudges of a kind for a key resolved (acted on or dismissed). */
export async function resolveNudges(
  admin: SupabaseClient,
  filter: { type: NudgeType; dedupeKey: string; userIds?: string[] },
  field: 'acted_on_at' | 'dismissed_at',
): Promise<void> {
  let query = admin
    .from('nudges')
    .update({ [field]: new Date().toISOString(), ...(field === 'acted_on_at' ? { dismissed_at: new Date().toISOString() } : {}) })
    .eq('nudge_type', filter.type)
    .eq('dedupe_key', filter.dedupeKey)
    .is('dismissed_at', null);
  if (filter.userIds) query = query.in('user_id', filter.userIds);
  const { error } = await query;
  if (error) console.warn('[nudges] resolve:', filter.type, error.message);
}

/** Push settings for user-triggered moments (waves, hangout prompts). */
export function userPushContext(): PushContext {
  return { pushUrl: pushFunctionUrl(), bearer: cronPushBearer(), preference: 'message_push_enabled' };
}
