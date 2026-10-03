import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { displayNameFromUser, type UserProfileRow } from '@/lib/events/attendeeDirectory';
import { eventDescriptionFromMetadata, eventDisplayTitle, eventTitleFromMetadata } from '@/lib/events/eventMetadata';
import type { ReactionKind } from '@/lib/server/reactionLists';

/**
 * The activity inbox (`activity_items`). Alert pushes are recorded by `send-push-notification`;
 * in-app-only activity (reactions, RSVPs) is recorded here. Both go through `record_activity`.
 */

export const ACTIVITY_PAGE_SIZE = 40;

export type ActivityRecord = {
  userId: string;
  type: string;
  title: string;
  body?: string;
  /** String values only: clients route a tap with the same code as a push tap. */
  data: Record<string, string>;
  actorId?: string | null;
  groupKey?: string | null;
};

export type ActivityItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  created_at: string;
  actor: { id: string; name: string; avatar_url: string | null } | null;
};

/** Never throws: activity is a side effect and must not fail the action that caused it. */
export async function recordActivity(admin: SupabaseClient, record: ActivityRecord): Promise<void> {
  if (record.actorId && record.actorId === record.userId) return;
  const { error } = await admin.rpc('record_activity', {
    p_user_id: record.userId,
    p_type: record.type,
    p_title: record.title,
    p_body: record.body ?? '',
    p_data: record.data,
    p_actor_id: record.actorId ?? null,
    p_group_key: record.groupKey ?? null,
  });
  if (error) console.warn('[activity] record:', record.type, error.message);
}

/** "Maya", "Maya and 1 other", "Maya and 3 others". */
export function withOthers(name: string, total: number): string {
  const others = total - 1;
  if (others <= 0) return name;
  return `${name} and ${others} ${others === 1 ? 'other' : 'others'}`;
}

function firstName(user: UserProfileRow | null): string {
  return user?.first_name?.trim() || displayNameFromUser(user, 'Someone').split(' ')[0];
}

async function loadUser(admin: SupabaseClient, id: string): Promise<UserProfileRow | null> {
  const { data } = await admin.from('users').select('id, name, image, first_name, last_name').eq('id', id).maybeSingle();
  return (data as UserProfileRow | null) ?? null;
}

/** A reaction on someone's drop or soundtrack: one row per target, newest reactor on top. */
export async function recordReactionActivity(
  admin: SupabaseClient,
  args: { kind: ReactionKind; targetId: string; ownerId: string; actorId: string; emoji: string },
): Promise<void> {
  const [actor, { count }] = await Promise.all([
    loadUser(admin, args.actorId),
    admin.from('reactions').select('user_id', { count: 'exact', head: true }).eq('target_kind', args.kind).eq('target_id', args.targetId),
  ]);
  const total = Math.max(1, count ?? 1);
  const what = args.kind === 'shared_drop' ? 'your drop' : 'your soundtrack';
  await recordActivity(admin, {
    userId: args.ownerId,
    type: 'reaction',
    title: total === 1
      ? `${firstName(actor)} reacted ${args.emoji} to ${what}`
      : `${withOthers(firstName(actor), total)} reacted to ${what}`,
    data: { type: 'reaction', target_kind: args.kind, target_id: args.targetId, ...(args.kind === 'shared_drop' ? { drop_id: args.targetId } : {}) },
    actorId: args.actorId,
    groupKey: `reaction:${args.kind}:${args.targetId}`,
  });
}

/** Someone joined (or asked to join) your event: one row per event and kind. */
export async function recordRsvpActivity(
  admin: SupabaseClient,
  args: { beaconId: string; hostId: string; actorId: string; metadata: Record<string, unknown>; requested: boolean },
): Promise<void> {
  const event = eventDisplayTitle(eventTitleFromMetadata(args.metadata), null, eventDescriptionFromMetadata(args.metadata));
  const [actor, { count }] = await Promise.all([
    loadUser(admin, args.actorId),
    args.requested
      ? admin.from('event_rsvp_requests').select('user_id', { count: 'exact', head: true }).eq('beacon_id', args.beaconId).eq('status', 'pending')
      : admin.from('beacon_attendees').select('user_id', { count: 'exact', head: true }).eq('beacon_id', args.beaconId).neq('user_id', args.hostId),
  ]);
  const who = withOthers(firstName(actor), Math.max(1, count ?? 1));
  const plural = (count ?? 1) > 1;
  await recordActivity(admin, {
    userId: args.hostId,
    type: args.requested ? 'event_rsvp_request' : 'event_rsvp',
    title: args.requested ? `${who} ${plural ? 'want' : 'wants'} to join` : `${who} ${plural ? 'are' : 'is'} going`,
    body: event,
    data: { type: args.requested ? 'event_rsvp_request' : 'event_rsvp', beacon_id: args.beaconId },
    actorId: args.actorId,
    groupKey: `${args.requested ? 'rsvp_request' : 'rsvp'}:${args.beaconId}`,
  });
}

type ActivityRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  actor_id: string | null;
  created_at: string;
};

/**
 * A page of the viewer's activity, newest first, with actor identity inline. Items about people
 * either side has blocked are left out.
 */
export async function loadActivity(
  admin: SupabaseClient,
  userId: string,
  options: { before?: string | null; limit?: number } = {},
): Promise<{ items: ActivityItem[]; seen_at: string | null; next_before: string | null }> {
  const limit = options.limit ?? ACTIVITY_PAGE_SIZE;
  let query = admin
    .from('activity_items')
    .select('id, type, title, body, data, actor_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);
  if (options.before) query = query.lt('created_at', options.before);

  const [{ data, error }, { data: seen }, { data: blocks }] = await Promise.all([
    query,
    admin.from('activity_seen').select('seen_at').eq('user_id', userId).maybeSingle(),
    admin.from('user_blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
  ]);
  if (error) throw new Error(`activity read: ${error.message}`);

  const blocked = new Set(
    ((blocks ?? []) as Array<{ blocker_id: string; blocked_id: string }>).map((b) => (b.blocker_id === userId ? b.blocked_id : b.blocker_id)),
  );
  const rows = ((data ?? []) as ActivityRow[]).slice(0, limit);
  const visible = rows.filter((r) => !r.actor_id || !blocked.has(r.actor_id));
  const actorIds = [...new Set(visible.flatMap((r) => (r.actor_id ? [r.actor_id] : [])))];
  const { data: users } = actorIds.length
    ? await admin.from('users').select('id, name, image, first_name, last_name').in('id', actorIds)
    : { data: [] };
  const byId = new Map(((users ?? []) as UserProfileRow[]).map((u) => [u.id, u]));

  return {
    items: visible.map((r) => {
      const actor = r.actor_id ? byId.get(r.actor_id) ?? null : null;
      return {
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        data: Object.fromEntries(Object.entries(r.data ?? {}).map(([k, v]) => [k, String(v)])),
        created_at: r.created_at,
        actor: actor ? { id: actor.id, name: displayNameFromUser(actor, 'Someone'), avatar_url: actor.image } : null,
      };
    }),
    seen_at: (seen as { seen_at?: string } | null)?.seen_at ?? null,
    // Paging continues from the last row read (not the last shown), so blocked rows never
    // stall it. Null when this was the last page.
    next_before: (data ?? []).length > limit ? rows[rows.length - 1].created_at : null,
  };
}

/** Moves the viewer's "seen" mark forward (never back) to the newest item they were shown. */
export async function markActivitySeen(admin: SupabaseClient, userId: string, seenAt: string): Promise<void> {
  const clamped = new Date(Math.min(Date.parse(seenAt), Date.now())).toISOString();
  const { data } = await admin.from('activity_seen').select('seen_at').eq('user_id', userId).maybeSingle();
  const current = (data as { seen_at?: string } | null)?.seen_at;
  if (current && Date.parse(current) >= Date.parse(clamped)) return;
  const { error } = await admin.from('activity_seen').upsert({ user_id: userId, seen_at: clamped });
  if (error) throw new Error(`activity seen: ${error.message}`);
}
