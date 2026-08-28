import type { SupabaseClient } from '@supabase/supabase-js';
import { isActiveIshConnection } from '@/lib/events/attendeeDirectory';
import { HANDSHAKE_CONNECTION_SOURCE } from '@/lib/connections/priorConnections';

export const LULL_AFTER_ENCOUNTER_MS = 21 * 24 * 60 * 60 * 1000;
export const NUDGE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export type ReconnectEligibilityInput = {
  lastEncounterAtMs: number | null;
  lastMessageAtMs: number | null;
  lastNudgeSentAtMs: number | null;
  snoozedUntilMs: number | null;
  nowMs: number;
  source: string | null;
  hasEncounter: boolean;
};

export function isReconnectEligible(input: ReconnectEligibilityInput): boolean {
  if (input.snoozedUntilMs != null && input.nowMs < input.snoozedUntilMs) return false;
  if (input.lastNudgeSentAtMs != null && input.nowMs - input.lastNudgeSentAtMs < NUDGE_COOLDOWN_MS) {
    return false;
  }
  const handshake = (input.source ?? HANDSHAKE_CONNECTION_SOURCE) === HANDSHAKE_CONNECTION_SOURCE;
  if (!handshake && !input.hasEncounter) return false;
  if (input.lastEncounterAtMs == null) return false;
  const lullStart = input.lastEncounterAtMs + LULL_AFTER_ENCOUNTER_MS;
  if (input.nowMs < lullStart) return false;
  if (input.lastMessageAtMs == null) return true;
  return input.lastMessageAtMs < input.lastEncounterAtMs;
}

export function daysSince(fromMs: number, nowMs: number): number {
  return Math.max(1, Math.round((nowMs - fromMs) / (24 * 60 * 60 * 1000)));
}

export function reconnectNudgeCopy(args: {
  peerFirstName: string;
  daysSinceEncounter: number;
}): { title: string; body: string } {
  const name = args.peerFirstName.trim() || 'a connection';
  const days = args.daysSinceEncounter;
  const when = days === 1 ? 'yesterday' : `${days} days ago`;
  return {
    title: `Check in with ${name}`,
    body: `You and ${name} haven't talked since you Clicked ${when}.`,
  };
}

export function sharedEventNudgeCopy(args: {
  peerFirstName: string;
  eventTitle: string;
}): { title: string; body: string } {
  const name = args.peerFirstName.trim() || 'a connection';
  const event = args.eventTitle.trim() || 'an upcoming event';
  return {
    title: `${name} is going too`,
    body: `You and ${name} are both going to ${event}.`,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function otherUserId(userIds: unknown, viewerId: string): string | null {
  if (!Array.isArray(userIds)) return null;
  const ids = userIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return ids.find((id) => id !== viewerId) ?? null;
}

function firstNameFromUser(row: Record<string, unknown>): string {
  const first = typeof row.first_name === 'string' ? row.first_name.trim() : '';
  if (first) return first;
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (name) return name.split(/\s+/)[0] ?? name;
  return 'a connection';
}

async function sendPush(
  pushUrl: string,
  authBearer: string,
  recipientUserId: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  try {
    const response = await fetch(pushUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authBearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient_user_id: recipientUserId,
        title,
        body,
        data,
      }),
    });
    return response.ok;
  } catch (e) {
    console.warn('[nudges] push error:', recipientUserId, e);
    return false;
  }
}

async function userAllowsReconnectPush(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('notification_preferences')
    .select('reconnect_nudge_push_enabled')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data || !isRecord(data)) return true;
  return data.reconnect_nudge_push_enabled !== false;
}

type ConnectionScanRow = {
  id: string;
  user_ids: string[] | null;
  last_message_at: number | null;
  source: string | null;
  status: string | null;
  expiry_state: string | null;
};

export async function refreshActivitySummaries(
  admin: SupabaseClient,
  nowMs: number,
): Promise<number> {
  const { data: connections, error } = await admin
    .from('connections')
    .select('id, user_ids, last_message_at, source, status, expiry_state')
    .in('status', ['active', 'kept', 'pending']);

  if (error) {
    throw new Error(`nudges summary connections: ${error.message}`);
  }
  const rows = (connections ?? []) as ConnectionScanRow[];
  if (rows.length === 0) return 0;

  const ids = rows.map((r) => r.id);
  const encounterByConnection = new Map<string, string>();
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data: encounters } = await admin
      .from('connection_encounters')
      .select('connection_id, encountered_at')
      .in('connection_id', chunk)
      .order('encountered_at', { ascending: false });
    for (const enc of encounters ?? []) {
      if (!isRecord(enc) || typeof enc.connection_id !== 'string') continue;
      if (encounterByConnection.has(enc.connection_id)) continue;
      if (typeof enc.encountered_at === 'string') {
        encounterByConnection.set(enc.connection_id, enc.encountered_at);
      }
    }
  }

  const { data: existing } = await admin
    .from('connection_activity_summary')
    .select('connection_id, last_nudge_sent_at, nudge_snoozed_until')
    .in('connection_id', ids);
  const extra = new Map<string, { last_nudge_sent_at: string | null; nudge_snoozed_until: string | null }>();
  for (const row of existing ?? []) {
    if (!isRecord(row) || typeof row.connection_id !== 'string') continue;
    extra.set(row.connection_id, {
      last_nudge_sent_at: typeof row.last_nudge_sent_at === 'string' ? row.last_nudge_sent_at : null,
      nudge_snoozed_until: typeof row.nudge_snoozed_until === 'string' ? row.nudge_snoozed_until : null,
    });
  }

  const upserts = rows.map((row) => {
    const lastEncounterIso = encounterByConnection.get(row.id) ?? null;
    const lastEncounterAtMs = lastEncounterIso ? Date.parse(lastEncounterIso) : null;
    const eligible =
      lastEncounterAtMs != null && Number.isFinite(lastEncounterAtMs)
        ? new Date(lastEncounterAtMs + LULL_AFTER_ENCOUNTER_MS).toISOString()
        : null;
    const prev = extra.get(row.id);
    return {
      connection_id: row.id,
      last_message_at: typeof row.last_message_at === 'number' ? row.last_message_at : null,
      last_encounter_at: lastEncounterIso,
      nudge_eligible_at: eligible,
      last_nudge_sent_at: prev?.last_nudge_sent_at ?? null,
      nudge_snoozed_until: prev?.nudge_snoozed_until ?? null,
    };
  });

  const { error: upErr } = await admin
    .from('connection_activity_summary')
    .upsert(upserts, { onConflict: 'connection_id' });
  if (upErr) {
    throw new Error(`nudges summary upsert: ${upErr.message}`);
  }
  void nowMs;
  return upserts.length;
}

export async function runReconnectNudges(
  admin: SupabaseClient,
  pushUrl: string,
  authBearer: string,
  nowMs: number = Date.now(),
): Promise<{ scanned: number; created: number; pushAttempts: number }> {
  const scanned = await refreshActivitySummaries(admin, nowMs);
  const nowIso = new Date(nowMs).toISOString();

  const { data: summaries, error } = await admin
    .from('connection_activity_summary')
    .select('connection_id, last_message_at, last_encounter_at, last_nudge_sent_at, nudge_snoozed_until')
    .not('last_encounter_at', 'is', null)
    .or(`nudge_snoozed_until.is.null,nudge_snoozed_until.lt.${nowIso}`);

  if (error) {
    throw new Error(`nudges scan: ${error.message}`);
  }

  const summaryRows = summaries ?? [];
  if (summaryRows.length === 0) return { scanned, created: 0, pushAttempts: 0 };

  const connectionIds = summaryRows
    .map((r) => (isRecord(r) && typeof r.connection_id === 'string' ? r.connection_id : null))
    .filter((id): id is string => !!id);

  const { data: connections } = await admin
    .from('connections')
    .select('id, user_ids, last_message_at, source, status, expiry_state')
    .in('id', connectionIds);

  const connById = new Map<string, ConnectionScanRow>();
  const userIds = new Set<string>();
  for (const row of connections ?? []) {
    if (!isRecord(row) || typeof row.id !== 'string') continue;
    const ids = Array.isArray(row.user_ids)
      ? row.user_ids.filter((id): id is string => typeof id === 'string')
      : [];
    connById.set(row.id, {
      id: row.id,
      user_ids: ids,
      last_message_at: typeof row.last_message_at === 'number' ? row.last_message_at : null,
      source: typeof row.source === 'string' ? row.source : null,
      status: typeof row.status === 'string' ? row.status : null,
      expiry_state: typeof row.expiry_state === 'string' ? row.expiry_state : null,
    });
    for (const id of ids) userIds.add(id);
  }

  const { data: profiles } = await admin
    .from('users')
    .select('id, first_name, name')
    .in('id', [...userIds]);
  const nameById = new Map<string, string>();
  for (const row of profiles ?? []) {
    if (!isRecord(row) || typeof row.id !== 'string') continue;
    nameById.set(row.id, firstNameFromUser(row));
  }

  let created = 0;
  let pushAttempts = 0;

  for (const summary of summaryRows) {
    if (!isRecord(summary) || typeof summary.connection_id !== 'string') continue;
    const conn = connById.get(summary.connection_id);
    if (!conn) continue;
    if (!isActiveIshConnection(conn)) continue;
    const lastEncounterAtMs =
      typeof summary.last_encounter_at === 'string' ? Date.parse(summary.last_encounter_at) : null;
    const lastNudgeSentAtMs =
      typeof summary.last_nudge_sent_at === 'string' ? Date.parse(summary.last_nudge_sent_at) : null;
    const snoozedUntilMs =
      typeof summary.nudge_snoozed_until === 'string' ? Date.parse(summary.nudge_snoozed_until) : null;
    if (
      !isReconnectEligible({
        lastEncounterAtMs: lastEncounterAtMs != null && Number.isFinite(lastEncounterAtMs) ? lastEncounterAtMs : null,
        lastMessageAtMs: conn.last_message_at,
        lastNudgeSentAtMs:
          lastNudgeSentAtMs != null && Number.isFinite(lastNudgeSentAtMs) ? lastNudgeSentAtMs : null,
        snoozedUntilMs: snoozedUntilMs != null && Number.isFinite(snoozedUntilMs) ? snoozedUntilMs : null,
        nowMs,
        source: conn.source,
        hasEncounter: lastEncounterAtMs != null,
      })
    ) {
      continue;
    }

    const ids = conn.user_ids ?? [];
    if (ids.length !== 2) continue;
    const [userA, userB] = ids;
    const days = lastEncounterAtMs != null ? daysSince(lastEncounterAtMs, nowMs) : 21;

    for (const [userId, peerId] of [
      [userA, userB],
      [userB, userA],
    ] as const) {
      if (!(await userAllowsReconnectPush(admin, userId))) continue;
      const peerName = nameById.get(peerId) ?? 'a connection';
      const copy = reconnectNudgeCopy({ peerFirstName: peerName, daysSinceEncounter: days });
      const payload = {
        peer_first_name: peerName,
        days_since_encounter: days,
      };
      const { data: inserted, error: insErr } = await admin
        .from('nudges')
        .insert({
          user_id: userId,
          connection_id: conn.id,
          nudge_type: 'reconnect_lull',
          payload,
          sent_at: nowIso,
        })
        .select('id')
        .maybeSingle();
      if (insErr) {
        if (insErr.code === '23505') continue;
        console.warn('[nudges] insert:', insErr.message);
        continue;
      }
      created += 1;
      const sent = await sendPush(pushUrl, authBearer, userId, copy.title, copy.body, {
        type: 'reconnect_nudge',
        connection_id: conn.id,
        nudge_id: isRecord(inserted) && typeof inserted.id === 'string' ? inserted.id : undefined,
      });
      if (sent) pushAttempts += 1;
    }

    await admin
      .from('connection_activity_summary')
      .update({ last_nudge_sent_at: nowIso })
      .eq('connection_id', conn.id);
  }

  return { scanned, created, pushAttempts };
}
