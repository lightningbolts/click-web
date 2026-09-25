import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseBody } from '@/lib/api/parseBody';
import { displayNamesBodySchema } from '@/lib/api/schemas/user';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';

type UserRow = {
  id: string;
  name?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  image?: string | null;
};

const GENERIC_NAMES = new Set(['user', 'connection', 'unknown']);

const sanitize = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
};

const isGenericName = (value: string | null | undefined): boolean => {
  const normalized = (value || '').trim().toLowerCase();
  return !normalized || GENERIC_NAMES.has(normalized);
};

export async function POST(req: NextRequest) {
  // Use the shared bearer/cookie auth path so ES256 mobile/web bearer tokens are verified
  // locally against cached Supabase JWKS instead of forcing an Auth network round-trip.
  const { user, authError } = await getSupabaseFromRouteRequest(req);
  if (!user || authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

  const userIds: string[] = Array.from(new Set<string>(requestedIds)).slice(0, 100);
  if (userIds.length === 0) {
    return NextResponse.json({ names: {}, images: {} });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fallbackKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || (!serviceRole && !fallbackKey)) {
    return NextResponse.json({ error: 'Supabase env is not configured' }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceRole || fallbackKey!, {
    auth: { persistSession: false },
  });

  const usersWithFullName = await admin
    .from('users')
    .select('id, name, full_name, first_name, last_name, email, image')
    .in('id', userIds);

  const userRows: UserRow[] = usersWithFullName.error
    ? ((await admin.from('users').select('id, name, full_name, email, image').in('id', userIds)).data as UserRow[] ?? [])
    : (usersWithFullName.data as UserRow[] ?? []);

  const names: Record<string, string> = {};
  const images: Record<string, string | null> = {};

  userRows.forEach((row) => {
    const img = sanitize(row.image);
    images[row.id] = img;

    const fromParts = [row.first_name, row.last_name]
      .map((x) => sanitize(x))
      .filter(Boolean)
      .join(' ')
      .trim();
    const resolved = fromParts || sanitize(row.full_name) || sanitize(row.name);
    if (resolved) {
      names[row.id] = resolved;
      return;
    }

    const emailPrefix = sanitize(row.email?.split('@')[0]);
    if (emailPrefix && !isGenericName(emailPrefix)) {
      names[row.id] = emailPrefix;
    }
  });

  if (serviceRole) {
    const unresolvedIds = userIds.filter((id) => isGenericName(names[id]));

    if (unresolvedIds.length > 0) {
      await Promise.all(
        unresolvedIds.map(async (id) => {
          try {
            const { data, error } = await admin.auth.admin.getUserById(id);
            if (error || !data?.user) return;

            const meta = data.user.user_metadata || {};
            const fn = sanitize(meta.first_name as string | undefined);
            const ln = sanitize(meta.last_name as string | undefined);
            const combined = [fn, ln].filter(Boolean).join(' ').trim();
            const fullName =
              combined ||
              sanitize((meta.full_name as string | undefined) || (meta.name as string | undefined));
            if (fullName) {
              names[id] = fullName;
            }
          } catch {
            // Ignore per-user lookup failures.
          }
        })
      );
    }
  }

  return NextResponse.json({ names, images });
}
