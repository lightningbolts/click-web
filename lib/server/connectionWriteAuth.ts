import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';

export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  // Never fall back to the anon key — that runs under RLS and surfaces as
  // "new row violates row-level security policy" on service-only tables
  // (system_friction_logs, push_tokens upserts, etc.).
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for admin client',
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isJunctionTableOptionalError(error: { code?: string; message?: string }): boolean {
  const code = error.code;
  const msg = String(error.message || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    msg.includes('schema cache') ||
    msg.includes('does not exist')
  );
}

type AuthOk = {
  ok: true;
  user: User;
  connectionId: string;
  participantIds: string[];
  admin: SupabaseClient;
};

type AuthFail = { ok: false; response: NextResponse };

/**
 * JWT from the request, then load `connections.user_ids` with the service role
 * and ensure the authenticated user is a participant. Call before any lifecycle mutation.
 */
export async function requireConnectionParticipant(
  request: NextRequest,
  rawConnectionId: unknown,
): Promise<AuthOk | AuthFail> {
  const { user, authError } = await getSupabaseFromRouteRequest(request);
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const connectionId =
    typeof rawConnectionId === 'string' ? rawConnectionId.trim() : '';
  if (!connectionId) {
    return { ok: false, response: NextResponse.json({ error: 'connection_id is required' }, { status: 400 }) };
  }

  const admin = createAdminClient();
  const { data: row, error: fetchError } = await admin
    .from('connections')
    .select('id, user_ids')
    .eq('id', connectionId)
    .maybeSingle();

  if (fetchError) {
    console.error('[connectionWriteAuth] lookup:', fetchError.message);
    return { ok: false, response: NextResponse.json({ error: fetchError.message }, { status: 400 }) };
  }

  const ids = (row?.user_ids as string[] | null)?.map((id) => id.trim()).filter((id) => id.length > 0) ?? [];
  if (!row || ids.length === 0 || !ids.includes(user.id)) {
    return { ok: false, response: NextResponse.json({ error: 'Connection not found' }, { status: 404 }) };
  }

  return { ok: true, user, connectionId, participantIds: ids, admin };
}
