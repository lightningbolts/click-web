import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DropKind } from '@/lib/drops/developState';
import { signDropObjects } from '@/lib/server/drops/storage';
import { resolveChatDrops } from '@/lib/server/drops/chatDrops';

/** A drop the viewer may see, with its reveal time and (if gated) the original's object path. */
export type ResolvedDrop = { revealAtMs: number; originalPath: string | null };

type Resolver = (admin: SupabaseClient, viewerId: string, ids: string[]) => Promise<Map<string, ResolvedDrop>>;

/** One resolver per kind; each returns only drops the viewer is authorized to see. */
const RESOLVERS: Partial<Record<DropKind, Resolver>> = {
  chat: resolveChatDrops,
};

export type DevelopItem = { kind: DropKind; id: string };

export type DevelopResult =
  | { kind: DropKind; id: string; status: 'not_found' }
  | { kind: DropKind; id: string; status: 'pending'; reveal_at: string }
  | { kind: DropKind; id: string; status: 'developed'; developed_at: string; url: string | null };

/**
 * Develops every ready drop in `items` for the viewer (idempotent: the first developed_at wins) and
 * returns a short-lived signed URL for each gated original. Pending drops stay pending — the
 * original is never signed before reveal_at. Unknown and forbidden drops are indistinguishable.
 */
export async function developDrops(
  admin: SupabaseClient,
  viewerId: string,
  items: DevelopItem[],
  nowMs: number = Date.now(),
): Promise<DevelopResult[]> {
  const byKind = new Map<DropKind, string[]>();
  for (const item of items) byKind.set(item.kind, [...(byKind.get(item.kind) ?? []), item.id]);

  const resolved = new Map<string, ResolvedDrop>();
  await Promise.all(
    [...byKind].map(async ([kind, ids]) => {
      const resolver = RESOLVERS[kind];
      if (!resolver) return;
      for (const [id, drop] of await resolver(admin, viewerId, [...new Set(ids)])) {
        resolved.set(`${kind}:${id}`, drop);
      }
    }),
  );

  const ready = items.filter((item) => {
    const drop = resolved.get(`${item.kind}:${item.id}`);
    return drop != null && drop.revealAtMs <= nowMs;
  });

  const developedAt = new Map<string, string>();
  if (ready.length > 0) {
    const rows = ready.map((item) => ({ drop_kind: item.kind, drop_id: item.id, viewer_id: viewerId }));
    const { error: upsertError } = await admin
      .from('drop_views')
      .upsert(rows, { onConflict: 'drop_kind,drop_id,viewer_id', ignoreDuplicates: true });
    if (upsertError) throw new Error(`drop_views upsert: ${upsertError.message}`);
    const { data, error } = await admin
      .from('drop_views')
      .select('drop_kind, drop_id, developed_at')
      .eq('viewer_id', viewerId)
      .in('drop_id', [...new Set(ready.map((item) => item.id))]);
    if (error) throw new Error(`drop_views read: ${error.message}`);
    for (const row of (data ?? []) as Array<{ drop_kind: string; drop_id: string; developed_at: string }>) {
      developedAt.set(`${row.drop_kind}:${row.drop_id}`, row.developed_at);
    }
  }

  const signed = await signDropObjects(
    admin,
    ready.flatMap((item) => resolved.get(`${item.kind}:${item.id}`)?.originalPath ?? []),
  );

  return items.map((item): DevelopResult => {
    const key = `${item.kind}:${item.id}`;
    const drop = resolved.get(key);
    if (!drop) return { kind: item.kind, id: item.id, status: 'not_found' };
    if (drop.revealAtMs > nowMs) {
      return { kind: item.kind, id: item.id, status: 'pending', reveal_at: new Date(drop.revealAtMs).toISOString() };
    }
    return {
      kind: item.kind,
      id: item.id,
      status: 'developed',
      developed_at: developedAt.get(key) ?? new Date(nowMs).toISOString(),
      url: drop.originalPath ? signed.get(drop.originalPath) ?? null : null,
    };
  });
}

/** The viewer's developed_at per drop id (own rows only; no access check needed). */
export async function loadDevelopedAt(
  admin: SupabaseClient,
  viewerId: string,
  kind: DropKind,
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data, error } = await admin
    .from('drop_views')
    .select('drop_id, developed_at')
    .eq('viewer_id', viewerId)
    .eq('drop_kind', kind)
    .in('drop_id', ids);
  if (error) throw new Error(`drop_views read: ${error.message}`);
  return Object.fromEntries(
    ((data ?? []) as Array<{ drop_id: string; developed_at: string }>).map((row) => [row.drop_id, row.developed_at]),
  );
}
