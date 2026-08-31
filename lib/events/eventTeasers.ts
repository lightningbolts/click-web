import type { SupabaseClient } from '@supabase/supabase-js';
import { getSharedInterestTags } from '@/lib/userProfile/sharedInterests';
import { isActiveIshConnection } from '@/lib/events/attendeeDirectory';

export const TEASER_TYPES = [
  'shared_major',
  'shared_org',
  'shared_interest',
  'mutual_connection_count',
] as const;
export type TeaserType = (typeof TEASER_TYPES)[number];

export type TeaserPayload = {
  count: number;
  label: 'interest' | 'org' | 'people you know';
  shared_tag?: string;
};

export type GeneratedTeaser = {
  recipient_user_id: string;
  teaser_type: TeaserType;
  payload: TeaserPayload;
};

export type TeaserProfile = {
  userId: string;
  ghostMode: boolean;
  interestTags: string[];
  groupIds: string[];
};

export type TeaserConnection = {
  userA: string;
  userB: string;
  active: boolean;
};

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Pick one strongest teaser per matched Click user.
 * Ghost-mode users are never counted in others' payloads.
 * Names are never included (anonymized counts only).
 */
export function generateEventTeasers(args: {
  profiles: TeaserProfile[];
  connections: TeaserConnection[];
}): GeneratedTeaser[] {
  const visible = args.profiles.filter((p) => !p.ghostMode);
  if (visible.length < 2) return [];

  const activePairs = new Set<string>();
  for (const c of args.connections) {
    if (c.active) activePairs.add(pairKey(c.userA, c.userB));
  }

  const out: GeneratedTeaser[] = [];
  for (const recipient of visible) {
    const peers = visible.filter((p) => p.userId !== recipient.userId);
    if (peers.length === 0) continue;

    let interestCount = 0;
    let interestTag: string | null = null;
    let orgCount = 0;
    let mutualCount = 0;
    const recipientGroups = new Set(recipient.groupIds);

    for (const peer of peers) {
      const shared = getSharedInterestTags(recipient.interestTags, peer.interestTags);
      if (shared.length > 0) {
        interestCount += 1;
        if (!interestTag) interestTag = shared[0];
      }
      if (peer.groupIds.some((g) => recipientGroups.has(g))) {
        orgCount += 1;
      }
      if (activePairs.has(pairKey(recipient.userId, peer.userId))) {
        mutualCount += 1;
      }
    }

    if (interestCount > 0) {
      out.push({
        recipient_user_id: recipient.userId,
        teaser_type: 'shared_interest',
        payload: {
          count: interestCount,
          label: 'interest',
          ...(interestTag ? { shared_tag: interestTag } : {}),
        },
      });
      continue;
    }
    if (orgCount > 0) {
      out.push({
        recipient_user_id: recipient.userId,
        teaser_type: 'shared_org',
        payload: { count: orgCount, label: 'org' },
      });
      continue;
    }
    if (mutualCount > 0) {
      out.push({
        recipient_user_id: recipient.userId,
        teaser_type: 'mutual_connection_count',
        payload: { count: mutualCount, label: 'people you know' },
      });
    }
  }
  return out;
}

export function teaserHeadline(payload: TeaserPayload): string {
  const n = payload.count;
  const people = n === 1 ? 'person' : 'people';
  const verb = n === 1 ? 'is' : 'are';
  if (payload.label === 'interest') {
    if (payload.shared_tag) {
      return `${n} ${people} going who share your interest in ${payload.shared_tag}`;
    }
    return `${n} ${people} going who share an interest`;
  }
  if (payload.label === 'org') {
    return `${n} ${people} going from a group you are in`;
  }
  return `${n} ${people} you know ${verb} going`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export async function loadTeaserProfiles(
  admin: SupabaseClient,
  userIds: string[],
): Promise<TeaserProfile[]> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const [{ data: users }, { data: interests }, { data: groups }] = await Promise.all([
    admin.from('users').select('id, ghost_mode').in('id', unique),
    admin.from('user_interests').select('user_id, tags').in('user_id', unique),
    admin.from('group_members').select('user_id, group_id').in('user_id', unique),
  ]);

  const ghost = new Map<string, boolean>();
  for (const row of users ?? []) {
    if (!isRecord(row) || typeof row.id !== 'string') continue;
    ghost.set(row.id, row.ghost_mode === true);
  }
  const tags = new Map<string, string[]>();
  for (const row of interests ?? []) {
    if (!isRecord(row) || typeof row.user_id !== 'string') continue;
    const list = Array.isArray(row.tags)
      ? row.tags.filter((t): t is string => typeof t === 'string')
      : [];
    tags.set(row.user_id, list);
  }
  const groupIds = new Map<string, string[]>();
  for (const row of groups ?? []) {
    if (!isRecord(row) || typeof row.user_id !== 'string' || typeof row.group_id !== 'string') {
      continue;
    }
    const list = groupIds.get(row.user_id) ?? [];
    list.push(row.group_id);
    groupIds.set(row.user_id, list);
  }

  return unique.map((userId) => ({
    userId,
    ghostMode: ghost.get(userId) === true,
    interestTags: tags.get(userId) ?? [],
    groupIds: groupIds.get(userId) ?? [],
  }));
}

export async function loadTeaserConnections(
  admin: SupabaseClient,
  userIds: string[],
): Promise<TeaserConnection[]> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const { data, error } = await admin
    .from('connections')
    .select('user_ids, status, expiry_state')
    .overlaps('user_ids', unique);
  if (error || !Array.isArray(data)) return [];

  const out: TeaserConnection[] = [];
  for (const row of data) {
    if (!isRecord(row) || !Array.isArray(row.user_ids)) continue;
    const ids = row.user_ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (ids.length !== 2) continue;
    out.push({
      userA: ids[0],
      userB: ids[1],
      active: isActiveIshConnection({
        status: typeof row.status === 'string' ? row.status : null,
        expiry_state: typeof row.expiry_state === 'string' ? row.expiry_state : null,
      }),
    });
  }
  return out;
}

export async function regenerateEventTeasers(
  admin: SupabaseClient,
  beaconId: string,
  matchedUserIds: string[],
): Promise<number> {
  const unique = [...new Set(matchedUserIds.filter(Boolean))];
  await admin.from('event_teasers').delete().eq('beacon_id', beaconId);
  if (unique.length === 0) return 0;

  const [profiles, connections] = await Promise.all([
    loadTeaserProfiles(admin, unique),
    loadTeaserConnections(admin, unique),
  ]);
  const teasers = generateEventTeasers({ profiles, connections });
  if (teasers.length === 0) return 0;

  const rows = teasers.map((t) => ({
    beacon_id: beaconId,
    recipient_user_id: t.recipient_user_id,
    teaser_type: t.teaser_type,
    payload: t.payload,
    generated_at: new Date().toISOString(),
  }));
  const { error } = await admin.from('event_teasers').insert(rows);
  if (error) {
    throw new Error(`teaser insert: ${error.message}`);
  }
  return rows.length;
}

export function isTeaserPushDue(args: {
  nowMs: number;
  startMs: number;
  pushSentAt: string | null;
}): boolean {
  if (args.pushSentAt) return false;
  const hours24 = 24 * 60 * 60 * 1000;
  const hours48 = 48 * 60 * 60 * 1000;
  const untilStart = args.startMs - args.nowMs;
  return untilStart > hours24 && untilStart <= hours48;
}
