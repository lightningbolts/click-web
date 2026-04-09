import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

type AuthenticatedSupabaseResult = {
  token: string | null;
  user: User | null;
  supabase: SupabaseClient;
};

function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('Authorization');
  const fromHeader = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : authHeader?.trim() || null;
  if (fromHeader) return fromHeader;

  const authCookie =
    req.cookies.get('sb-access-token') ||
    req.cookies.get('sb-lrgcwnmcscimkmslihxp-auth-token');

  return authCookie?.value ?? null;
}

function createSupabaseClient(token?: string | null): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    global: token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined,
  });
}

export async function getAuthenticatedSupabase(req: NextRequest): Promise<AuthenticatedSupabaseResult> {
  const token = extractBearerToken(req);
  const supabase = createSupabaseClient(token);

  if (!token) {
    return { token: null, user: null, supabase };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { token, user: null, supabase };
  }

  return { token, user, supabase };
}