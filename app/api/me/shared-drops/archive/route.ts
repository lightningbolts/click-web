import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRouteRequest } from '@/lib/server/supabaseRouteAuth';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { requireFeature } from '@/lib/server/featureFlags';
import { listSharedDropArchive, serializeSharedDrops, sharedDropsConfigFrom } from '@/lib/server/sharedDrops';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 60;

/**
 * GET /api/me/shared-drops/archive?before=<created_at>&limit=30 — every drop you can see behind
 * Home's "View all", newest first (`{ drops, next_before }`; `next_before` is null at the end).
 * Same shape as the strip, so developed drops carry their original and reactions inline.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { user, authError } = await getSupabaseFromRouteRequest(request);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = createAdminSupabaseClient();
    const feature = await requireFeature(admin, 'shared_drops', user.id);
    if (!feature.ok) return feature.response;

    const params = request.nextUrl.searchParams;
    const beforeParam = params.get('before');
    const before = beforeParam && !Number.isNaN(Date.parse(beforeParam)) ? beforeParam : null;
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(params.get('limit') ?? '', 10) || DEFAULT_LIMIT));

    const { rows, views, nextBefore } = await listSharedDropArchive(admin, user.id, sharedDropsConfigFrom(feature.config), { before, limit });
    return NextResponse.json(
      { drops: await serializeSharedDrops(admin, rows, user.id, views), next_before: nextBefore },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('GET /api/me/shared-drops/archive:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
