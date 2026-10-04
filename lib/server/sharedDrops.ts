import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { configNumber } from '@/lib/server/featureFlags';
import { loadViewerPeers } from '@/lib/server/connections/viewerPeers';
import { dropObjectPrefix, removeDropObjects, signDropObjects, uploadDropRenditions } from '@/lib/server/drops/storage';
import type { ResolvedDrop } from '@/lib/server/drops/develop';
import { displayNameFromUser, type UserProfileRow } from '@/lib/events/attendeeDirectory';
import { loadReactionsBatch } from '@/lib/server/reactionLists';
import {
  canSeeSharedDrop,
  isListable,
  selectStrip,
  type PosterView,
  type SharedAudience,
  type StripConfig,
} from '@/lib/drops/sharedAudience';

/** F3 — shared Click Drops. Audience is resolved here on every read; clients never decide it. */

export type SharedDropsConfig = StripConfig & { dailyCap: number; developHours: number };

export function sharedDropsConfigFrom(config: Record<string, unknown>): SharedDropsConfig {
  return {
    dailyCap: configNumber(config, 'daily_cap', 3, { min: 1, max: 20 }),
    developHours: configNumber(config, 'develop_hours', 1, { min: 1, max: 72 }),
    teaser: config.teaser === 'none' ? 'none' : 'pixelated',
    stripWindowHours: configNumber(config, 'strip_window_hours', 24, { min: 1, max: 168 }),
    stripMin: configNumber(config, 'strip_min', 25, { min: 1, max: 100 }),
    stripMax: configNumber(config, 'strip_max', 150, { min: 25, max: 200 }),
  };
}

export type SharedDropRow = {
  id: string;
  user_id: string;
  audience: SharedAudience;
  client_drop_id: string;
  original_path: string;
  preview_path: string;
  width: number | null;
  height: number | null;
  created_at: string;
  reveal_at: string;
  caption: string | null;
};

const DROP_COLUMNS = 'id, user_id, audience, client_drop_id, original_path, preview_path, width, height, created_at, reveal_at, caption';

/** A caption belongs to the photo: the poster always sees it, everyone else once it develops. */
export function visibleCaption(row: Pick<SharedDropRow, 'user_id' | 'reveal_at' | 'caption'>, viewerId: string, nowMs = Date.now()): string | null {
  if (!row.caption) return null;
  return row.user_id === viewerId || Date.parse(row.reveal_at) <= nowMs ? row.caption : null;
}

/**
 * For each poster, how the viewer and that poster stand right now: connected on the viewer's
 * side (active, not hidden, not blocked either way), kept on the poster's side, and core. Archived
 * chats still count: archiving tidies the inbox (and happens automatically after a quiet week).
 */
export async function loadPosterViews(
  admin: SupabaseClient,
  viewerId: string,
  posterIds: string[],
): Promise<Map<string, PosterView & { connectionId: string }>> {
  const out = new Map<string, PosterView & { connectionId: string }>();
  if (posterIds.length === 0) return out;
  const peers = await loadViewerPeers(admin, viewerId, { includeArchived: true });
  const connected = posterIds.filter((id) => peers.has(id));
  if (connected.length === 0) return out;
  const connectionIds = connected.map((id) => peers.get(id)!.connectionId);
  const pairs = async (table: string) => {
    const { data, error } = await admin
      .from(table)
      .select('user_id, connection_id')
      .in('user_id', connected)
      .in('connection_id', connectionIds);
    if (error) throw new Error(`shared audience ${table}: ${error.message}`);
    return new Set(((data ?? []) as Array<{ user_id: string; connection_id: string }>).map((r) => `${r.user_id}:${r.connection_id}`));
  };
  const [hidden, core] = await Promise.all([pairs('connection_hidden'), pairs('connection_core')]);
  for (const posterId of connected) {
    const key = `${posterId}:${peers.get(posterId)!.connectionId}`;
    out.set(posterId, {
      connectionId: peers.get(posterId)!.connectionId,
      viewerConnected: true,
      posterKeepsConnection: !hidden.has(key),
      posterMarkedCore: core.has(key),
    });
  }
  return out;
}

type DropPage = { rows: SharedDropRow[]; views: Map<string, PosterView & { connectionId: string }> };

/**
 * Your drops and the connections' drops you may see, newest first, older than `before` when given.
 * Reads `fetch` rows per batch of authors; returns them with their poster views, audience applied.
 * `cutoff`: when a batch filled up, the oldest time every batch is complete to (rows past it are
 * dropped, the next page starts there); null when everything was read.
 */
async function readVisibleDrops(
  admin: SupabaseClient,
  viewerId: string,
  fetch: number,
  before: string | null,
): Promise<DropPage & { cutoff: string | null }> {
  const peers = await loadViewerPeers(admin, viewerId, { includeArchived: true });
  const authors = [viewerId, ...peers.keys()];
  let rows: SharedDropRow[] = [];
  let cutoff: string | null = null;
  for (let i = 0; i < authors.length; i += 200) {
    let query = admin
      .from('shared_drops')
      .select(DROP_COLUMNS)
      .in('user_id', authors.slice(i, i + 200))
      .is('deleted_at', null);
    if (before) query = query.lt('created_at', before);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(fetch);
    if (error) throw new Error(`shared drops read: ${error.message}`);
    const batch = (data ?? []) as SharedDropRow[];
    const last = batch[batch.length - 1];
    if (batch.length === fetch && last && (!cutoff || Date.parse(last.created_at) > Date.parse(cutoff))) cutoff = last.created_at;
    rows.push(...batch);
  }
  if (cutoff) rows = rows.filter((r) => Date.parse(r.created_at) >= Date.parse(cutoff!));
  rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const views = await loadPosterViews(admin, viewerId, [...new Set(rows.map((r) => r.user_id))].filter((id) => id !== viewerId));
  const visible = rows.filter((r) => r.user_id === viewerId || canSeeSharedDrop(r.audience, views.get(r.user_id)));
  return { rows: visible, views, cutoff };
}

const candidate = (r: SharedDropRow) => ({ ...r, userId: r.user_id, createdAtMs: Date.parse(r.created_at), revealAtMs: Date.parse(r.reveal_at) });

/** The Home strip: the last day's drops, or the newest `stripMin` when the day was quieter. */
export async function listSharedDropStrip(
  admin: SupabaseClient,
  viewerId: string,
  config: SharedDropsConfig,
  nowMs: number = Date.now(),
): Promise<DropPage> {
  const { rows, views } = await readVisibleDrops(admin, viewerId, config.stripMax, null);
  return { rows: selectStrip(rows.map(candidate), viewerId, nowMs, config), views };
}

/**
 * One page of every drop you can see (the archive behind "View all"), newest first. `nextBefore`
 * is the cursor for the next page, null at the end.
 */
export async function listSharedDropArchive(
  admin: SupabaseClient,
  viewerId: string,
  config: SharedDropsConfig,
  args: { before: string | null; limit: number },
  nowMs: number = Date.now(),
): Promise<DropPage & { nextBefore: string | null }> {
  const { rows, views, cutoff } = await readVisibleDrops(admin, viewerId, args.limit, args.before);
  const page = rows.filter((r) => isListable(candidate(r), viewerId, nowMs, config.teaser)).slice(0, args.limit);
  // A full page continues after its last drop; a short one after what was read, so drops this
  // viewer can't see never stall paging.
  const nextBefore = page.length === args.limit ? page[page.length - 1].created_at : cutoff;
  return { rows: page, views, nextBefore };
}

export async function serializeSharedDrops(
  admin: SupabaseClient,
  rows: SharedDropRow[],
  viewerId: string,
  views: Map<string, { connectionId: string }>,
) {
  if (rows.length === 0) return [];
  const [{ data: users }, { data: developed }] = await Promise.all([
    admin.from('users').select('id, name, image, first_name, last_name').in('id', [...new Set(rows.map((r) => r.user_id))]),
    admin.from('drop_views').select('drop_id, developed_at').eq('viewer_id', viewerId).eq('drop_kind', 'shared').in('drop_id', rows.map((r) => r.id)),
  ]);
  const byId = new Map(((users ?? []) as UserProfileRow[]).map((u) => [u.id, u]));
  const developedAt = new Map(((developed ?? []) as Array<{ drop_id: string; developed_at: string }>).map((r) => [r.drop_id, r.developed_at]));
  // Drops this viewer already developed ship their original and reactions inline, so the strip
  // and viewer paint in one round trip (no develop call, no per-drop reactions request).
  const opened = rows.filter((r) => developedAt.has(r.id));
  const [signed, reactions] = await Promise.all([
    signDropObjects(admin, [...rows.map((r) => r.preview_path), ...opened.map((r) => r.original_path)]),
    loadReactionsBatch(admin, 'shared_drop', opened.map((r) => ({ id: r.id, ownerId: r.user_id })), viewerId),
  ]);
  return rows.map((r) => {
    const mine = r.user_id === viewerId;
    const poster = byId.get(r.user_id) ?? null;
    return {
      id: r.id,
      user: { id: r.user_id, name: displayNameFromUser(poster, 'Someone'), avatar_url: poster?.image ?? null },
      is_mine: mine,
      // Only the poster sees who a drop went to; a reply opens the existing 1-1 chat.
      audience: mine ? r.audience : undefined,
      connection_id: mine ? null : views.get(r.user_id)?.connectionId ?? null,
      created_at: r.created_at,
      reveal_at: r.reveal_at,
      developed_at: developedAt.get(r.id) ?? null,
      width: r.width,
      height: r.height,
      preview_url: signed.get(r.preview_path) ?? null,
      original_url: developedAt.has(r.id) ? signed.get(r.original_path) ?? null : null,
      reactions: reactions.get(r.id) ?? null,
      caption: visibleCaption(r, viewerId),
    };
  });
}

/** `/api/drops/develop` resolver for shared drops: the poster, or anyone the audience admits now. */
export async function resolveSharedDrops(
  admin: SupabaseClient,
  viewerId: string,
  ids: string[],
): Promise<Map<string, ResolvedDrop>> {
  const out = new Map<string, ResolvedDrop>();
  const { data, error } = await admin.from('shared_drops').select(DROP_COLUMNS).in('id', ids).is('deleted_at', null);
  if (error) throw new Error(`shared drops resolve: ${error.message}`);
  const rows = (data ?? []) as SharedDropRow[];
  const views = await loadPosterViews(admin, viewerId, [...new Set(rows.map((r) => r.user_id))].filter((id) => id !== viewerId));
  for (const r of rows) {
    if (r.user_id === viewerId || canSeeSharedDrop(r.audience, views.get(r.user_id))) {
      out.set(r.id, { revealAtMs: Date.parse(r.reveal_at), originalPath: r.original_path });
    }
  }
  return out;
}

export async function insertSharedDrop(
  admin: SupabaseClient,
  args: {
    userId: string;
    audience: SharedAudience;
    clientDropId: string;
    mimeType: string;
    original: Buffer;
    preview: Buffer;
    width: number | null;
    height: number | null;
    caption: string | null;
    config: SharedDropsConfig;
  },
): Promise<{ row: SharedDropRow } | { error: 'cap_reached' | 'duplicate' | 'failed' }> {
  const uploaded = await uploadDropRenditions(
    admin,
    dropObjectPrefix('shared', args.userId, args.userId),
    args.mimeType,
    args.original,
    args.preview,
  );
  if (!uploaded) return { error: 'failed' };
  const { data, error } = await admin
    .from('shared_drops')
    .insert({
      user_id: args.userId,
      audience: args.audience,
      client_drop_id: args.clientDropId,
      original_path: uploaded.originalPath,
      preview_path: uploaded.previewPath,
      width: args.width,
      height: args.height,
      caption: args.caption,
      reveal_at: new Date(Date.now() + args.config.developHours * 3_600_000).toISOString(),
    })
    .select(DROP_COLUMNS)
    .single();
  if (error) {
    await removeDropObjects(admin, [uploaded.originalPath, uploaded.previewPath]);
    if (error.code === '23514') return { error: 'cap_reached' };
    if (error.code === '23505') return { error: 'duplicate' };
    console.error('[sharedDrops] insert:', error.message);
    return { error: 'failed' };
  }
  return { row: data as SharedDropRow };
}

export async function findSharedDropByClientId(
  admin: SupabaseClient,
  userId: string,
  clientDropId: string,
): Promise<SharedDropRow | null> {
  const { data } = await admin
    .from('shared_drops')
    .select(DROP_COLUMNS)
    .eq('user_id', userId)
    .eq('client_drop_id', clientDropId)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as SharedDropRow | null) ?? null;
}

/** Soft-deletes the poster's drop and removes its media. False when it isn't theirs. */
export async function deleteSharedDrop(admin: SupabaseClient, dropId: string, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('shared_drops')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', dropId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('original_path, preview_path')
    .maybeSingle();
  if (error) throw new Error(`shared drop delete: ${error.message}`);
  const row = data as { original_path: string; preview_path: string } | null;
  if (!row) return false;
  await removeDropObjects(admin, [row.original_path, row.preview_path]);
  return true;
}
