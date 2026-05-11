/**
 * GET /api/users/[userId]/public-profile
 * Unauthenticated App Clip / deep-link preview: only non-sensitive display fields.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRoleClient } from '@/lib/server/supabaseServer';

function isUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

type PublicProfileRow = {
  name?: string | null;
  full_name?: string | null;
  image?: string | null;
  aura_colors?: string[] | null;
};

function displayName(row: PublicProfileRow): string {
  const n = typeof row.name === 'string' ? row.name.trim() : '';
  if (n) return n;
  const f = typeof row.full_name === 'string' ? row.full_name.trim() : '';
  if (f) return f;
  return 'Click member';
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId } = await context.params;
  const id = userId?.trim() ?? '';
  if (!id || !isUuidLike(id)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  const admin = createSupabaseServiceRoleClient();

  const { data, error } = await admin
    .from('users')
    .select('name, full_name, image, aura_colors')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('public-profile:', error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const row = data as PublicProfileRow;
  const aura = Array.isArray(row.aura_colors)
    ? row.aura_colors.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    : [];

  const body = {
    display_name: displayName(row),
    avatar_url: typeof row.image === 'string' && row.image.trim() ? row.image.trim() : null,
    aura_colors: aura.length > 0 ? aura : ['#6366f1', '#a855f7', '#ec4899'],
  };

  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
