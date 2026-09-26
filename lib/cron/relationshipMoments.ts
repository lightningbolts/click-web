import type { SupabaseClient } from '@supabase/supabase-js';
import { isActiveIshConnection } from '@/lib/events/attendeeDirectory';
import { sweepHangouts } from '@/lib/hangouts/hangouts';
import {
  addUtcMonths,
  deliverNudge,
  dueAnniversary,
  GROUP_QUIET_MS,
  GROUP_REVIVAL_MAX_MS,
  isGroupRevivalDue,
  isMemoryPromptDue,
  type PushContext,
} from '@/lib/nudges/moments';

/**
 * Hourly relationship moments (runs with the reconnect sweep):
 * - anniversaries of the first meeting (1 month, 6 months, every year), at the time of day
 *   you met;
 * - a memory prompt the day after each encounter;
 * - group revival once a formerly active group has gone quiet for three weeks;
 * - expiry of unanswered hangout confirmations and old presence pings.
 * Every moment is deduplicated in `nudges`, and each person gets at most one push per sweep.
 */

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_MS = 2 * HOUR_MS;
const ANNIVERSARY_MONTHS = [1, 6, ...Array.from({ length: 10 }, (_, i) => 12 * (i + 1))];
const MIN_GROUP_MESSAGES = 10;
const MIN_GROUP_MEMBERS = 3;

type EncounterRow = {
  id: string;
  connection_id: string;
  encountered_at: string;
  location_name: string | null;
  semantic_location: Record<string, unknown> | null;
};
type ConnectionRow = { id: string; user_ids: string[] | null; status: string | null; expiry_state: string | null };

export function placeName(row: Pick<EncounterRow, 'location_name' | 'semantic_location'>): string | null {
  const named = row.semantic_location?.name;
  if (typeof named === 'string' && named.trim()) return named.trim();
  const first = row.location_name?.split(',')[0]?.trim();
  return first || null;
}

async function activePairs(admin: SupabaseClient, ids: string[]): Promise<Map<string, [string, string]>> {
  const pairs = new Map<string, [string, string]>();
  if (ids.length === 0) return pairs;
  const { data } = await admin.from('connections').select('id, user_ids, status, expiry_state').in('id', ids);
  for (const row of (data ?? []) as ConnectionRow[]) {
    const users = (row.user_ids ?? []).map(String);
    if (users.length === 2 && isActiveIshConnection(row)) pairs.set(row.id, [users[0], users[1]]);
  }
  return pairs;
}

async function firstNames(admin: SupabaseClient, ids: Iterable<string>): Promise<Map<string, string>> {
  const list = Array.from(new Set(ids));
  const names = new Map<string, string>();
  if (list.length === 0) return names;
  const { data } = await admin.from('users').select('id, first_name, name').in('id', list);
  for (const row of (data ?? []) as Array<{ id: string; first_name?: string | null; name?: string | null }>) {
    names.set(row.id, row.first_name?.trim() || row.name?.trim().split(/\s+/)[0] || 'a connection');
  }
  return names;
}

const ENCOUNTER_COLUMNS = 'id, connection_id, encountered_at, location_name, semantic_location';

async function runAnniversaries(admin: SupabaseClient, nowMs: number, push: PushContext): Promise<number> {
  // Encounters whose date is exactly a milestone ago (± the sweep window)...
  const windows = ANNIVERSARY_MONTHS.map((months) => ({
    from: new Date(addUtcMonths(nowMs - WINDOW_MS, -months)).toISOString(),
    to: new Date(addUtcMonths(nowMs, -months)).toISOString(),
  }));
  const candidates = new Map<string, EncounterRow>();
  for (const w of windows) {
    const { data } = await admin
      .from('connection_encounters')
      .select(ENCOUNTER_COLUMNS)
      .gte('encountered_at', w.from)
      .lte('encountered_at', w.to)
      .limit(500);
    for (const row of (data ?? []) as EncounterRow[]) candidates.set(row.connection_id, row);
  }
  if (candidates.size === 0) return 0;

  // ...that were the pair's first meeting.
  const pairs = await activePairs(admin, [...candidates.keys()]);
  const names = await firstNames(admin, [...pairs.values()].flat());
  let created = 0;
  for (const [connectionId, users] of pairs) {
    const { data: first } = await admin
      .from('connection_encounters')
      .select(ENCOUNTER_COLUMNS)
      .eq('connection_id', connectionId)
      .order('encountered_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const firstRow = first as EncounterRow | null;
    if (!firstRow) continue;
    const milestone = dueAnniversary(Date.parse(firstRow.encountered_at), nowMs, WINDOW_MS);
    if (!milestone) continue;
    for (const [userId, peerId] of [users, [users[1], users[0]]] as const) {
      const result = await deliverNudge(
        admin,
        {
          userId,
          type: 'anniversary',
          dedupeKey: `${connectionId}:${milestone.key}`,
          connectionId,
          payload: {
            peer_user_id: peerId,
            peer_first_name: names.get(peerId) ?? 'a connection',
            milestone_label: milestone.label,
            first_met_at: firstRow.encountered_at,
            place_name: placeName(firstRow),
          },
        },
        push,
      );
      if (result === 'created') created += 1;
    }
  }
  return created;
}

async function runMemoryPrompts(admin: SupabaseClient, nowMs: number, push: PushContext): Promise<number> {
  const { data } = await admin
    .from('connection_encounters')
    .select(ENCOUNTER_COLUMNS)
    .gte('encountered_at', new Date(nowMs - 28 * HOUR_MS).toISOString())
    .lte('encountered_at', new Date(nowMs - 20 * HOUR_MS).toISOString())
    .limit(1000);
  const rows = ((data ?? []) as EncounterRow[]).filter((row) => isMemoryPromptDue(Date.parse(row.encountered_at), nowMs));
  if (rows.length === 0) return 0;
  const pairs = await activePairs(admin, rows.map((r) => r.connection_id));
  const names = await firstNames(admin, [...pairs.values()].flat());
  let created = 0;
  for (const row of rows) {
    const users = pairs.get(row.connection_id);
    if (!users) continue;
    for (const [userId, peerId] of [users, [users[1], users[0]]] as const) {
      const result = await deliverNudge(
        admin,
        {
          userId,
          type: 'memory_prompt',
          dedupeKey: row.id,
          connectionId: row.connection_id,
          payload: {
            encounter_id: row.id,
            peer_user_id: peerId,
            peer_first_name: names.get(peerId) ?? 'a connection',
            place_name: placeName(row),
            encountered_at: row.encountered_at,
          },
        },
        push,
      );
      if (result === 'created') created += 1;
    }
  }
  return created;
}

async function runGroupRevival(admin: SupabaseClient, nowMs: number, push: PushContext): Promise<number> {
  const { data: chats } = await admin
    .from('chats')
    .select('id, group_id, updated_at')
    .not('group_id', 'is', null)
    .lte('updated_at', nowMs - GROUP_QUIET_MS)
    .gt('updated_at', nowMs - GROUP_REVIVAL_MAX_MS)
    .limit(500);
  let created = 0;
  for (const chat of (chats ?? []) as Array<{ id: string; group_id: string; updated_at: number }>) {
    if (!isGroupRevivalDue(Number(chat.updated_at), nowMs)) continue;
    const dedupeKey = `${chat.id}:${chat.updated_at}`;
    const [{ count }, { data: members }, { data: group }] = await Promise.all([
      admin.from('messages').select('id', { count: 'exact', head: true }).eq('chat_id', chat.id),
      admin.from('group_members').select('user_id').eq('group_id', chat.group_id),
      admin.from('groups').select('name').eq('id', chat.group_id).maybeSingle(),
    ]);
    const memberIds = ((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
    // Only groups that were genuinely active, with enough people to plan something.
    if ((count ?? 0) < MIN_GROUP_MESSAGES || memberIds.length < MIN_GROUP_MEMBERS) continue;
    const groupName = (group as { name?: string | null } | null)?.name?.trim() || 'your group';
    for (const userId of memberIds) {
      const result = await deliverNudge(
        admin,
        {
          userId,
          type: 'group_revival',
          dedupeKey,
          payload: {
            chat_id: chat.id,
            group_id: chat.group_id,
            group_name: groupName,
            quiet_days: Math.round((nowMs - Number(chat.updated_at)) / (24 * HOUR_MS)),
          },
        },
        push,
      );
      if (result === 'created') created += 1;
    }
  }
  return created;
}

export async function runRelationshipMoments(
  admin: SupabaseClient,
  pushUrl: string | null,
  bearer: string | null,
  nowMs: number = Date.now(),
): Promise<{ anniversaries: number; memoryPrompts: number; groupRevivals: number; hangoutsExpired: number }> {
  const push: PushContext = { pushUrl, bearer, preference: 'reconnect_nudge_push_enabled', pushedThisRun: new Set() };
  // Each part is independent: one failing must not stop the others.
  const safely = async (label: string, run: () => Promise<number>) => {
    try {
      return await run();
    } catch (e) {
      console.error(`[moments] ${label}:`, e instanceof Error ? e.message : e);
      return 0;
    }
  };
  const anniversaries = await safely('anniversaries', () => runAnniversaries(admin, nowMs, push));
  const memoryPrompts = await safely('memory prompts', () => runMemoryPrompts(admin, nowMs, push));
  const groupRevivals = await safely('group revival', () => runGroupRevival(admin, nowMs, push));
  const hangoutsExpired = await safely('hangout sweep', async () => (await sweepHangouts(admin, nowMs)).expired);
  return { anniversaries, memoryPrompts, groupRevivals, hangoutsExpired };
}
