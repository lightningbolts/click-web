import { type SupabaseClient } from '@supabase/supabase-js';
import { ACTIVE_CONNECTIONS_DB_OR_FILTER } from '@/lib/dashboard/connectionStatus';

const INSIGHTS_QUERY_PARAM = 'includeInsights';
/** `active` (default) | `archived` — ignored when `includeInsights` is set */
export const STATUS_SCOPE_PARAM = 'statusScope';
/** Dashboard: one HTTP round-trip for active + archived + map (`?bundle=dashboard`). */
export const BUNDLE_PARAM = 'bundle';

export function isInsightsScope(searchParams: URLSearchParams): boolean {
  const v = searchParams.get(INSIGHTS_QUERY_PARAM);
  return v === '1' || v?.toLowerCase() === 'true';
}

type UserScopedSupabase = SupabaseClient;

/**
 * Per-user junction rows (`connection_archives`, `connection_hidden`).
 * If a table is missing from the schema cache, return [] so the main connections query still works.
 */
export function isJunctionTableOptionalError(error: { code?: string; message?: string }): boolean {
  const code = error.code;
  const msg = String(error.message || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    msg.includes('schema cache') ||
    msg.includes('does not exist')
  );
}

/**
 * Lazy-sweep stale rows into `connection_archives` for this user before any connections read.
 * Must run while the caller still holds a valid JWT so `auth.uid()` matches in the RPC.
 */
export async function sweepStaleConnectionsForUser(
  supabase: UserScopedSupabase,
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc('sweep_stale_connections_for_user', {
    target_user_id: userId,
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

export async function fetchJunctionConnectionIds(
  supabase: UserScopedSupabase,
  table: 'connection_archives' | 'connection_hidden' | 'connection_core',
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase.from(table).select('connection_id').eq('user_id', userId);

  if (!error) {
    const ids = (data ?? [])
      .map((row: { connection_id?: string }) => row.connection_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    return [...new Set(ids)];
  }

  if (isJunctionTableOptionalError(error)) {
    console.warn(`[connections GET] ${table} optional junction unavailable:`, error.message);
    return [];
  }

  console.error(`[connections GET] ${table} query failed:`, error.message);
  return [];
}

export function dedupeIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

/**
 * Dashboard surfaces only show the most recent encounters per connection; capping the
 * embedded rows keeps long-lived connections (hundreds of encounters) from inflating
 * every dashboard payload. Insights mode intentionally stays uncapped for analytics.
 */
export const DASHBOARD_ENCOUNTERS_PER_CONNECTION = 25;

export async function executeActiveConnectionsQuery(
  supabase: UserScopedSupabase,
  userId: string,
  excludedIds: string[],
  cursorLastMessageAt: number | null = null,
  limit = 50,
) {
  const cappedLimit = Math.min(200, Math.max(1, limit));
  let query = supabase
    .from('connections')
    .select('*, connection_encounters(*)')
    .contains('user_ids', [userId])
    .or(ACTIVE_CONNECTIONS_DB_OR_FILTER)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created', { ascending: false })
    .order('encountered_at', { ascending: false, referencedTable: 'connection_encounters' })
    .limit(DASHBOARD_ENCOUNTERS_PER_CONNECTION, { referencedTable: 'connection_encounters' })
    .limit(cappedLimit);

  if (cursorLastMessageAt != null && Number.isFinite(cursorLastMessageAt)) {
    query = query.or(
      `last_message_at.lt.${cursorLastMessageAt},and(last_message_at.is.null,created.lt.${cursorLastMessageAt})`,
    );
  }

  if (excludedIds.length > 0) {
    query = query.not('id', 'in', `(${excludedIds.join(',')})`);
  }

  return await query;
}

export function parseActiveConnectionsPagination(searchParams: URLSearchParams): {
  cursor: number | null;
  limit: number;
} {
  const limitRaw = searchParams.get('limit');
  let limit = 50;
  if (limitRaw != null) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (Number.isFinite(parsed)) {
      limit = Math.min(200, Math.max(1, parsed));
    }
  }
  const cursorRaw = searchParams.get('cursor')?.trim();
  const cursor =
    cursorRaw != null && /^\d+$/.test(cursorRaw) ? Number.parseInt(cursorRaw, 10) : null;
  return { cursor, limit };
}

export async function executeArchivedConnectionsQuery(
  supabase: UserScopedSupabase,
  userId: string,
  includeIds: string[],
) {
  if (includeIds.length === 0) {
    return { data: [], error: null };
  }

  return await supabase
    .from('connections')
    .select('*, connection_encounters(*)')
    .contains('user_ids', [userId])
    .in('id', includeIds)
    .order('created', { ascending: false })
    .order('encountered_at', { ascending: false, referencedTable: 'connection_encounters' })
    .limit(DASHBOARD_ENCOUNTERS_PER_CONNECTION, { referencedTable: 'connection_encounters' });
}

export async function executeMapConnectionsQuery(
  supabase: UserScopedSupabase,
  userId: string,
  hiddenForUser: string[],
) {
  const hiddenSet = new Set(hiddenForUser);
  let mapQuery = supabase
    .from('connections')
    .select('*, connection_encounters(*)')
    .contains('user_ids', [userId])
    .order('created', { ascending: false })
    .order('encountered_at', { ascending: false, referencedTable: 'connection_encounters' })
    .limit(DASHBOARD_ENCOUNTERS_PER_CONNECTION, { referencedTable: 'connection_encounters' });

  if (hiddenSet.size > 0) {
    mapQuery = mapQuery.not('id', 'in', `(${[...hiddenSet].join(',')})`);
  }

  return await mapQuery;
}
