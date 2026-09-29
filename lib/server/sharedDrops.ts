import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { configNumber } from '@/lib/server/featureFlags';
import { loadViewerPeers } from '@/lib/server/connections/viewerPeers';
import { dropObjectPrefix, removeDropObjects, signDropObjects, uploadDropRenditions } from '@/lib/server/drops/storage';
import type { ResolvedDrop } from '@/lib/server/drops/develop';
import { displayNameFromUser, type UserProfileRow } from '@/lib/events/attendeeDirectory';
import {
  canSeeSharedDrop,
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
    developHours: configNumber(config, 'develop_hours', 24, { min: 1, max: 72 }),
    teaser: config.teaser === 'none' ? 'none' : 'pixelated',
    stripDays: configNumber(config, 'strip_days', 7, { min: 1, max: 30 }),
    stripLimit: configNumber(config, 'strip_limit', 12, { min: 1, max: 50 }),
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
};

const DROP_COLUMNS = 'id, user_id, audience, client_drop_id, original_path, preview_path, width, height, created_at, reveal_at';

/**
 * For each poster, how the viewer and that poster stand right now: connected on the viewer's
 * side (active, not archived/hidden, not blocked either way), kept on the poster's side, and core.
 */
export async function loadPosterViews(
  admin: SupabaseClient,
  viewerId: string,
  posterIds: string[],
): Promise<Map<string, PosterView & { connectionId: string }>> {
  const out = new Map<string, PosterView & { connectionId: string }>();
  if (posterIds.length === 0) return out;
  const peers = await loadViewerPeers(admin, viewerId);
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
  const [archived, hidden, core] = await Promise.all([
    pairs('connection_archives'),
    pairs('connection_hidden'),
    pairs('connection_core'),
  ]);
  for (const posterId of connected) {
    const key = `${posterId}:${peers.get(posterId)!.connectionId}`;
    out.set(posterId, {
      connectionId: peers.get(posterId)!.connectionId,
      viewerConnected: true,
      posterKeepsConnection: !archived.has(key) && !hidden.has(key),
      posterMarkedCore: core.has(key),
    });
  }
  return out;
}

/** Your own recent drops plus your connections' drops you may see, bounded for the Home strip. */
export async function listSharedDropStrip(
  admin: SupabaseClient,
  viewerId: string,
  config: SharedDropsConfig,
  nowMs: number = Date.now(),
): Promise<{ rows: SharedDropRow[]; views: Map<string, PosterView & { connectionId: string }> }> {
  const peers = await loadViewerPeers(admin, viewerId);
  const since = new Date(nowMs - config.stripDays * 86_400_000).toISOString();
  const authors = [viewerId, ...peers.keys()];
  const rows: SharedDropRow[] = [];
  for (let i = 0; i < authors.length; i += 200) {
    const { data, error } = await admin
      .from('shared_drops')
      .select(DROP_COLUMNS)
      .in('user_id', authors.slice(i, i + 200))
      .is('deleted_at', null)
      .gt('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(`shared drops read: ${error.message}`);
    rows.push(...((data ?? []) as SharedDropRow[]));
  }
  const views = await loadPosterViews(admin, viewerId, [...new Set(rows.map((r) => r.user_id))].filter((id) => id !== viewerId));
  const visible = rows.filter((r) => r.user_id === viewerId || canSeeSharedDrop(r.audience, views.get(r.user_id)));
  const strip = selectStrip(
    visible.map((r) => ({ ...r, userId: r.user_id, createdAtMs: Date.parse(r.created_at), revealAtMs: Date.parse(r.reveal_at) })),
    viewerId,
    nowMs,
    config,
  );
  return { rows: strip, views };
}

export async function serializeSharedDrops(
  admin: SupabaseClient,
  rows: SharedDropRow[],
  viewerId: string,
  views: Map<string, { connectionId: string }>,
) {
  if (rows.length === 0) return [];
  const [{ data: users }, previews, { data: developed }] = await Promise.all([
    admin.from('users').select('id, name, image, first_name, last_name').in('id', [...new Set(rows.map((r) => r.user_id))]),
    signDropObjects(admin, rows.map((r) => r.preview_path)),
    admin.from('drop_views').select('drop_id, developed_at').eq('viewer_id', viewerId).eq('drop_kind', 'shared').in('drop_id', rows.map((r) => r.id)),
  ]);
  const byId = new Map(((users ?? []) as UserProfileRow[]).map((u) => [u.id, u]));
  const developedAt = new Map(((developed ?? []) as Array<{ drop_id: string; developed_at: string }>).map((r) => [r.drop_id, r.developed_at]));
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
      preview_url: previews.get(r.preview_path) ?? null,
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
