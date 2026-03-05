import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type UserRow = {
  id: string;
  name?: string | null;
  full_name?: string | null;
  email?: string | null;
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

async function getAuthUser(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnon) {
    return { user: null as any, error: 'Supabase env is not configured' };
  }

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false },
  });

  const authCookie =
    req.cookies.get('sb-access-token') ||
    req.cookies.get('sb-lrgcwnmcscimkmslihxp-auth-token');
  const authHeader = req.headers.get('Authorization');
  const token = authCookie?.value ?? authHeader?.replace('Bearer ', '');

  if (!token) return { user: null as any, error: 'Missing auth token' };

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { user: null as any, error: 'Unauthorized' };

  return { user, error: null as string | null };
}

export async function POST(req: NextRequest) {
  const { user, error: authError } = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const requestedIds = Array.isArray(body?.userIds)
    ? body.userIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];

  const userIds: string[] = Array.from(new Set<string>(requestedIds)).slice(0, 100);
  if (userIds.length === 0) {
    return NextResponse.json({ names: {} });
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
    .select('id, name, full_name, email')
    .in('id', userIds);

  const userRows: UserRow[] = usersWithFullName.error
    ? ((await admin.from('users').select('id, name, email').in('id', userIds)).data as UserRow[] ?? [])
    : (usersWithFullName.data as UserRow[] ?? []);

  const names: Record<string, string> = {};

  userRows.forEach((row) => {
    const resolved = sanitize(row.full_name) || sanitize(row.name);
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
            const fullName = sanitize((meta.full_name as string | undefined) || (meta.name as string | undefined));
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

  return NextResponse.json({ names });
}
