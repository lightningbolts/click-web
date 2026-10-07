import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseBody } from '@/lib/api/parseBody';
import { displayNamesBodySchema } from '@/lib/api/schemas/user';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { resolveDisplayNames } from '@/lib/server/users/displayNames';

/**
 * Browser callers can send `Authorization: Bearer <access_token>`.
 * Cookie-based / SSR sessions use
 * `sb-<project-ref>-auth-token` with a JSON body containing access_token.
 */
function accessTokenFromRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  }

  const legacy =
    req.cookies.get('sb-access-token')?.value ||
    req.cookies.get('sb-lrgcwnmcscimkmslihxp-auth-token')?.value;
  if (legacy?.trim()) return legacy.trim();

  for (const { name, value } of req.cookies.getAll()) {
    if (!/^sb-[^-]+-auth-token$/.test(name) || !value) continue;
    const tryParse = (raw: string) => {
      try {
        const parsed = JSON.parse(raw) as { access_token?: string };
        const t = parsed?.access_token?.trim();
        return t || null;
      } catch {
        return null;
      }
    };
    const fromDecoded = tryParse(decodeURIComponent(value));
    if (fromDecoded) return fromDecoded;
    const direct = tryParse(value);
    if (direct) return direct;
  }

  return null;
}

async function getAuthUser(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnon) {
    return { user: null as any, error: 'Supabase env is not configured' };
  }

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false },
  });

  const token = accessTokenFromRequest(req);

  if (!token) return { user: null as any, error: 'Missing auth token' };

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { user: null as any, error: 'Unauthorized' };

  return { user, error: null as string | null };
}

export async function POST(req: NextRequest) {
  // Preserve the route's legacy cookie parsing, but use the shared local-JWKS path for
  // bearer clients (iOS/KMP/web BFF calls) instead of forcing Supabase Auth over the network.
  const hasBearer = /^Bearer\s+/i.test(req.headers.get('Authorization') ?? '');
  const auth = hasBearer
    ? await getSupabaseFromRouteRequest(req).then(({ user, authError }) => ({
        user,
        error: authError?.message ?? null,
      }))
    : await getAuthUser(req);
  const { user, error: authError } = auth;
  if (!user) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  const parsed = await parseBody(req, displayNamesBodySchema);
  if (!parsed.ok) {
    // Prior handler treated missing/empty userIds (and bad JSON) as empty maps
    return NextResponse.json({ names: {}, images: {} });
  }
  const body = parsed.data;
  const requestedIds = Array.isArray(body.userIds)
    ? body.userIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];

  try {
    return NextResponse.json(await resolveDisplayNames(requestedIds));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lookup failed' }, { status: 500 });
  }
}
